import * as chai from 'chai';
import { AssertionError } from 'chai';
import typeDetect from 'type-detect';

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
        originConfig = originConfig ?? { ...config };
    };

    const waitForRequests = (timeout = 10000): Cypress.Chainable<any> => {
        const requestsDone = () =>
            getRequests().every(
                (request: RequestSession) => request.status !== undefined
            );

        return cy.wrap(waitUntil(requestsDone, timeout), {
            timeout: timeout + 100,
        });
    };

    setConfig(_config);

    Cypress.on('request:event', (eventName, event) => {
        const subscribedEvents = [
            'incoming:request',
            'request:error',
            'response:received',
        ];
        const unknownResponse =
            eventName === 'response:received' &&
            findRequest(requests, event.requestId) === undefined;

        if (!subscribedEvents || unknownResponse) return;

        if (eventName === 'incoming:request') {
            requests.push({
                requestId: event.requestId,
                method: event.method,
                url: event.url,
                status: undefined,
            });
            return;
        }

        requests = requests.map((request: RequestSession) => {
            if (request.requestId !== event.requestId) return request;
            return {
                ...request,
                status: event.status,
            };
        });

        if (
            !isRequestExcluded(
                findRequest(requests, event.requestId) as RequestSession,
                getConfig()
            )
        ) {
            throw new AssertionError(
                `cypress-fail-on-network-error:\n${JSON.stringify(requests)}`
            );
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

export const validateConfig = (config: Config): void => {
    // TODO replace any with Request
    config.requests?.forEach((request: any) => {
        if (typeDetect(request) === 'string') return;
        chai.expect(typeDetect(request.url)).to.be.oneOf([
            'string',
            'RegExp',
            'undefined',
        ]);
        chai.expect(typeDetect(request.method)).to.be.oneOf([
            'string',
            'undefined',
        ]);
        chai.expect(typeDetect(request.status)).to.be.oneOf([
            'Object',
            'number',
            'undefined',
        ]);
        if (typeDetect(request.status) === 'Object') {
            chai.expect(typeDetect(request.status.from)).to.equal('number');
            chai.expect(typeDetect(request.status.to)).to.equal('number');
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
            let status = undefined;

            if (unknown.status !== undefined) {
                status =
                    typeDetect(unknown.status) === 'number'
                        ? { from: unknown.status, to: unknown.status }
                        : {
                              from: (unknown.status as any).from,
                              to: (unknown.status as any).to,
                          };
            }

            return {
                url: unknown.url,
                method: unknown.method,
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
            ? configRequest.status.from >= (request.status as number) &&
              configRequest.status.to <= (request.status as number)
            : true;
        const methodMatch = configRequest?.method
            ? configRequest?.method === request.method
            : true;
        return urlMatch && statusMatch && methodMatch;
    });
};

const waitUntil = (predicate: () => boolean, timeout: number) => {
    const startTime = new Date().getTime();
    const isTimeUp = (startTime: number, timeout: number) =>
        new Date().getTime() > startTime + timeout;

    const poll = (resolve: any) => {
        if (predicate() || isTimeUp(startTime, timeout)) {
            resolve();
        } else {
            setTimeout(() => poll(resolve), 500);
        }
    };
    return new Cypress.Promise(poll);
};

export type RequestSession = {
    requestId: string;
    method: string;
    url: string;
    status?: number;
};
