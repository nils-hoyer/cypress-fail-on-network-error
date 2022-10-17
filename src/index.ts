import * as chai from 'chai';
import { AssertionError } from 'chai';
import { EOL } from 'os';
import sinonChai from 'sinon-chai';
import typeDetect from 'type-detect';
import { Config } from './types/Config';
import { Request } from './types/Request';
import { RequestSession } from './types/RequestSession';

chai.should();
chai.use(sinonChai);

export default function failOnNetworkRequest(_config: Config = {}) {
    let config: Required<Config>;
    let originConfig: Required<Config>;
    let requests: RequestSession[] = [];

    const getConfig = () => config;
    const setConfig = (_config: Config): void => {
        validateConfig(_config);
        config = createConfig(_config);
        originConfig = originConfig ?? { ...config };
    };
    // const getRequests = () => requests;

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
                // currentTest: { ...Cypress.currentTest },
            });
            return;
        }

        const requestDone: RequestSession = {
            ...(findRequest(requests, event.requestId) as RequestSession),
            status: event.status,
        };

        if (!isRequestExcluded(requestDone, getConfig())) {
            throw new AssertionError(
                `cypress-fail-on-network-request: ${EOL} ${JSON.stringify(
                    requests
                )}`
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
        // getRequestsResult: getRequests,
        // waitForRequests,
        // assertRequests,
    };
}

export const validateConfig = (config: Config): void => {
    // TODO replace any with Request
    config.excludeRequests?.forEach((request: any) => {
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
    const excludeRequests =
        config.excludeRequests !== undefined
            ? mapToRequests(config.excludeRequests)
            : [];
    return {
        excludeRequests,
        // waitRequestsTimeout: config?.waitRequestsTimeout ?? 30000,
        // waitRequests: config?.waitRequests ?? 'none',
        // mode: config?.mode ?? 'error',
    };
};

export const mapToRequests = (_unknowns: (string | Request)[]): Request[] =>
    _unknowns.map((unknown: string | Request) => {
        if (typeof unknown !== 'string') {
            // unknown as Request;
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
    return config.excludeRequests?.some((configRequest: any) => {
        debugger;
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
    });
};

export { Config } from './types/Config';
export { Request } from './types/Request';

// next steps:
// filter request without status code
// validate result
// offer api for testing outside
// disable waitRequest logic since its not waiting for request:incoming xhr. one option is to set a small wait to visit to ensure xhr is executed.

// https://docs.cypress.io/api/events/catalog-of-events#Uncaught-Exceptions
//check uncaught:exception from test:after:run wrap or Error exception
//ideas mocha runnable
// find mocha currentTest.state
//check cypress events with localStorage.debug = 'cypress:*'

// Cypress.on('test:after:run', (test) => {
//     if (test.state === 'pending') {
//       return pendingTests.push(test)
//     }

//     if (test.state === 'passed') {
//       return passedTests.push(test)
//     }
//   })

// Cypress.on('fail', (error) => {
//     failedEventFired = true;
//     throw new Error(error);
// });

//deactivated
// Cypress.on('window:before:load', () => {
//     //TODO delete canceled otherwise next test will wait infinity
//     // requests = getRequests().filter(
//     //     (request: RequestSession) => request.status !== undefined
//     // );
// });

// deactivated
// afterEach(() => {
//     if (false && getConfig().waitRequests === 'afterEach') {
//         waitForRequests(getRequests, getConfig());
//     }
// });

// after(() => {
//     // deactivated
//     // if (false && getConfig().waitRequests === 'after') {
//     //     waitForRequests(getRequests, getConfig());
//     // }

//     if (getConfig().mode === 'error') {
//         const includedRequests = getRequestsIncluded(
//             getRequests(),
//             getConfig()
//         );
//         assertRequests(includedRequests);
//     } else {
//         cypressLogger('cypress-fail-on-network-request', getRequests());
//     }
// });

// export const waitForRequests = (
//     getRequests: () => RequestSession[],
//     config: Required<Config>
// ): Cypress.Chainable<any> => {
//     const requestsDone = () => {
//         console.log('waitForRequests', getRequests());
//         return getRequests().every(
//             (request: RequestSession) => request.status !== undefined
//         );
//     };

//     let result = false;

//     setTimeout(() => {
//         setResult(true);
//     }, 5000);

//     const setResult = (r: boolean) => (result = r);
//     const getResult = () => result;
//     // return cy.wrap(waitUntil(getResult, 10000), { timeout: 20000 });

//     return cy.wrap(waitUntil(requestsDone, config.waitRequestsTimeout), {
//         timeout: config.waitRequestsTimeout,
//     });
// };

// const waitUntil = (predicate: () => boolean, timeout: number) => {
//     const startTime = new Date().getTime();
//     const timeIsUp = (startTime: number, timeout: number) =>
//         new Date().getTime() > startTime + timeout;

//     const poll = (resolve: any) => {
//         console.log(
//             'predicate',
//             predicate(),
//             'timeIsUp',
//             timeIsUp(startTime, timeout)
//         );
//         if (predicate() || timeIsUp(startTime, timeout)) {
//             resolve();
//         } else {
//             setTimeout(() => poll(resolve), 500);
//         }
//     };
//     return new Cypress.Promise(poll);
// };

// export const assertRequests = (requests: RequestSession[]) => {
//     if (requests.length > 0) {
//         throw new AssertionError(
//             `cypress-fail-on-network-request: ${EOL} ${JSON.stringify(
//                 requests
//             )}`
//         );
//     }
// };

// export const cypressLogger = (name: string, message: any) => {
//     Cypress.log({
//         name: name,
//         displayName: name,
//         message: JSON.stringify(message),
//         consoleProps: () => message,
//     });
// };

// export const mapToArray = (map: Map<string, RequestSession>) =>
//     Array.from(map.values());
