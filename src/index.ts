import { AssertionError } from 'chai';

const prefix = 'cypress-fail-on-network-error:';

export type Config = {
    requests?: (string | Request)[];
};

export interface Request {
    url?: string | RegExp;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    status?: number | Range;
}

export type Range = {
    from: number;
    to: number;
};

// an entry as getConfig() returns it: a string is { url }, a status a range
// and the method upper case
export type NormalizedRequest = {
    url?: string | RegExp;
    method?: Request['method'];
    status?: Range;
};

export type NormalizedConfig = {
    requests: NormalizedRequest[];
};

export default function failOnNetworkError(_config: Config = {}) {
    let config: NormalizedConfig;
    let originConfig: NormalizedConfig;
    let requests: RequestSession[] = [];
    // set when a request matched no entry, until the next command:end throws
    let requestFailed = false;

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

    Cypress.on('request:event', (eventName, event) => {
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

        if (
            !isRequestExcluded(
                findRequest(requests, event.requestId) as RequestSession,
                getConfig()
            )
        ) {
            requestFailed = true;
        }
    });

    // request:event arrives from the server outside the command queue, where
    // a thrown error is an uncaught exception that uncaught:exception handlers
    // can hide. command:end runs inside the queue and fails the command.
    Cypress.on('command:end', () => {
        if (!requestFailed) return;
        requestFailed = false;
        throw new AssertionError(`${prefix}\n${JSON.stringify(requests)}`);
    });

    // Electron and Firefox send no event for a request that the browser
    // cancels when the page unloads, so waitForRequests would wait for it
    // until its timeout. A response that still arrives is checked.
    Cypress.on('window:unload', () => {
        requests = requests.map((request: RequestSession) =>
            request.status === undefined && request.error === undefined
                ? { ...request, cancelled: true }
                : request
        );
    });

    Cypress.on('test:after:run', () => {
        setConfig(originConfig);
        requests = [];
        requestFailed = false;
    });

    return {
        getConfig,
        setConfig,
        waitForRequests,
    };
}

const configKeys = ['requests'];
const requestKeys = ['url', 'method', 'status'];

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
            `config has unknown keys ${unknownConfigKeys.join(', ')}, use requests`
        );
    expectType(
        config.requests,
        ['Array', 'undefined'],
        'config.requests must be an array'
    );

    config.requests?.forEach((_request: unknown, index: number) => {
        const name = `config.requests[${index}]`;
        expectType(
            _request,
            ['string', 'Object'],
            `${name} must be a string or an object`
        );

        const request = (
            typeof _request === 'string' ? { url: _request } : _request
        ) as Record<string, unknown>;

        const unknownKeys = Object.keys(request).filter(
            (key) => requestKeys.indexOf(key) === -1
        );
        if (unknownKeys.length > 0)
            throw invalid(
                `${name} has unknown keys ${unknownKeys.join(', ')}, use url, method or status`
            );
        // an empty url is ignored when matching, like an omitted one
        const setKeys = requestKeys.filter(
            (key) => request[key] !== undefined && request[key] !== ''
        );
        if (setKeys.length === 0)
            throw invalid(
                `${name} must set url, method or status, or it excludes every request`
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
            request.method,
            ['string', 'undefined'],
            `${name}.method must be a string`
        );
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
    return {
        requests:
            config.requests !== undefined ? mapToRequests(config.requests) : [],
    };
};

export const mapToRequests = (
    _unknowns: (string | Request)[]
): NormalizedRequest[] =>
    _unknowns.map((unknown: string | Request) => {
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
                // the event reports methods in upper case
                method: unknown.method?.toUpperCase() as Request['method'],
                status,
            };
        }

        return {
            url: unknown,
            method: undefined,
            status: undefined,
        };
    });

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
): boolean => {
    return config.requests.some((configRequest: NormalizedRequest) => {
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
            ? configRequest.method === request.method.toUpperCase()
            : true;
        return urlMatch && statusMatch && methodMatch;
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
