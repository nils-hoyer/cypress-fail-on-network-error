// The helpers behind the plugin. They aren't public API: the exports field in
// package.json only lists dist/index.js, and the unit tests import this file
// from dist/.

export const prefix = 'cypress-fail-on-network-error:';

export type Config = {
    ignoreRequests?: IgnoredRequest[];
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
    debug: boolean;
};

// an entry of ignoreRequests as the config accepts it: a string or a RegExp
// is shorthand for { url }, a function for { predicate }
export type IgnoredRequest =
    string | RegExp | RequestMatcher | RequestPredicate;

const configKeys = ['ignoreRequests', 'debug'];
// options that were renamed, with their new name
const renamedKeys: Record<string, string> = { requests: 'ignoreRequests' };
const requestKeys = ['url', 'method', 'status', 'predicate'];

// a broken config is not a failed check, so it throws an Error, not an AssertionError
export const invalid = (message: string) => new Error(`${prefix} ${message}`);

// the type name for messages, like type-detect: null, a primitive's typeof,
// or the built-in class of an object (Object, Array, RegExp, Date)
const typeName = (value: unknown): string => {
    if (value === null) return 'null';
    if (typeof value !== 'object') return typeof value;
    return Object.prototype.toString.call(value).slice(8, -1);
};

// by type name, like validateConfig, rather than instanceof
const isRegExp = (value: unknown): value is RegExp =>
    typeName(value) === 'RegExp';

const expectType = (value: unknown, types: string[], message: string) => {
    if (types.indexOf(typeName(value)) === -1)
        throw invalid(`${message}, got ${typeName(value)}`);
};

export const validateConfig = (config: Config): void => {
    expectType(config, ['Object'], 'config must be an object');
    Object.keys(config).forEach((key) => {
        if (renamedKeys.hasOwnProperty(key))
            throw invalid(`config.${key} was renamed to ${renamedKeys[key]}`);
    });
    // a misspelled option would otherwise be ignored, and every request fail
    const unknownConfigKeys = Object.keys(config).filter(
        (key) => configKeys.indexOf(key) === -1
    );
    if (unknownConfigKeys.length > 0)
        throw invalid(
            `config has unknown keys ${unknownConfigKeys.join(', ')}, use ignoreRequests or debug`
        );
    validateRequests(config.ignoreRequests, 'config.ignoreRequests');
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
            ['string', 'RegExp', 'Object', 'function'],
            `${name} must be a string, a RegExp, an object or a function`
        );

        const request = (
            typeof _request === 'string' || isRegExp(_request)
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
        if (isRegExp(request.url) && request.url.source === '(?:)')
            throw invalid(
                `${name}.url must not be an empty RegExp, or it matches every request`
            );
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

// without ignoreRequests, only error responses and requests without a
// response fail the test; ignoreRequests replaces this default
const defaultIgnoreRequests: RequestMatcher[] = [
    { status: { from: 100, to: 399 } },
];

export const createConfig = (config: Config): NormalizedConfig => ({
    // mapToRequests copies the default, so a change to getConfig() stays there
    ignoreRequests: mapToRequests(
        config.ignoreRequests ?? defaultIgnoreRequests
    ),
    debug: config.debug ?? false,
});

export const mapToRequests = (
    _unknowns: IgnoredRequest[]
): NormalizedRequest[] =>
    _unknowns.map((unknown: IgnoredRequest) => {
        if (typeof unknown === 'function') {
            return {
                url: undefined,
                method: undefined,
                status: undefined,
                predicate: unknown,
            };
        }

        if (isRegExp(unknown)) {
            return {
                url: unknown,
                method: undefined,
                status: undefined,
                predicate: undefined,
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
            ? isUrlMatch(configRequest.url, request.url)
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

// a string matches like a URL in cy.intercept(): when the URL contains it, or
// as a glob against the full URL or its path and query
const isUrlMatch = (url: string | RegExp, requestUrl: string): boolean => {
    // a copy, so a /g RegExp starts at lastIndex 0
    if (typeof url !== 'string') return new RegExp(url).test(requestUrl);
    if (requestUrl.indexOf(url) !== -1) return true;
    const options = { matchBase: true };
    return (
        Cypress.minimatch(requestUrl, url, options) ||
        Cypress.minimatch(pathOf(requestUrl), url, options)
    );
};

const pathOf = (url: string): string => {
    try {
        const { pathname, search } = new URL(url);
        return pathname + search;
    } catch (error) {
        return url;
    }
};

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

// normalized entries that match the same requests: a string and a RegExp
// with the same text differ, and predicates must be the same function
export const isSameEntry = (
    a: NormalizedRequest,
    b: NormalizedRequest
): boolean =>
    a.predicate === b.predicate &&
    entryToString({ ...a, predicate: undefined }) ===
        entryToString({ ...b, predicate: undefined });

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
export const logCheckedRequest = ({
    request,
    ignoredBy,
    entries,
}: CheckedRequest) => {
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
        }),
    });
};

// browsers send request header names in any case, so a predicate can look
// them up in lower case
export const lowerCaseNames = (
    headers: HeaderValues | undefined
): HeaderValues | undefined => {
    if (headers === undefined || headers === null) return undefined;
    const lowerCased: HeaderValues = {};
    Object.keys(headers).forEach((name) => {
        lowerCased[name.toLowerCase()] = headers[name];
    });
    return lowerCased;
};

// the start of request:error messages for a request that the browser gave
// up on, not one that failed (seen with Cypress 16.1.1)
const cancelledMessages = [
    // Chrome, when the page aborts a request or navigates away
    'CDP Fetch request canceled by the browser:',
    // Chrome, when the page that made the request was reset between tests
    'Invalid InterceptionId.',
    // Chrome, and reported from Firefox, when the page that made the request
    // was reset between tests
    'The browser closed the connection before the response completed.',
];

export const isCancelledByBrowser = (message: string | undefined): boolean =>
    cancelledMessages.some((start) => message?.indexOf(start) === 0);

// Node reports a refused connection as an AggregateError without a message,
// with the code ECONNREFUSED
export const errorMessage = (
    error: { message?: string; code?: string } | undefined
): string =>
    error?.message || error?.code || 'request failed without a response';

// Cypress's proxy retries a request without a response under the same id
// with a -retry-N suffix
export const baseRequestId = (requestId: string): string =>
    requestId.replace(/-retry-\d+$/, '');

export const isRetry = (requestId: string): boolean =>
    baseRequestId(requestId) !== requestId;

export const isPending = (request: RequestSession): boolean =>
    request.status === undefined &&
    request.error === undefined &&
    request.cancelled !== true;

// waitForRequests timed out: says which requests it was waiting for
export const logPendingRequest =
    (timeout: number) => (request: RequestSession) =>
        Cypress.log({
            name: 'pending',
            displayName: 'pending',
            message: `${escapeMarkdown(`${request.method} ${request.url}`)} was still pending when the wait timed out after ${timeout} ms`,
            consoleProps: () => ({
                Request: `${request.method} ${request.url}`,
                Timeout: timeout,
            }),
        });

export const waitUntil = (
    predicate: () => boolean,
    timeout: number
): PromiseLike<void> => {
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
export type CheckedRequest = {
    request: RequestSession;
    ignoredBy: NormalizedRequest | undefined;
    entries: NormalizedRequest[];
};

// header names in lower case, as Node.js gives them for responses
type HeaderValues = { [name: string]: string | string[] };

export type RequestSession = {
    requestId: string;
    method: string;
    url: string;
    requestHeaders?: HeaderValues;
    responseHeaders?: HeaderValues;
    status?: number;
    // set when the request failed without a response
    error?: string;
    // set when the browser cancelled the request, or its page unloaded
    cancelled?: boolean;
};
