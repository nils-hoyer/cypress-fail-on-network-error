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

const incomingRequest = (
    requestId: string,
    method: string,
    url: string,
    resourceType?: string
) =>
    emit('request:event', 'incoming:request', {
        requestId,
        method,
        url,
        resourceType,
    });

const responseReceived = (requestId: string, status: number) =>
    emit('request:event', 'response:received', { requestId, status });

const requestError = (requestId: string, message: string) =>
    emit('request:event', 'request:error', {
        requestId,
        error: { message },
    });

const testAfterRun = () => emit('test:after:run');

// a minimal cy command queue: commands run in order when runCommands() is
// called, and a command fails when it takes longer than its timeout
type Command = { run: (subject: unknown) => unknown; timeout: number };
let commands: Command[] = [];

const chainable = {
    then: (
        options: { timeout?: number },
        callback: (subject: unknown) => unknown
    ) => {
        commands.push({ run: callback, timeout: options.timeout ?? 4000 });
        return chainable;
    },
};

const runCommands = async () => {
    let subject: unknown;
    for (const { run, timeout } of commands) {
        let timer: NodeJS.Timeout | undefined;
        const timedOut = new Promise((_, reject) => {
            timer = setTimeout(
                () =>
                    reject(new Error(`command timed out after ${timeout} ms`)),
                timeout
            );
        });
        subject = await Promise.race([run(subject), timedOut]);
        clearTimeout(timer);
    }
    commands = [];
    return subject;
};

beforeEach(() => {
    listeners = {};
    (globalThis as any).Cypress = {
        on: (eventName: string, listener: Listener) => {
            (listeners[eventName] ??= []).push(listener);
        },
        Promise,
    };
    commands = [];
    (globalThis as any).cy = {
        wrap: (value: unknown, options: { timeout?: number } = {}) => {
            commands.push({
                run: () => value,
                timeout: options.timeout ?? 4000,
            });
            return chainable;
        },
    };
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
    it('WHEN failOnNetworkError is created with null THEN expect assertion error', () => {
        chai.expect(() =>
            failOnNetworkError(null as unknown as Config)
        ).to.throw(AssertionError);
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

    [{}, { requests: ['foo'] }].forEach((config: Config) => {
        it(`WHEN request error belongs to a request from before test:after:run with config ${JSON.stringify(config)} THEN expect it to be ignored`, () => {
            failOnNetworkError(config);

            incomingRequest('1', 'GET', 'http://foo');
            testAfterRun();

            chai.expect(() =>
                requestError('1', 'socket hang up')
            ).to.not.throw();
        });
    });

    ['script', 'stylesheet', 'image', 'document', 'other'].forEach(
        (resourceType) => {
            it(`WHEN resource type is ${resourceType} THEN expect the request to be ignored`, () => {
                failOnNetworkError();

                incomingRequest('1', 'GET', 'http://foo', resourceType);

                chai.expect(() => responseReceived('1', 500)).to.not.throw();
            });
        }
    );

    ['xhr', 'fetch', undefined].forEach((resourceType) => {
        it(`WHEN resource type is ${resourceType} THEN expect the request to be checked`, () => {
            failOnNetworkError();

            incomingRequest('1', 'GET', 'http://foo', resourceType);

            chai.expect(() => responseReceived('1', 500)).to.throw(
                AssertionError
            );
        });
    });

    it('WHEN event is not a request event THEN expect it to be ignored', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');

        chai.expect(() =>
            emit('request:event', 'unknown:event', { requestId: '1' })
        ).to.not.throw();
    });

    it('WHEN request error matches no entry THEN expect error message in assertion error', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');

        chai.expect(() => requestError('1', 'socket hang up'))
            .to.throw(AssertionError)
            .with.property('message')
            .that.contains('socket hang up');
    });
});

describe('waitForRequests()', function () {
    this.timeout(5000);

    it('WHEN request failed without a response THEN expect it to resolve before the timeout', async () => {
        const { waitForRequests } = failOnNetworkError({ requests: ['foo'] });

        incomingRequest('1', 'GET', 'http://foo');
        requestError('1', 'socket hang up');
        waitForRequests(1000);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.lessThan(500);
    });

    it('WHEN request is still pending at the timeout THEN expect it to resolve without failing', async () => {
        const { waitForRequests } = failOnNetworkError({ requests: ['foo'] });

        incomingRequest('1', 'GET', 'http://foo');
        waitForRequests(1200);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(1200, 1400);
    });

    it('WHEN request is made after waitForRequests is called THEN expect it to wait for that request', async () => {
        const { waitForRequests } = failOnNetworkError({ requests: ['foo'] });

        waitForRequests(2000);
        incomingRequest('1', 'GET', 'http://foo');
        setTimeout(() => responseReceived('1', 200), 300);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(300, 1000);
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

    it('WHEN requests were added to getConfig() during a test THEN expect them gone after test:after:run', () => {
        const { getConfig } = failOnNetworkError({ requests: ['foo'] });

        getConfig().requests.push('bar');
        testAfterRun();

        chai.expect(getConfig()).to.deep.equal(
            createConfig({ requests: ['foo'] })
        );
    });

    it('WHEN an entry of getConfig() was changed during a test THEN expect the original entry after test:after:run', () => {
        const { getConfig } = failOnNetworkError({ requests: ['foo'] });

        (getConfig().requests[0] as Request).url = 'bar';
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

    const expectInvalid = (config: unknown, name: string) =>
        chai
            .expect(() => validateConfig(config as Config))
            .to.throw(AssertionError)
            .with.property('message')
            .that.match(/^cypress-fail-on-network-error:/)
            .and.contains(name);

    [null, 'foo', ['foo']].forEach((config) => {
        it(`WHEN config is ${JSON.stringify(config)} THEN expect assertion error naming config`, () => {
            expectInvalid(config, 'config');
        });
    });

    ['foo', {}, null].forEach((requests) => {
        it(`WHEN requests is ${JSON.stringify(requests)} THEN expect assertion error naming config.requests`, () => {
            expectInvalid({ requests }, 'config.requests');
        });
    });

    [42, /foo/, null, ['foo']].forEach((entry) => {
        it(`WHEN entry is ${String(entry)} THEN expect assertion error naming the entry`, () => {
            expectInvalid({ requests: ['foo', entry] }, 'config.requests[1]');
        });
    });

    [
        [{}, '{}'],
        [{ url: undefined }, '{ url: undefined }'],
        [{ url: '' }, "{ url: '' }"],
        ['', "''"],
    ].forEach(([entry, title]) => {
        it(`WHEN entry ${title} sets none of url, method or status THEN expect assertion error naming the entry`, () => {
            expectInvalid({ requests: ['foo', entry] }, 'config.requests[1]');
        });
    });

    [{ stauts: 404 }, { url: 'foo', stauts: 404 }].forEach((entry) => {
        it(`WHEN entry ${JSON.stringify(entry)} has an unknown key THEN expect assertion error naming the entry and key`, () => {
            const config = { requests: ['foo', entry] };
            expectInvalid(config, 'config.requests[1]');
            expectInvalid(config, 'stauts');
        });
    });

    ['(', { url: '[a-' }].forEach((entry) => {
        it(`WHEN url ${JSON.stringify(entry)} is not a valid regular expression THEN expect assertion error naming the entry`, () => {
            expectInvalid({ requests: ['foo', entry] }, 'config.requests[1]');
        });
    });

    [
        { url: 42 },
        { method: 42 },
        { status: '400' },
        { status: { from: 200 } },
    ].forEach((entry) => {
        const key = Object.keys(entry)[0];
        it(`WHEN entry ${JSON.stringify(entry)} has an invalid ${key} THEN expect assertion error naming the entry and key`, () => {
            expectInvalid(
                { requests: ['foo', entry] },
                `config.requests[1].${key}`
            );
        });
    });

    it('WHEN config is normalized by createConfig THEN expect no assertion error', () => {
        const config = createConfig({
            requests: ['foo', { method: 'GET' }, { url: /foo/, status: 200 }],
        });

        chai.expect(() => validateConfig(config)).to.not.throw();
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
    it('WHEN method is lower case THEN expect it upper-cased', () => {
        chai.expect(
            mapToRequests([{ method: 'get' } as unknown as Request])
        ).to.deep.equal([{ url: undefined, status: undefined, method: 'GET' }]);
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
    it('WHEN request method is lower case THEN expect it to match the upper-case entry', () => {
        // browsers upper-case only the standard methods, so fetch keeps 'patch'
        const config = createConfig({ requests: [{ method: 'PATCH' }] });
        const request: RequestSession = {
            requestId: '1',
            method: 'patch',
            url: 'http://foo',
            status: 400,
        };
        chai.expect(isRequestExcluded(request, config)).to.be.true;
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
