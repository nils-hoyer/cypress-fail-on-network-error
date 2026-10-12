import * as chai from 'chai';
import { AssertionError } from 'chai';
import typeDetect from 'type-detect';

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

export default function failOnNetworkError(_config: Config = {}) {
    let config: Required<Config>;
    let originConfig: Required<Config>;
    let requests: RequestSession[] = [];

    const getRequests = () => requests;

    const getConfig = () => config;
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
                    request.status !== undefined || request.error !== undefined
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
            throw new AssertionError(`${prefix}\n${JSON.stringify(requests)}`);
        }
    });

    Cypress.on('test:after:run', async () => {
        setConfig(originConfig as Config);
        requests = [];
    });

    return {
        getConfig,
        setConfig,
        waitForRequests,
    };
}

const requestKeys = ['url', 'method', 'status'];

export const validateConfig = (config: Config): void => {
    chai.expect(
        typeDetect(config),
        `${prefix} config must be an object`
    ).to.equal('Object');
    chai.expect(
        typeDetect(config.requests),
        `${prefix} config.requests must be an array`
    ).to.be.oneOf(['Array', 'undefined']);

    config.requests?.forEach((_request: unknown, index: number) => {
        const name = `config.requests[${index}]`;
        chai.expect(
            typeDetect(_request),
            `${prefix} ${name} must be a string or an object`
        ).to.be.oneOf(['string', 'Object']);

        // TODO replace any with Request
        const request: any =
            typeof _request === 'string' ? { url: _request } : _request;

        chai.expect(
            Object.keys(request).filter(
                (key) => requestKeys.indexOf(key) === -1
            ),
            `${prefix} ${name} has unknown keys, use url, method or status`
        ).to.be.empty;
        // an empty url is ignored when matching, like an omitted one
        chai.expect(
            requestKeys.filter(
                (key) => request[key] !== undefined && request[key] !== ''
            ),
            `${prefix} ${name} must set url, method or status, or it excludes every request`
        ).to.not.be.empty;

        chai.expect(
            typeDetect(request.url),
            `${prefix} ${name}.url must be a string or a RegExp`
        ).to.be.oneOf(['string', 'RegExp', 'undefined']);
        if (typeof request.url === 'string') {
            try {
                new RegExp(request.url);
            } catch (error) {
                throw new AssertionError(
                    `${prefix} ${name}.url is not a valid regular expression: ${(error as Error).message}`
                );
            }
        }
        chai.expect(
            typeDetect(request.method),
            `${prefix} ${name}.method must be a string`
        ).to.be.oneOf(['string', 'undefined']);
        chai.expect(
            typeDetect(request.status),
            `${prefix} ${name}.status must be a number or a { from, to } range`
        ).to.be.oneOf(['Object', 'number', 'undefined']);
        if (typeDetect(request.status) === 'Object') {
            chai.expect(
                typeDetect(request.status.from),
                `${prefix} ${name}.status.from must be a number`
            ).to.equal('number');
            chai.expect(
                typeDetect(request.status.to),
                `${prefix} ${name}.status.to must be a number`
            ).to.equal('number');
        }
    });
};

//TODO: use Request[] instead of any
export const createConfig = (config: Config): Required<Config> => {
    return {
        requests:
            config.requests !== undefined ? mapToRequests(config.requests) : [],
    };
};

export const mapToRequests = (_unknowns: (string | Request)[]): Request[] =>
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
    config: Required<Config>
): boolean => {
    //TODO: replace any with Request
    return config.requests?.some((configRequest: any) => {
        const urlMatch = configRequest.url
            ? new RegExp(configRequest.url).test(request.url)
            : true;
        const statusMatch = configRequest.status
            ? request.status !== undefined &&
              request.status >= configRequest.status.from &&
              request.status <= configRequest.status.to
            : true;
        // browsers upper-case only the standard methods, so fetch keeps 'patch'
        const methodMatch = configRequest?.method
            ? configRequest?.method === request.method.toUpperCase()
            : true;
        return urlMatch && statusMatch && methodMatch;
    });
};

const waitUntil = (predicate: () => boolean, timeout: number) => {
    const endTime = new Date().getTime() + timeout;

    const poll = (resolve: () => void) => {
        const remaining = endTime - new Date().getTime();
        if (predicate() || remaining <= 0) {
            resolve();
        } else {
            setTimeout(() => poll(resolve), Math.min(500, remaining));
        }
    };
    return new Cypress.Promise<void>(poll);
};

export type RequestSession = {
    requestId: string;
    method: string;
    url: string;
    status?: number;
    // set when the request failed without a response
    error?: string;
};
