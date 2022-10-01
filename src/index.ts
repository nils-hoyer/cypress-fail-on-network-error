import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import typeDetect from 'type-detect';
import { Config } from './types/Config';
import { Request } from './types/Request';
import { RequestSession } from './types/RequestSession';

chai.should();
chai.use(sinonChai);

export default function failOnConsoleError(_config: Config = {}) {
    let config: Required<Config>;
    let originConfig: Required<Config>;
    let requests: Map<string, RequestSession> = new Map();

    const getConfig = () => config;
    const setConfig = (_config: Config): void => {
        validateConfig(_config);
        config = createConfig(_config);
        originConfig = originConfig ?? { ...config };
    };

    setConfig(_config);

    Cypress.on('uncaught:exception', (err, runnable) => {
        // returning false here prevents Cypress from
        // failing the test
        // throw new AssertionError(
        //     `test'
        //     )}`
        // );
        return true;
    });

    Cypress.on('request:event', async (eventName, event) => {
        const __subscribedEvents = [
            'incoming:request',
            'response:received',
            'request:error',
        ];
        const __unknownResponse =
            eventName === 'response:received' &&
            requests.get(event.requestId) === undefined;

        if (!__subscribedEvents || __unknownResponse) return;

        if (eventName === 'incoming:request') {
            requests.set(event.requestId, {
                requestId: event.requestId,
                method: event.method,
                url: event.url,
            });
            return;
        }

        requests.set(event.requestId, {
            ...requests.get(event.requestId),
            status: event.status,
        } as RequestSession);

        const requestsDone = Array.from(requests.values()).filter(
            (request: RequestSession) => request.status !== undefined
        );

        const requestIncluded: RequestSession | undefined = requestsDone.find(
            (request: RequestSession) => {
                //TODO: replace any with Request
                const isExcludedRequest = config.requests?.some(
                    (configRequest: any) => {
                        const urlMatch = configRequest.url
                            ? new RegExp(configRequest.url).test(request.url)
                            : true;
                        const statusMatch = configRequest.status
                            ? configRequest?.status === request.status
                            : true;
                        const methodMatch = configRequest?.method
                            ? configRequest?.method === request.method
                            : true;
                        return urlMatch && statusMatch && methodMatch;
                    }
                );
                return !isExcludedRequest;
            }
        );

        if (requestIncluded) {
            // throw new AssertionError(
            //     `cypress-fail-on-network-request: ${EOL} ${JSON.stringify(
            //         requestIncluded
            //     )}`
            // );
        }
    });

    // use afterEach to bypass cy.wrap(promise) to wait tests until requests are done
    // afterEach(() => {
    //     if (requestIncluded) return;

    //     const requestsDone = () =>
    //         Array.from(requests.values()).every(
    //             (request: RequestSession) => request.status !== undefined
    //         );
    //     cy.wrap(waitUntil(requestsDone), { timeout: config.timeout });
    // });

    // hier sollte die matching logik noch mal ausgeführt werden
    // alternatic mit after(() => {}) umstellen
    Cypress.on('command:end', () => {
        // wird gegebenenfalls niemand true wenn requests empty ist
        // const requestsDone = () =>
        //     Array.from(requests.values()).every(
        //         (request: RequestSession) => request.status !== undefined
        //     );
        // cy.wrap(waitUntil(requestsDone), { timeout: config.timeout });

        setConfig(originConfig as Config);
        requests = new Map();
    });

    return {
        getConfig,
        setConfig,
    };
}

export const validateConfig = (config: Config): void => {
    // TODO replace any with Request
    config.requests?.forEach((request: string | Request) => {
        if (typeof request === 'string') return;
        chai.expect(typeDetect(request.method)).to.be.oneOf([
            'string',
            'undefined',
        ]);
        chai.expect(typeDetect(request.url)).to.be.oneOf([
            'string',
            'undefined',
        ]);
        chai.expect(typeDetect(request.status)).to.be.oneOf([
            'number',
            'undefined',
        ]);
    });
    chai.expect(typeDetect(config.timeout)).to.be.oneOf([
        'number',
        'undefined',
    ]);
};

//TODO: use Request[] instead of any
export const createConfig = (config: Config): Required<Config> => {
    const mappedRequests: any = config.requests?.map(
        (request: string | Request) => mapToRequest(request)
    );
    return {
        requests: mappedRequests ?? [],
        timeout: config?.timeout ?? 30000,
    };
};

export const mapToRequest = (_unknown: string | Request): Request => {
    if (typeof _unknown !== 'string') {
        return _unknown as Request;
    }

    return {
        url: _unknown,
        method: undefined,
        status: undefined,
    };
};

const waitUntil = (predicate: () => boolean) => {
    const poll = (resolve: any) => {
        if (predicate()) {
            resolve();
        } else {
            setTimeout(() => poll(resolve), 500);
        }
    };
    return new Cypress.Promise(poll);
};

export { Config } from './types/Config';
