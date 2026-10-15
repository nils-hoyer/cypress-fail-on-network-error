import { AssertionError } from 'chai';

const prefix = 'cypress-fail-on-network-error:';

export type Config = {
    ignoreRequests?: (string | RequestMatcher | RequestPredicate)[];
    /** @deprecated Use `ignoreRequests`. When both are set, `requests` wins. */
    requests?: (string | RequestMatcher | RequestPredicate)[];
    // also log each ignored request, with the entry that ignored it
    debug?: boolean;
};

// the common methods, for autocompletion; any other method works too
export type Method =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'DELETE'
    | 'PATCH'
    | 'HEAD'
    | 'OPTIONS'
    | (string & {});

export interface RequestMatcher {
    url?: string | RegExp;
    // a list matches any of its methods
    method?: Method | Method[];
    status?: number | Range;
    // excludes the request when it returns true
    predicate?: RequestPredicate;
}

// an entry of its own is shorthand for { predicate }
export type RequestPredicate = (request: RequestSession) => boolean;

/**
 * @deprecated Use `RequestMatcher`. `Request` hides the built-in fetch
 * `Request` type in files that import it.
 */
export type Request = RequestMatcher;

export type Range = {
    from: number;
    to: number;
};

// an entry as getConfig() returns it: a string is { url }, a function
// { predicate }, a status a range and the method upper case
export type NormalizedRequest = {
    url?: string | RegExp;
    method?: RequestMatcher['method'];
    status?: Range;
    predicate?: RequestPredicate;
};

export type NormalizedConfig = {
    ignoreRequests: NormalizedRequest[];
    /** @deprecated Use `ignoreRequests`, which this reads and sets. */
    requests: NormalizedRequest[];
    debug: boolean;
};

// the active call's marker, stored on the Cypress object under a global
// symbol, because the support file and a spec can be separate bundles, each
// with its own copy of this module
const activeInstanceKey = Symbol.for('cypress-fail-on-network-error');

export default function failOnNetworkError(_config: Config = {}) {
    let config: NormalizedConfig;
    let originConfig: NormalizedConfig;
    let requests: RequestSession[] = [];
    // requests checked since the last command:end, which logs them and throws
    // for those that matched no entry; ignored ones only with debug
    let checkedRequests: CheckedRequest[] = [];
    // set when a predicate threw, until the next command:end throws
    let predicateError: Error | undefined;

    const getRequests = () => requests;

    const getConfig = (): NormalizedConfig => config;
    const setConfig = (_config: Config): void => {
        validateConfig(_config);
        config = createConfig(_config);
        // a separate copy, so changes to getConfig() cannot leak into later tests
        originConfig = originConfig ?? createConfig(config);
    };

    const waitForRequests = (timeout = 10000): Cypress.Chainable<any> => {
        const requestsDone = () =>
            getRequests().every(
                (request: RequestSession) =>
                    request.status !== undefined ||
                    request.error !== undefined ||
                    request.cancelled === true
            );

        // create the promise when the command runs, not when it is queued,
        // and give Cypress's command timeout slack beyond our own timeout
        return cy
            .wrap(null, { log: false })
            .then({ timeout: timeout + 1000 }, () =>
                waitUntil(requestsDone, timeout)
            );
    };

    setConfig(_config);

    // a later call replaces this one, so a call in beforeEach or in a spec
    // does not add another set of listeners that checks every request too
    const instance = {};
    const cypress = Cypress as unknown as Record<symbol, object | undefined>;
    if (cypress[activeInstanceKey] !== undefined)
        console.warn(
            `${prefix} failOnNetworkError() was called more than once, so only the latest call checks requests. Call it once, in the support file.`
        );
    cypress[activeInstanceKey] = instance;
    const isActive = () => cypress[activeInstanceKey] === instance;

    Cypress.on('request:event', (eventName, event) => {
        if (!isActive()) return;
        if (eventName === 'incoming:request') {
            // check only XHR and fetch, like Cypress's command log; a request
            // without a resource type is checked as before
            const checkedResourceTypes = ['xhr', 'fetch', undefined];
            if (checkedResourceTypes.indexOf(event.resourceType) === -1) return;

            requests.push({
                requestId: event.requestId,
                method: event.method,
                url: event.url,
                status: undefined,
            });
            return;
        }

        const subscribedEvents = ['request:error', 'response:received'];
        // a request from an earlier test was cleared by test:after:run
        const unknownRequest =
            findRequest(requests, event.requestId) === undefined;

        if (subscribedEvents.indexOf(eventName) === -1 || unknownRequest)
            return;

        // the page aborted the request or navigated away: not a network error
        if (
            eventName === 'request:error' &&
            isCancelledByBrowser(event.error?.message)
        ) {
            requests = requests.map((request: RequestSession) =>
                request.requestId === event.requestId
                    ? { ...request, cancelled: true }
                    : request
            );
            return;
        }

        requests = requests.map((request: RequestSession) => {
            if (request.requestId !== event.requestId) return request;
            return eventName === 'response:received'
                ? { ...request, status: event.status }
                : {
                      ...request,
                      error:
                          event.error?.message ??
                          'request failed without a response',
                  };
        });

        const request = findRequest(
            requests,
            event.requestId
        ) as RequestSession;
        try {
            const entries = getConfig().ignoreRequests;
            const ignoredBy = findIgnoringEntry(request, getConfig());
            if (ignoredBy === undefined || getConfig().debug)
                checkedRequests.push({
                    request,
                    ignoredBy,
                    entries: [...entries],
                });
        } catch (error) {
            // a broken predicate is a mistake in the config, not a failed check
            predicateError = invalid(
                `a predicate in ignoreRequests threw on ${request.method} ${request.url}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    });

    // request:event arrives from the server outside the command queue, where
    // a thrown error is an uncaught exception that uncaught:exception handlers
    // can hide. command:end runs inside the queue and fails the command.
    Cypress.on('command:end', () => {
        if (!isActive()) return;
        const checked = checkedRequests;
        checkedRequests = [];
        checked.forEach(logCheckedRequest);

        if (predicateError !== undefined) {
            const error = predicateError;
            predicateError = undefined;
            throw error;
        }
        const failed = checked.filter(({ ignoredBy }) => !ignoredBy);
        if (failed.length === 0) return;
        throw new AssertionError(
            `${prefix}\n${failed.map(({ request }) => requestToString(request)).join('\n')}`
        );
    });

    // Electron and Firefox send no event for a request that the browser
    // cancels when the page unloads, so waitForRequests would wait for it
    // until its timeout. A response that still arrives is checked.
    Cypress.on('window:unload', () => {
        if (!isActive()) return;
        requests = requests.map((request: RequestSession) =>
            request.status === undefined && request.error === undefined
                ? { ...request, cancelled: true }
                : request
        );
    });

    Cypress.on('test:after:run', () => {
        if (!isActive()) return;
        setConfig(originConfig);
        requests = [];
        checkedRequests = [];
        predicateError = undefined;
    });

    return {
        getConfig,
        setConfig,
        waitForRequests,
    };
}

// requests is the deprecated name of ignoreRequests
const configKeys = ['ignoreRequests', 'requests', 'debug'];
const requestKeys = ['url', 'method', 'status', 'predicate'];

// a broken config is not a failed check, so it throws an Error, not an AssertionError
const invalid = (message: string) => new Error(`${prefix} ${message}`);

// the type name for messages, like type-detect: null, a primitive's typeof,
// or the built-in class of an object (Object, Array, RegExp, Date)
const typeName = (value: unknown): string => {
    if (value === null) return 'null';
    if (typeof value !== 'object') return typeof value;
    return Object.prototype.toString.call(value).slice(8, -1);
};

const expectType = (value: unknown, types: string[], message: string) => {
    if (types.indexOf(typeName(value)) === -1)
        throw invalid(`${message}, got ${typeName(value)}`);
};

export const validateConfig = (config: Config): void => {
    expectType(config, ['Object'], 'config must be an object');
    // a misspelled option would otherwise be ignored, and every request fail
    const unknownConfigKeys = Object.keys(config).filter(
        (key) => configKeys.indexOf(key) === -1
    );
    if (unknownConfigKeys.length > 0)
        throw invalid(
            `config has unknown keys ${unknownConfigKeys.join(', ')}, use ignoreRequests or debug`
        );
    // errors name the key the user passed
    validateRequests(config.ignoreRequests, 'config.ignoreRequests');
    validateRequests(config.requests, 'config.requests');
    expectType(
        config.debug,
        ['boolean', 'undefined'],
        'config.debug must be a boolean'
    );
};

const validateRequests = (requests: unknown, key: string): void => {
    expectType(requests, ['Array', 'undefined'], `${key} must be an array`);

    (requests as unknown[] | undefined)?.forEach((_request, index) => {
        const name = `${key}[${index}]`;
        expectType(
            _request,
            ['string', 'Object', 'function'],
            `${name} must be a string, an object or a function`
        );

        const request = (
            typeof _request === 'string'
                ? { url: _request }
                : typeof _request === 'function'
                  ? { predicate: _request }
                  : _request
        ) as Record<string, unknown>;

        const unknownKeys = Object.keys(request).filter(
            (key) => requestKeys.indexOf(key) === -1
        );
        if (unknownKeys.length > 0)
            throw invalid(
                `${name} has unknown keys ${unknownKeys.join(', ')}, use url, method, status or predicate`
            );
        // an empty url is ignored when matching, like an omitted one
        const setKeys = requestKeys.filter(
            (key) => request[key] !== undefined && request[key] !== ''
        );
        if (setKeys.length === 0)
            throw invalid(
                `${name} must set url, method, status or predicate, or it excludes every request`
            );

        expectType(
            request.url,
            ['string', 'RegExp', 'undefined'],
            `${name}.url must be a string or a RegExp`
        );
        // new RegExp('') and /(?:)/ match every URL, like an empty url string
        if (
            typeName(request.url) === 'RegExp' &&
            (request.url as RegExp).source === '(?:)'
        )
            throw invalid(
                `${name}.url must not be an empty RegExp, or it matches every request`
            );
        if (typeof request.url === 'string') {
            try {
                new RegExp(request.url);
            } catch (error) {
                throw invalid(
                    `${name}.url is not a valid regular expression: ${(error as Error).message}`
                );
            }
        }
        expectType(
            request.predicate,
            ['function', 'undefined'],
            `${name}.predicate must be a function`
        );
        expectType(
            request.method,
            ['string', 'Array', 'undefined'],
            `${name}.method must be a string or an array of strings`
        );
        if (Array.isArray(request.method)) {
            // an empty list, or an empty method in it, matches no request
            if (request.method.length === 0)
                throw invalid(`${name}.method must not be an empty array`);
            request.method.forEach((method: unknown, methodIndex: number) => {
                expectType(
                    method,
                    ['string'],
                    `${name}.method[${methodIndex}] must be a string`
                );
                if (method === '')
                    throw invalid(
                        `${name}.method[${methodIndex}] must not be empty`
                    );
            });
        }
        expectType(
            request.status,
            ['Object', 'number', 'undefined'],
            `${name}.status must be a number or a { from, to } range`
        );
        if (typeName(request.status) === 'Object') {
            const status = request.status as Record<string, unknown>;
            expectType(
                status.from,
                ['number'],
                `${name}.status.from must be a number`
            );
            expectType(
                status.to,
                ['number'],
                `${name}.status.to must be a number`
            );
        }
    });
};

export const createConfig = (config: Config): NormalizedConfig => {
    // requests, the old name, wins when both are set, so that
    // setConfig({ ...getConfig(), requests }) from older code replaces the list
    const requests = config.requests ?? config.ignoreRequests;
    const normalized = {
        ignoreRequests: requests !== undefined ? mapToRequests(requests) : [],
        debug: config.debug ?? false,
    } as NormalizedConfig;
    // getConfig().requests keeps working, and { ...getConfig() } skips it
    Object.defineProperty(normalized, 'requests', {
        get(this: NormalizedConfig) {
            return this.ignoreRequests;
        },
        set(this: NormalizedConfig, value: NormalizedRequest[]) {
            this.ignoreRequests = value;
        },
        enumerable: false,
    });
    return normalized;
};

export const mapToRequests = (
    _unknowns: (string | RequestMatcher | RequestPredicate)[]
): NormalizedRequest[] =>
    _unknowns.map((unknown: string | RequestMatcher | RequestPredicate) => {
        if (typeof unknown === 'function') {
            return {
                url: undefined,
                method: undefined,
                status: undefined,
                predicate: unknown,
            };
        }

        if (typeof unknown !== 'string') {
            let status: Range | undefined = undefined;

            if (typeof unknown.status === 'number') {
                status = { from: unknown.status, to: unknown.status };
            } else if (unknown.status !== undefined) {
                // a reversed range matches the same statuses as the ordered one
                const { from, to } = unknown.status;
                status = { from: Math.min(from, to), to: Math.max(from, to) };
            }

            return {
                url: unknown.url,
                method: upperCaseMethod(unknown.method),
                status,
                predicate: unknown.predicate,
            };
        }

        return {
            url: unknown,
            method: undefined,
            status: undefined,
            predicate: undefined,
        };
    });

// matched against the request's method in upper case
const upperCaseMethod = (
    method: Method | Method[] | undefined
): Method | Method[] | undefined =>
    Array.isArray(method)
        ? method.map((each) => each.toUpperCase())
        : method?.toUpperCase();

const toArray = <T>(value: T | T[]): T[] =>
    Array.isArray(value) ? value : [value];

export const findRequest = (
    requests: RequestSession[],
    eventRequestId: string
) =>
    requests.find(
        (request: RequestSession) => request.requestId === eventRequestId
    );

export const isRequestExcluded = (
    request: RequestSession,
    config: NormalizedConfig
): boolean => findIgnoringEntry(request, config) !== undefined;

// the first entry that matches the request
export const findIgnoringEntry = (
    request: RequestSession,
    config: NormalizedConfig
): NormalizedRequest | undefined =>
    config.ignoreRequests.find((configRequest: NormalizedRequest) => {
        const urlMatch = configRequest.url
            ? new RegExp(configRequest.url).test(request.url)
            : true;
        const statusMatch = configRequest.status
            ? request.status !== undefined &&
              request.status >= configRequest.status.from &&
              request.status <= configRequest.status.to
            : true;
        // browsers upper-case only the standard methods, so fetch keeps 'patch'
        const methodMatch = configRequest.method
            ? toArray(configRequest.method).indexOf(
                  request.method.toUpperCase()
              ) !== -1
            : true;
        if (!(urlMatch && statusMatch && methodMatch)) return false;
        // called only when the other fields match, with a copy, so it cannot
        // change the tracked request
        return configRequest.predicate
            ? Boolean(configRequest.predicate({ ...request }))
            : true;
    });

// one line of the failure message and of the command log
export const requestToString = (request: RequestSession): string =>
    `${request.method} ${request.url} → ${request.status ?? request.error}`;

const quote = (text: string): string => `'${text.replace(/[\\']/g, '\\$&')}'`;

// an entry in the shape of the config, without the fields it does not set
export const entryToString = (entry: NormalizedRequest): string => {
    const fields: string[] = [];
    if (entry.url)
        fields.push(
            `url: ${typeof entry.url === 'string' ? quote(entry.url) : String(entry.url)}`
        );
    if (entry.method)
        fields.push(
            `method: ${Array.isArray(entry.method) ? `[${entry.method.map(quote).join(', ')}]` : quote(entry.method)}`
        );
    if (entry.status)
        fields.push(
            `status: ${entry.status.from === entry.status.to ? entry.status.from : `{ from: ${entry.status.from}, to: ${entry.status.to} }`}`
        );
    if (entry.predicate)
        fields.push(`predicate: ${entry.predicate.name || 'function'}`);
    return `{ ${fields.join(', ')} }`;
};

// the reporter renders Cypress.log messages as Markdown, which would format
// characters like * and _ in URLs
export const escapeMarkdown = (text: string): string =>
    text.replace(/[\\`*_~[\]()<>&]/g, '\\$&');

const requestConsoleProps = (request: RequestSession) =>
    request.error === undefined
        ? {
              Request: `${request.method} ${request.url}`,
              Status: request.status,
          }
        : { Request: `${request.method} ${request.url}`, Error: request.error };

// logs a failing request, or with debug an ignored one and the entry that
// ignored it; clicking the entry prints the details to the browser console
const logCheckedRequest = ({ request, ignoredBy, entries }: CheckedRequest) => {
    if (ignoredBy === undefined) {
        Cypress.log({
            name: 'unexpected',
            displayName: 'unexpected',
            message: escapeMarkdown(requestToString(request)),
            consoleProps: () => ({
                ...requestConsoleProps(request),
                'Entries tried': entries,
            }),
        });
        return;
    }
    Cypress.log({
        name: 'ignored',
        displayName: 'ignored',
        message: `**${escapeMarkdown(entryToString(ignoredBy))}** matched ${escapeMarkdown(requestToString(request))}`,
        consoleProps: () => ({
            ...requestConsoleProps(request),
            'Ignored by': ignoredBy,
            // a url string is matched as a regular expression
            ...(typeof ignoredBy.url === 'string'
                ? { 'As RegExp': new RegExp(ignoredBy.url) }
                : {}),
        }),
    });
};

// Chrome reports a request that the page aborted, or that a navigation
// cancelled, as a request:error with this message (seen with Cypress 16.1.1)
const isCancelledByBrowser = (message: string | undefined): boolean =>
    message?.indexOf('CDP Fetch request canceled by the browser:') === 0;

const waitUntil = (predicate: () => boolean, timeout: number) => {
    const interval = 500;
    const endTime = new Date().getTime() + timeout;

    const poll = (resolve: () => void) => {
        const remaining = endTime - new Date().getTime();
        if (predicate() || remaining <= 0) {
            resolve();
        } else {
            setTimeout(() => poll(resolve), Math.min(interval, remaining));
        }
    };
    // the plugin learns about a request a few ms after the page made it, so a
    // check right after cy.visit could miss it: check first after one interval
    return new Cypress.Promise<void>((resolve) =>
        setTimeout(() => poll(resolve), Math.min(interval, timeout))
    );
};

// a request that got a response or failed, with the entries it was matched
// against and the first one that matched it
type CheckedRequest = {
    request: RequestSession;
    ignoredBy: NormalizedRequest | undefined;
    entries: NormalizedRequest[];
};

export type RequestSession = {
    requestId: string;
    method: string;
    url: string;
    status?: number;
    // set when the request failed without a response
    error?: string;
    // set when the browser cancelled the request, or its page unloaded
    cancelled?: boolean;
};
