import * as chai from 'chai';
import { AssertionError } from 'chai';
import failOnNetworkError, {
    type Config,
    type Request,
    type RequestSession,
    createConfig,
    isRequestExcluded,
    mapToRequests,
    validateConfig,
} from './../dist/index.js';

type Listener = (...args: any[]) => unknown;
let listeners: Record<string, Listener[]> = {};

const emit = (eventName: string, ...args: unknown[]) =>
    listeners[eventName]?.forEach((listener) => listener(...args));

const incomingRequest = (requestId: string, method: string, url: string) =>
    emit('request:event', 'incoming:request', { requestId, method, url });

const responseReceived = (requestId: string, status: number) =>
    emit('request:event', 'response:received', { requestId, status });

const requestError = (requestId: string, message: string) =>
    emit('request:event', 'request:error', {
        requestId,
        error: { message },
    });

const testAfterRun = () => emit('test:after:run');

beforeEach(() => {
    listeners = {};
    (globalThis as any).Cypress = {
        on: (eventName: string, listener: Listener) => {
            (listeners[eventName] ??= []).push(listener);
        },
        Promise,
    };
    (globalThis as any).cy = { wrap: (value: unknown) => value };
});

describe('failOnNetworkError()', () => {
    it('WHEN failOnNetworkError is created with Config THEN expect no error', () => {
        const config: Config = {
            requests: ['foo'],
        };
        failOnNetworkError(config);
    });
    it('WHEN failOnNetworkError is created with no Config THEN expect no error', () => {
        failOnNetworkError();
    });
});

describe('request:event handler', () => {
    it('WHEN response is excluded THEN expect no error', () => {
        failOnNetworkError({ requests: [{ url: 'foo', status: 200 }] });

        incomingRequest('1', 'GET', 'http://foo');

        chai.expect(() => responseReceived('1', 200)).to.not.throw();
    });

    it('WHEN response matches no entry THEN expect assertion error with prefix', () => {
        failOnNetworkError({ requests: [{ url: 'foo', status: 200 }] });

        incomingRequest('1', 'GET', 'http://foo');

        chai.expect(() => responseReceived('1', 500))
            .to.throw(AssertionError)
            .with.property('message')
            .that.match(/^cypress-fail-on-network-error:/);
    });

    it('WHEN request error matches no entry THEN expect assertion error with prefix', () => {
        failOnNetworkError({ requests: [{ status: 200 }] });

        incomingRequest('1', 'GET', 'http://foo');

        chai.expect(() => requestError('1', 'socket hang up'))
            .to.throw(AssertionError)
            .with.property('message')
            .that.match(/^cypress-fail-on-network-error:/);
    });

    it('WHEN response belongs to a request from before test:after:run THEN expect it to be ignored', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        testAfterRun();

        chai.expect(() => responseReceived('1', 500)).to.not.throw();
    });
});

describe('test:after:run handler', () => {
    it('WHEN config was changed during a test THEN expect original config after test:after:run', () => {
        const { getConfig, setConfig } = failOnNetworkError({
            requests: ['foo'],
        });

        setConfig({ requests: ['bar'] });
        testAfterRun();

        chai.expect(getConfig()).to.deep.equal(
            createConfig({ requests: ['foo'] })
        );
    });
});

describe('validateConfig()', () => {
    it('WHEN config is invalid status type THEN expect assertion error', () => {
        const config: any = {
            requests: [{ url: 'url', status: '400', method: 'GET' }],
        };

        chai.expect(() => validateConfig(config)).to.throw(AssertionError);
    });

    it('WHEN config is invalid status object THEN expect assertion error', () => {
        const config: any = {
            requests: [{ url: 'url', status: { from: 200 }, method: 'GET' }],
        };

        chai.expect(() => validateConfig(config)).to.throw(AssertionError);
    });

    it('WHEN config is valid THEN expect no assertion error', () => {
        const config: Config = {
            requests: [
                'url',
                { url: 'url', status: 200, method: 'GET' },
                { url: 'url', status: { from: 200, to: 299 }, method: 'GET' },
            ],
        };

        chai.expect(() => validateConfig(config)).to.not.throw(AssertionError);
    });
});

describe('mapToRequests()', () => {
    it('WHEN mapToRequests is called THEN expect Request object array', () => {
        const requests = [
            'url1',
            { url: 'url2', status: 400, method: 'GET' },
            { method: 'GET' },
            { status: { from: 200, to: 399 } },
        ] as (string | Request)[];

        const mappedRequests = mapToRequests(requests);
        chai.expect(mappedRequests).to.deep.equal([
            { url: 'url1', status: undefined, method: undefined },
            { url: 'url2', status: { from: 400, to: 400 }, method: 'GET' },
            { url: undefined, status: undefined, method: 'GET' },
            {
                url: undefined,
                status: { from: 200, to: 399 },
                method: undefined,
            },
        ]);
    });
    it('WHEN status range is reversed THEN expect from and to swapped', () => {
        chai.expect(
            mapToRequests([{ status: { from: 399, to: 200 } }])
        ).to.deep.equal([
            {
                url: undefined,
                status: { from: 200, to: 399 },
                method: undefined,
            },
        ]);
    });
});

describe('isRequestExcluded()', () => {
    it('WHEN request is excluded THEN expect true', () => {
        const config: Required<Config> = createConfig({
            requests: [{ url: 'foo', status: 400, method: 'GET' }],
        });
        const request: RequestSession = {
            requestId: '1',
            method: 'GET',
            url: 'http://foo',
            status: 400,
        };
        chai.expect(isRequestExcluded(request, config)).to.be.true;
    });
    it('WHEN request is not excluded THEN expect false', () => {
        const config: Required<Config> = createConfig({
            requests: [{ url: 'foo', status: 200, method: 'POST' }],
        });
        const request: RequestSession = {
            requestId: '1',
            method: 'GET',
            url: 'http://foo',
            status: 400,
        };
        chai.expect(isRequestExcluded(request, config)).to.be.false;
    });

    describe('WHEN config has status range 200 to 399', () => {
        const config: Required<Config> = createConfig({
            requests: [{ status: { from: 200, to: 399 } }],
        });
        const requestWithStatus = (status?: number): RequestSession => ({
            requestId: '1',
            method: 'GET',
            url: 'http://foo',
            status,
        });

        [200, 302, 399].forEach((status) => {
            it(`WHEN status is ${status} THEN expect true`, () => {
                chai.expect(
                    isRequestExcluded(requestWithStatus(status), config)
                ).to.be.true;
            });
        });

        [199, 400].forEach((status) => {
            it(`WHEN status is ${status} THEN expect false`, () => {
                chai.expect(
                    isRequestExcluded(requestWithStatus(status), config)
                ).to.be.false;
            });
        });

        it('WHEN request has no status THEN expect false', () => {
            chai.expect(isRequestExcluded(requestWithStatus(), config)).to.be
                .false;
        });
    });

    it('WHEN status range is reversed THEN expect statuses inside it to be excluded', () => {
        const config: Required<Config> = createConfig({
            requests: [{ status: { from: 399, to: 200 } }],
        });
        const request: RequestSession = {
            requestId: '1',
            method: 'GET',
            url: 'http://foo',
            status: 302,
        };
        chai.expect(isRequestExcluded(request, config)).to.be.true;
    });
});
