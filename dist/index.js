"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRequestExcluded = exports.findRequest = exports.mapToRequests = exports.createConfig = exports.validateConfig = void 0;
const chai = __importStar(require("chai"));
const chai_1 = require("chai");
const os_1 = require("os");
const sinon_chai_1 = __importDefault(require("sinon-chai"));
const type_detect_1 = __importDefault(require("type-detect"));
chai.should();
chai.use(sinon_chai_1.default);
function failOnNetworkRequest(_config = {}) {
    let config;
    let originConfig;
    let requests = [];
    const getConfig = () => config;
    const setConfig = (_config) => {
        (0, exports.validateConfig)(_config);
        config = (0, exports.createConfig)(_config);
        originConfig = originConfig !== null && originConfig !== void 0 ? originConfig : { ...config };
    };
    // const getRequests = () => requests;
    setConfig(_config);
    Cypress.on('request:event', (eventName, event) => {
        const subscribedEvents = [
            'incoming:request',
            'request:error',
            'response:received',
        ];
        const unknownResponse = eventName === 'response:received' &&
            (0, exports.findRequest)(requests, event.requestId) === undefined;
        if (!subscribedEvents || unknownResponse)
            return;
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
        const requestDone = {
            ...(0, exports.findRequest)(requests, event.requestId),
            status: event.status,
        };
        if (!(0, exports.isRequestExcluded)(requestDone, getConfig())) {
            throw new chai_1.AssertionError(`cypress-fail-on-network-request: ${os_1.EOL} ${JSON.stringify(requests)}`);
        }
    });
    Cypress.on('test:after:run', async () => {
        setConfig(originConfig);
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
exports.default = failOnNetworkRequest;
const validateConfig = (config) => {
    var _a;
    // TODO replace any with Request
    (_a = config.excludeRequests) === null || _a === void 0 ? void 0 : _a.forEach((request) => {
        if (typeof request === 'string')
            return;
        chai.expect((0, type_detect_1.default)(request.method)).to.be.oneOf([
            'string',
            'undefined',
        ]);
        chai.expect((0, type_detect_1.default)(request.url)).to.be.oneOf([
            'string',
            'undefined',
        ]);
        chai.expect((0, type_detect_1.default)(request.status)).to.be.oneOf([
            'number',
            'undefined',
        ]);
    });
    // chai.expect(typeDetect(config.waitRequestsTimeout)).to.be.oneOf([
    //     'number',
    //     'undefined',
    // ]);
};
exports.validateConfig = validateConfig;
//TODO: use Request[] instead of any
const createConfig = (config) => {
    const excludeRequests = config.excludeRequests !== undefined
        ? (0, exports.mapToRequests)(config.excludeRequests)
        : [];
    return {
        excludeRequests,
        // waitRequestsTimeout: config?.waitRequestsTimeout ?? 30000,
        // waitRequests: config?.waitRequests ?? 'none',
        // mode: config?.mode ?? 'error',
    };
};
exports.createConfig = createConfig;
const mapToRequests = (_unknowns) => _unknowns.map((unknown) => {
    if (typeof unknown !== 'string') {
        return unknown;
    }
    return {
        url: unknown,
        method: undefined,
        status: undefined,
    };
});
exports.mapToRequests = mapToRequests;
const findRequest = (requests, eventRequestId) => requests.find((request) => request.requestId === eventRequestId);
exports.findRequest = findRequest;
const isRequestExcluded = (request, config) => {
    var _a;
    //TODO: replace any with Request
    return (_a = config.excludeRequests) === null || _a === void 0 ? void 0 : _a.some((configRequest) => {
        debugger;
        const urlMatch = configRequest.url
            ? new RegExp(configRequest.url).test(request.url)
            : true;
        const statusMatch = configRequest.status
            ? (configRequest === null || configRequest === void 0 ? void 0 : configRequest.status) === request.status
            : true;
        const methodMatch = (configRequest === null || configRequest === void 0 ? void 0 : configRequest.method)
            ? (configRequest === null || configRequest === void 0 ? void 0 : configRequest.method) === request.method
            : true;
        return urlMatch && statusMatch && methodMatch;
    });
};
exports.isRequestExcluded = isRequestExcluded;
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
