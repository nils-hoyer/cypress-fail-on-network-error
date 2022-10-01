"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapToRequest = exports.createConfig = exports.validateConfig = void 0;
var chai = __importStar(require("chai"));
var sinon_chai_1 = __importDefault(require("sinon-chai"));
var type_detect_1 = __importDefault(require("type-detect"));
chai.should();
chai.use(sinon_chai_1.default);
function failOnConsoleError(_config) {
    var _this = this;
    if (_config === void 0) { _config = {}; }
    var config;
    var originConfig;
    var requests = new Map();
    var getConfig = function () { return config; };
    var setConfig = function (_config) {
        (0, exports.validateConfig)(_config);
        config = (0, exports.createConfig)(_config);
        originConfig = originConfig !== null && originConfig !== void 0 ? originConfig : __assign({}, config);
    };
    setConfig(_config);
    Cypress.on('uncaught:exception', function (err, runnable) {
        // returning false here prevents Cypress from
        // failing the test
        // throw new AssertionError(
        //     `test'
        //     )}`
        // );
        return true;
    });
    Cypress.on('request:event', function (eventName, event) { return __awaiter(_this, void 0, void 0, function () {
        var __subscribedEvents, __unknownResponse, requestsDone, requestIncluded;
        return __generator(this, function (_a) {
            __subscribedEvents = [
                'incoming:request',
                'response:received',
                'request:error',
            ];
            __unknownResponse = eventName === 'response:received' &&
                requests.get(event.requestId) === undefined;
            if (!__subscribedEvents || __unknownResponse)
                return [2 /*return*/];
            if (eventName === 'incoming:request') {
                requests.set(event.requestId, {
                    requestId: event.requestId,
                    method: event.method,
                    url: event.url,
                });
                return [2 /*return*/];
            }
            requests.set(event.requestId, __assign(__assign({}, requests.get(event.requestId)), { status: event.status }));
            requestsDone = Array.from(requests.values()).filter(function (request) { return request.status !== undefined; });
            requestIncluded = requestsDone.find(function (request) {
                var _a;
                //TODO: replace any with Request
                var isExcludedRequest = (_a = config.requests) === null || _a === void 0 ? void 0 : _a.some(function (configRequest) {
                    var urlMatch = configRequest.url
                        ? new RegExp(configRequest.url).test(request.url)
                        : true;
                    var statusMatch = configRequest.status
                        ? (configRequest === null || configRequest === void 0 ? void 0 : configRequest.status) === request.status
                        : true;
                    var methodMatch = (configRequest === null || configRequest === void 0 ? void 0 : configRequest.method)
                        ? (configRequest === null || configRequest === void 0 ? void 0 : configRequest.method) === request.method
                        : true;
                    return urlMatch && statusMatch && methodMatch;
                });
                return !isExcludedRequest;
            });
            if (requestIncluded) {
                // throw new AssertionError(
                //     `cypress-fail-on-network-request: ${EOL} ${JSON.stringify(
                //         requestIncluded
                //     )}`
                // );
            }
            return [2 /*return*/];
        });
    }); });
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
    Cypress.on('command:end', function () {
        // wird gegebenenfalls niemand true wenn requests empty ist
        // const requestsDone = () =>
        //     Array.from(requests.values()).every(
        //         (request: RequestSession) => request.status !== undefined
        //     );
        // cy.wrap(waitUntil(requestsDone), { timeout: config.timeout });
        setConfig(originConfig);
        requests = new Map();
    });
    return {
        getConfig: getConfig,
        setConfig: setConfig,
    };
}
exports.default = failOnConsoleError;
var validateConfig = function (config) {
    var _a;
    // TODO replace any with Request
    (_a = config.requests) === null || _a === void 0 ? void 0 : _a.forEach(function (request) {
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
    chai.expect((0, type_detect_1.default)(config.timeout)).to.be.oneOf([
        'number',
        'undefined',
    ]);
};
exports.validateConfig = validateConfig;
//TODO: use Request[] instead of any
var createConfig = function (config) {
    var _a, _b;
    var mappedRequests = (_a = config.requests) === null || _a === void 0 ? void 0 : _a.map(function (request) { return (0, exports.mapToRequest)(request); });
    return {
        requests: mappedRequests !== null && mappedRequests !== void 0 ? mappedRequests : [],
        timeout: (_b = config === null || config === void 0 ? void 0 : config.timeout) !== null && _b !== void 0 ? _b : 30000,
    };
};
exports.createConfig = createConfig;
var mapToRequest = function (_unknown) {
    if (typeof _unknown !== 'string') {
        return _unknown;
    }
    return {
        url: _unknown,
        method: undefined,
        status: undefined,
    };
};
exports.mapToRequest = mapToRequest;
var waitUntil = function (predicate) {
    var poll = function (resolve) {
        if (predicate()) {
            resolve();
        }
        else {
            setTimeout(function () { return poll(resolve); }, 500);
        }
    };
    return new Cypress.Promise(poll);
};
