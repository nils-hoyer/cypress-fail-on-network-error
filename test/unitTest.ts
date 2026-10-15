import * as chai from 'chai';
import { AssertionError } from 'chai';
import { readFileSync } from 'fs';
import failOnNetworkError, {
    type Config,
    type Request,
    type RequestMatcher,
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

// the message Chrome reports when the page aborts a request or navigates away
const requestCancelled = (requestId: string) =>
    requestError(
        requestId,
        `CDP Fetch request canceled by the browser: root:${requestId}`
    );

const windowUnload = () => emit('window:unload');

const testAfterRun = () => emit('test:after:run');

const commandEnd = () => emit('command:end');

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
    it('WHEN failOnNetworkError is created with null THEN expect error', () => {
        chai.expect(() => failOnNetworkError(null as unknown as Config))
            .to.throw(Error)
            .with.property('constructor', Error);
    });
});

describe('dist/index.js', () => {
    // the plugin is bundled into every user's support file
    it('WHEN the plugin is built THEN expect it to import only chai', () => {
        const source = readFileSync('dist/index.js', 'utf8');
        const imports = [
            ...source.matchAll(/^import .* from '([^']+)';$/gm),
        ].map((match) => match[1]);

        chai.expect(imports).to.deep.equal(['chai']);
    });
});

describe('request:event handler', () => {
    // the plugin fails the test from command:end, inside Cypress's command
    // queue; an error thrown in request:event would be an uncaught exception
    const expectFailureAtCommandEnd = (fireEvent: () => void) => {
        chai.expect(fireEvent).to.not.throw();
        return chai
            .expect(commandEnd)
            .to.throw(AssertionError)
            .with.property('message')
            .that.match(/^cypress-fail-on-network-error:/);
    };

    const expectNoFailure = (fireEvent: () => void) => {
        chai.expect(fireEvent).to.not.throw();
        chai.expect(commandEnd).to.not.throw();
    };

    it('WHEN response is excluded THEN expect no error', () => {
        failOnNetworkError({ requests: [{ url: 'foo', status: 200 }] });

        incomingRequest('1', 'GET', 'http://foo');

        expectNoFailure(() => responseReceived('1', 200));
    });

    it('WHEN response matches no entry THEN expect assertion error with prefix at command:end', () => {
        failOnNetworkError({ requests: [{ url: 'foo', status: 200 }] });

        incomingRequest('1', 'GET', 'http://foo');

        expectFailureAtCommandEnd(() => responseReceived('1', 500));
    });

    it('WHEN request error matches no entry THEN expect assertion error with prefix at command:end', () => {
        failOnNetworkError({ requests: [{ status: 200 }] });

        incomingRequest('1', 'GET', 'http://foo');

        expectFailureAtCommandEnd(() => requestError('1', 'socket hang up'));
    });

    it('WHEN request error matches no entry THEN expect error message in assertion error', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');

        expectFailureAtCommandEnd(() =>
            requestError('1', 'socket hang up')
        ).that.contains('socket hang up');
    });

    it('WHEN request is cancelled by the browser THEN expect no error', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');

        expectNoFailure(() => requestCancelled('1'));
    });

    it('WHEN request error only mentions a cancellation THEN expect assertion error', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');

        expectFailureAtCommandEnd(() =>
            requestError(
                '1',
                'proxy error: CDP Fetch request canceled by the browser'
            )
        );
    });

    it('WHEN page unloads with a request pending THEN expect a later response to be checked', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        windowUnload();

        expectFailureAtCommandEnd(() => responseReceived('1', 500));
    });

    it('WHEN failure was thrown at command:end THEN expect the next command:end not to throw it again', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        expectFailureAtCommandEnd(() => responseReceived('1', 500));

        chai.expect(commandEnd).to.not.throw();
    });

    it('WHEN two responses match no entry before command:end THEN expect one assertion error listing both', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        incomingRequest('2', 'GET', 'http://bar');
        responseReceived('1', 500);

        expectFailureAtCommandEnd(() => responseReceived('2', 404))
            .that.contains('http://foo')
            .and.contains('http://bar');
    });

    it('WHEN failure is recorded after the last command THEN expect test:after:run to drop it', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 500);
        testAfterRun();

        chai.expect(commandEnd).to.not.throw();
    });

    it('WHEN response belongs to a request from before test:after:run THEN expect it to be ignored', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        testAfterRun();

        expectNoFailure(() => responseReceived('1', 500));
    });

    [{}, { requests: ['foo'] }].forEach((config: Config) => {
        it(`WHEN request error belongs to a request from before test:after:run with config ${JSON.stringify(config)} THEN expect it to be ignored`, () => {
            failOnNetworkError(config);

            incomingRequest('1', 'GET', 'http://foo');
            testAfterRun();

            expectNoFailure(() => requestError('1', 'socket hang up'));
        });
    });

    ['script', 'stylesheet', 'image', 'document', 'other'].forEach(
        (resourceType) => {
            it(`WHEN resource type is ${resourceType} THEN expect the request to be ignored`, () => {
                failOnNetworkError();

                incomingRequest('1', 'GET', 'http://foo', resourceType);

                expectNoFailure(() => responseReceived('1', 500));
            });
        }
    );

    ['xhr', 'fetch', undefined].forEach((resourceType) => {
        it(`WHEN resource type is ${resourceType} THEN expect the request to be checked`, () => {
            failOnNetworkError();

            incomingRequest('1', 'GET', 'http://foo', resourceType);

            expectFailureAtCommandEnd(() => responseReceived('1', 500));
        });
    });

    it('WHEN event is not a request event THEN expect it to be ignored', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');

        expectNoFailure(() =>
            emit('request:event', 'unknown:event', { requestId: '1' })
        );
    });
});

describe('waitForRequests()', function () {
    this.timeout(5000);

    it('WHEN request failed without a response THEN expect it to resolve at the first check', async () => {
        const { waitForRequests } = failOnNetworkError({ requests: ['foo'] });

        incomingRequest('1', 'GET', 'http://foo');
        requestError('1', 'socket hang up');
        waitForRequests(2000);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(500, 700);
    });

    it('WHEN request was cancelled by the browser THEN expect it to resolve at the first check', async () => {
        const { waitForRequests } = failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        requestCancelled('1');
        waitForRequests(2000);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(500, 700);
    });

    it('WHEN page unloads with a request pending THEN expect it to resolve at the first check', async () => {
        const { waitForRequests } = failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        windowUnload();
        waitForRequests(2000);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(500, 700);
    });

    it('WHEN no request was made THEN expect it to resolve at the first check', async () => {
        const { waitForRequests } = failOnNetworkError({ requests: ['foo'] });

        waitForRequests(2000);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(500, 700);
    });

    it('WHEN request arrives just after the command starts THEN expect it to wait for that request', async () => {
        const { waitForRequests } = failOnNetworkError({ requests: ['foo'] });

        waitForRequests(3000);
        // the plugin learns about a request a few ms after cy.visit resolves
        setTimeout(() => incomingRequest('1', 'GET', 'http://foo'), 20);
        setTimeout(() => responseReceived('1', 200), 800);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(800, 1200);
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

        getConfig().requests.push({ url: 'bar' });
        testAfterRun();

        chai.expect(getConfig()).to.deep.equal(
            createConfig({ requests: ['foo'] })
        );
    });

    it('WHEN an entry of getConfig() was changed during a test THEN expect the original entry after test:after:run', () => {
        const { getConfig } = failOnNetworkError({ requests: ['foo'] });

        getConfig().requests[0].url = 'bar';
        testAfterRun();

        chai.expect(getConfig()).to.deep.equal(
            createConfig({ requests: ['foo'] })
        );
    });
});

describe('types', () => {
    it('WHEN an entry is typed with the deprecated Request alias THEN expect it to compile as a RequestMatcher', () => {
        const entry: Request = { url: 'foo', method: 'GET', status: 500 };
        const matcher: RequestMatcher = entry;
        const config: Config = { requests: [entry, matcher] };

        chai.expect(() => validateConfig(config)).to.not.throw();
    });
});

describe('getConfig()', () => {
    // the plugin matches against normalized entries, where a string would
    // exclude every request and a numeric status none
    it('WHEN a string or a numeric status is added to getConfig() THEN expect a type error', () => {
        const { getConfig } = failOnNetworkError({ requests: ['foo'] });

        // @ts-expect-error a string entry is not normalized to { url }
        getConfig().requests.push('bar');
        // @ts-expect-error a numeric status is not normalized to a range
        getConfig().requests.push({ status: 500 });
    });

    it('WHEN config is created THEN expect getConfig() to return normalized entries', () => {
        const { getConfig } = failOnNetworkError({
            requests: [
                'foo',
                { method: 'get', status: 500 } as unknown as RequestMatcher,
            ],
        });

        chai.expect(getConfig().requests).to.deep.equal([
            { url: 'foo', method: undefined, status: undefined },
            { url: undefined, method: 'GET', status: { from: 500, to: 500 } },
        ]);
    });
});

describe('validateConfig()', () => {
    // a plain Error, not chai's AssertionError: a broken config is not a failed check
    const expectInvalid = (config: unknown, name: string) => {
        let error: unknown;
        try {
            validateConfig(config as Config);
        } catch (thrown) {
            error = thrown;
        }
        chai.expect(error).to.have.property('constructor', Error);
        chai.expect((error as Error).message)
            .to.match(/^cypress-fail-on-network-error:/)
            .and.contain(name);
    };

    it('WHEN config is invalid status type THEN expect error', () => {
        expectInvalid(
            { requests: [{ url: 'url', status: '400', method: 'GET' }] },
            'config.requests[0].status'
        );
    });

    it('WHEN config is invalid status object THEN expect error', () => {
        expectInvalid(
            {
                requests: [
                    { url: 'url', status: { from: 200 }, method: 'GET' },
                ],
            },
            'config.requests[0].status.to'
        );
    });

    it('WHEN config is valid THEN expect no error', () => {
        const config: Config = {
            requests: [
                'url',
                { url: 'url', status: 200, method: 'GET' },
                { url: 'url', status: { from: 200, to: 299 }, method: 'GET' },
            ],
        };

        chai.expect(() => validateConfig(config)).to.not.throw();
    });

    [null, 'foo', ['foo']].forEach((config) => {
        it(`WHEN config is ${JSON.stringify(config)} THEN expect error naming config`, () => {
            expectInvalid(config, 'config');
        });
    });

    [
        [{ request: ['foo'] }, "{ request: ['foo'] }"],
        [
            { requests: ['foo'], request: undefined },
            "{ requests: ['foo'], request: undefined }",
        ],
    ].forEach(([config, title]) => {
        it(`WHEN config ${title} has an unknown key THEN expect error naming the key`, () => {
            expectInvalid(config, 'config has unknown keys request');
        });
    });

    it('WHEN requests is undefined THEN expect no error', () => {
        chai.expect(() =>
            validateConfig({ requests: undefined })
        ).to.not.throw();
    });

    ['foo', {}, null].forEach((requests) => {
        it(`WHEN requests is ${JSON.stringify(requests)} THEN expect error naming config.requests`, () => {
            expectInvalid({ requests }, 'config.requests');
        });
    });

    [42, /foo/, null, ['foo']].forEach((entry) => {
        it(`WHEN entry is ${String(entry)} THEN expect error naming the entry`, () => {
            expectInvalid({ requests: ['foo', entry] }, 'config.requests[1]');
        });
    });

    [
        [{}, '{}'],
        [{ url: undefined }, '{ url: undefined }'],
        [{ url: '' }, "{ url: '' }"],
        ['', "''"],
    ].forEach(([entry, title]) => {
        it(`WHEN entry ${title} sets none of url, method or status THEN expect error naming the entry`, () => {
            expectInvalid({ requests: ['foo', entry] }, 'config.requests[1]');
        });
    });

    [{ stauts: 404 }, { url: 'foo', stauts: 404 }].forEach((entry) => {
        it(`WHEN entry ${JSON.stringify(entry)} has an unknown key THEN expect error naming the entry and key`, () => {
            const config = { requests: ['foo', entry] };
            expectInvalid(config, 'config.requests[1]');
            expectInvalid(config, 'stauts');
        });
    });

    [
        [{ url: /(?:)/ }, '{ url: /(?:)/ }'],
        [
            { url: new RegExp(''), status: 500 },
            "{ url: new RegExp(''), status: 500 }",
        ],
    ].forEach(([entry, title]) => {
        it(`WHEN url of entry ${title} is an empty RegExp THEN expect error naming the entry and key`, () => {
            expectInvalid(
                { requests: ['foo', entry] },
                'config.requests[1].url'
            );
        });
    });

    it('WHEN url is a RegExp that is not empty but matches every URL THEN expect no error', () => {
        chai.expect(() =>
            validateConfig({ requests: [{ url: /.*/ }] })
        ).to.not.throw();
    });

    ['(', { url: '[a-' }].forEach((entry) => {
        it(`WHEN url ${JSON.stringify(entry)} is not a valid regular expression THEN expect error naming the entry`, () => {
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
        it(`WHEN entry ${JSON.stringify(entry)} has an invalid ${key} THEN expect error naming the entry and key`, () => {
            expectInvalid(
                { requests: ['foo', entry] },
                `config.requests[1].${key}`
            );
        });
    });

    [
        [null, 'config must be an object, got null'],
        [['foo'], 'config must be an object, got Array'],
        [{ requests: {} }, 'config.requests must be an array, got Object'],
        [{ requests: [42] }, 'must be a string or an object, got number'],
        [{ requests: [/foo/] }, 'must be a string or an object, got RegExp'],
        [
            { requests: [{ url: () => true }] },
            '.url must be a string or a RegExp, got function',
        ],
        [
            { requests: [{ status: new Date() }] },
            '.status must be a number or a { from, to } range, got Date',
        ],
        [
            { requests: [{ status: { from: 200, to: '299' } }] },
            '.status.to must be a number, got string',
        ],
        [
            { requests: [{ status: { from: undefined, to: 299 } }] },
            '.status.from must be a number, got undefined',
        ],
    ].forEach(([config, message]) => {
        it(`WHEN config is invalid THEN expect the message to name the type it got: ${message}`, () => {
            chai.expect(() => validateConfig(config as Config)).to.throw(
                Error,
                message as string
            );
        });
    });

    it('WHEN config is normalized by createConfig THEN expect no error', () => {
        const config = createConfig({
            requests: ['foo', { method: 'GET' }, { url: /foo/, status: 200 }],
        });

        chai.expect(() => validateConfig(config)).to.not.throw();
    });
});

describe('mapToRequests()', () => {
    it('WHEN mapToRequests is called THEN expect normalized entries', () => {
        const requests = [
            'url1',
            { url: 'url2', status: 400, method: 'GET' },
            { method: 'GET' },
            { status: { from: 200, to: 399 } },
        ] as (string | RequestMatcher)[];

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
            mapToRequests([{ method: 'get' } as unknown as RequestMatcher])
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
        const config = createConfig({
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
        const config = createConfig({
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
        const config = createConfig({
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
        const config = createConfig({
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
