var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as chai from 'chai';
import { AssertionError } from 'chai';
import typeDetect from 'type-detect';
export default function failOnNetworkError(_config = {}) {
    let config;
    let originConfig;
    let requests = [];
    const getRequests = () => requests;
    const getConfig = () => config;
    const setConfig = (_config) => {
        validateConfig(_config);
        config = createConfig(_config);
        originConfig = originConfig !== null && originConfig !== void 0 ? originConfig : Object.assign({}, config);
    };
    const waitForRequests = (timeout = 10000) => {
        const requestsDone = () => getRequests().every((request) => request.status !== undefined);
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
        const unknownResponse = eventName === 'response:received' &&
            findRequest(requests, event.requestId) === undefined;
        if (!subscribedEvents || unknownResponse)
            return;
        if (eventName === 'incoming:request') {
            requests.push({
                requestId: event.requestId,
                method: event.method,
                url: event.url,
                status: undefined,
            });
            return;
        }
        requests = requests.map((request) => {
            if (request.requestId !== event.requestId)
                return request;
            return Object.assign(Object.assign({}, request), { status: event.status });
        });
        if (!isRequestExcluded(findRequest(requests, event.requestId), getConfig())) {
            throw new AssertionError(`cypress-fail-on-network-error:\n${JSON.stringify(requests)}`);
        }
    });
    Cypress.on('test:after:run', () => __awaiter(this, void 0, void 0, function* () {
        setConfig(originConfig);
        requests = [];
    }));
    return {
        getConfig,
        setConfig,
        waitForRequests,
    };
}
export const validateConfig = (config) => {
    var _a;
    // TODO replace any with Request
    (_a = config.requests) === null || _a === void 0 ? void 0 : _a.forEach((request) => {
        if (typeDetect(request) === 'string')
            return;
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
export const createConfig = (config) => {
    return {
        requests: config.requests !== undefined ? mapToRequests(config.requests) : [],
    };
};
export const mapToRequests = (_unknowns) => _unknowns.map((unknown) => {
    if (typeof unknown !== 'string') {
        let status = undefined;
        if (unknown.status !== undefined) {
            status =
                typeDetect(unknown.status) === 'number'
                    ? { from: unknown.status, to: unknown.status }
                    : {
                        from: unknown.status.from,
                        to: unknown.status.to,
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
export const findRequest = (requests, eventRequestId) => requests.find((request) => request.requestId === eventRequestId);
export const isRequestExcluded = (request, config) => {
    var _a;
    //TODO: replace any with Request
    return (_a = config.requests) === null || _a === void 0 ? void 0 : _a.some((configRequest) => {
        const urlMatch = configRequest.url
            ? new RegExp(configRequest.url).test(request.url)
            : true;
        const statusMatch = configRequest.status
            ? configRequest.status.from >= request.status &&
                configRequest.status.to <= request.status
            : true;
        const methodMatch = (configRequest === null || configRequest === void 0 ? void 0 : configRequest.method)
            ? (configRequest === null || configRequest === void 0 ? void 0 : configRequest.method) === request.method
            : true;
        return urlMatch && statusMatch && methodMatch;
    });
};
const waitUntil = (predicate, timeout) => {
    const startTime = new Date().getTime();
    const isTimeUp = (startTime, timeout) => new Date().getTime() > startTime + timeout;
    const poll = (resolve) => {
        if (predicate() || isTimeUp(startTime, timeout)) {
            resolve();
        }
        else {
            setTimeout(() => poll(resolve), 500);
        }
    };
    return new Cypress.Promise(poll);
};
