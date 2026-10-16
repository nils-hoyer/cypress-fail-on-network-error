import * as chai from 'chai';
import { AssertionError } from 'chai';
import { readFileSync } from 'fs';
import * as index from './../dist/index.js';
import failOnNetworkError, {
    addIgnoredRequestsCommands,
    type Config,
    type RequestMatcher,
    type RequestSession,
} from './../dist/index.js';
import {
    createConfig,
    entryToString,
    escapeMarkdown,
    isRequestExcluded,
    isSameEntry,
    mapToRequests,
    validateConfig,
} from './../dist/internal.js';

type Listener = (...args: any[]) => unknown;
let listeners: Record<string, Listener[]> = {};

type LogOptions = {
    name: string;
    displayName: string;
    message: string;
    consoleProps: () => Record<string, unknown>;
};
let logs: LogOptions[] = [];

let customCommands: Record<string, (...args: any[]) => unknown> = {};

const emit = (eventName: string, ...args: unknown[]) =>
    listeners[eventName]?.forEach((listener) => listener(...args));

const incomingRequest = (
    requestId: string,
    method: string,
    url: string,
    resourceType?: string,
    headers?: Record<string, string | string[]>
) =>
    emit('request:event', 'incoming:request', {
        requestId,
        method,
        url,
        resourceType,
        headers,
    });

const responseReceived = (
    requestId: string,
    status: number,
    headers?: Record<string, string | string[]>
) => emit('request:event', 'response:received', { requestId, status, headers });

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
    logs = [];
    (globalThis as any).Cypress = {
        on: (eventName: string, listener: Listener) => {
            (listeners[eventName] ??= []).push(listener);
        },
        Promise,
        log: (options: LogOptions) => {
            logs.push(options);
        },
        Commands: {
            addAll: (commands: typeof customCommands) => {
                customCommands = { ...customCommands, ...commands };
            },
        },
    };
    customCommands = {};
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
            ignoreRequests: ['foo'],
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
    const importsOf = (file: string) =>
        [
            ...readFileSync(file, 'utf8').matchAll(
                /^import [^;]* from '([^']+)';$/gm
            ),
        ].map((match) => match[1]);

    // the plugin is bundled into every user's support file
    it('WHEN the plugin is built THEN expect it to import only chai and its helpers', () => {
        chai.expect(importsOf('dist/index.js')).to.deep.equal([
            'chai',
            './internal.js',
        ]);
        chai.expect(importsOf('dist/internal.js')).to.deep.equal([]);
    });

    // the helpers are in dist/internal.js, which the exports map does not list
    it('WHEN the plugin is imported THEN expect it to export only the public API', () => {
        chai.expect(Object.keys(index).sort()).to.deep.equal([
            'addIgnoredRequestsCommands',
            'default',
        ]);
    });
});

describe('failOnNetworkError() called more than once', () => {
    let warnings: unknown[][];
    const warn = console.warn;

    beforeEach(() => {
        warnings = [];
        console.warn = (...args: unknown[]) => {
            warnings.push(args);
        };
    });

    afterEach(() => {
        console.warn = warn;
    });

    it('WHEN called once THEN expect no warning', () => {
        failOnNetworkError();

        chai.expect(warnings).to.be.empty;
    });

    it('WHEN called twice THEN expect a warning with the prefix', () => {
        failOnNetworkError();
        failOnNetworkError();

        chai.expect(warnings).to.have.length(1);
        chai.expect(String(warnings[0][0])).to.match(
            /^cypress-fail-on-network-error: failOnNetworkError\(\) was called more than once/
        );
    });

    it('WHEN only the earlier call excludes a request THEN expect assertion error at command:end', () => {
        failOnNetworkError({ ignoreRequests: ['foo'] });
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 500);

        chai.expect(commandEnd).to.throw(AssertionError);
    });

    it('WHEN only the latest call excludes a request THEN expect no error', () => {
        failOnNetworkError();
        failOnNetworkError({ ignoreRequests: ['foo'] });

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 500);

        chai.expect(commandEnd).to.not.throw();
    });

    it('WHEN the latest call has an invalid config THEN expect the earlier call to stay active', () => {
        failOnNetworkError();
        chai.expect(() =>
            failOnNetworkError({ ignoreRequests: [42] } as unknown as Config)
        ).to.throw(Error);

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 500);

        chai.expect(commandEnd).to.throw(AssertionError);
        chai.expect(warnings).to.be.empty;
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
        failOnNetworkError({ ignoreRequests: [{ url: 'foo', status: 200 }] });

        incomingRequest('1', 'GET', 'http://foo');

        expectNoFailure(() => responseReceived('1', 200));
    });

    it('WHEN response matches no entry THEN expect assertion error with prefix at command:end', () => {
        failOnNetworkError({ ignoreRequests: [{ url: 'foo', status: 200 }] });

        incomingRequest('1', 'GET', 'http://foo');

        expectFailureAtCommandEnd(() => responseReceived('1', 500));
    });

    it('WHEN request error matches no entry THEN expect assertion error with prefix at command:end', () => {
        failOnNetworkError({ ignoreRequests: [{ status: 200 }] });

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

    [{}, { ignoreRequests: ['foo'] }].forEach((config: Config) => {
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

    it('WHEN a predicate throws THEN expect a plain Error naming the request at command:end', () => {
        failOnNetworkError({
            ignoreRequests: [
                () => {
                    throw new Error('predicate broke');
                },
            ],
        });

        incomingRequest('1', 'GET', 'http://foo');
        chai.expect(() => responseReceived('1', 500)).to.not.throw();

        chai.expect(commandEnd)
            .to.throw(Error)
            .with.property('constructor', Error);
        chai.expect(commandEnd).to.not.throw();
    });

    it('WHEN a predicate throws THEN expect the message to name the request and the error', () => {
        failOnNetworkError({
            ignoreRequests: [
                () => {
                    throw new Error('predicate broke');
                },
            ],
        });

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 500);

        chai.expect(commandEnd)
            .to.throw()
            .with.property('message')
            .that.matches(/^cypress-fail-on-network-error:/)
            .and.contains('GET http://foo')
            .and.contains('predicate broke');
    });

    it('WHEN a predicate threw after the last command THEN expect test:after:run to drop it', () => {
        failOnNetworkError({
            ignoreRequests: [
                () => {
                    throw new Error('predicate broke');
                },
            ],
        });

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 500);
        testAfterRun();

        chai.expect(commandEnd).to.not.throw();
    });

    it('WHEN a predicate checks headers THEN expect request and response headers with lower-case names', () => {
        let received: RequestSession | undefined;
        failOnNetworkError({
            ignoreRequests: [
                (request) => {
                    received = request;
                    return true;
                },
            ],
        });

        incomingRequest('1', 'GET', 'http://foo', 'fetch', {
            'X-Expected-Error': 'true',
        });
        responseReceived('1', 500, {
            'content-type': 'application/json',
            'set-cookie': ['a=1', 'b=2'],
        });

        chai.expect(received).to.deep.include({
            requestHeaders: { 'x-expected-error': 'true' },
            responseHeaders: {
                'content-type': 'application/json',
                'set-cookie': ['a=1', 'b=2'],
            },
        });
    });

    it('WHEN events have no headers THEN expect no headers on the request', () => {
        let received: RequestSession | undefined;
        failOnNetworkError({
            ignoreRequests: [
                (request) => {
                    received = request;
                    return true;
                },
            ],
        });

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 500);

        chai.expect(received?.requestHeaders).to.be.undefined;
        chai.expect(received?.responseHeaders).to.be.undefined;
    });

    it('WHEN event is not a request event THEN expect it to be ignored', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');

        expectNoFailure(() =>
            emit('request:event', 'unknown:event', { requestId: '1' })
        );
    });
});

describe('failure message and command log', () => {
    it('WHEN one request fails and another is excluded THEN expect the message to list only the failing one', () => {
        failOnNetworkError({ ignoreRequests: ['foo'] });

        incomingRequest('1', 'GET', 'http://foo');
        incomingRequest('2', 'POST', 'http://bar');
        responseReceived('1', 500);
        responseReceived('2', 500);

        chai.expect(commandEnd)
            .to.throw(AssertionError)
            .with.property(
                'message',
                'cypress-fail-on-network-error:\nPOST http://bar → 500'
            );
    });

    it('WHEN two requests fail THEN expect one line each', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        incomingRequest('2', 'GET', 'http://bar');
        responseReceived('1', 404);
        requestError('2', 'socket hang up');

        chai.expect(commandEnd)
            .to.throw(AssertionError)
            .with.property(
                'message',
                'cypress-fail-on-network-error:\nGET http://foo → 404\nGET http://bar → socket hang up'
            );
    });

    it('WHEN a failure was thrown THEN expect the next failure to list only new requests', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 500);
        chai.expect(commandEnd).to.throw(AssertionError);

        incomingRequest('2', 'GET', 'http://bar');
        responseReceived('2', 500);
        chai.expect(commandEnd)
            .to.throw(AssertionError)
            .with.property('message')
            .that.does.not.contain('http://foo');
    });

    it('WHEN a request fails THEN expect it logged at command:end with its details', () => {
        failOnNetworkError({ ignoreRequests: [{ status: 200 }] });

        incomingRequest('1', 'GET', 'http://foo/a_b');
        responseReceived('1', 500);
        chai.expect(logs).to.be.empty;
        chai.expect(commandEnd).to.throw(AssertionError);

        chai.expect(logs).to.have.length(1);
        chai.expect(logs[0]).to.include({
            name: 'unexpected',
            message: 'GET http://foo/a\\_b → 500',
        });
        chai.expect(logs[0].consoleProps()).to.deep.equal({
            Request: 'GET http://foo/a_b',
            Status: 500,
            'Entries tried': mapToRequests([{ status: 200 }]),
        });
    });

    it('WHEN a request fails without a response THEN expect its error in the details', () => {
        failOnNetworkError();

        incomingRequest('1', 'GET', 'http://foo');
        requestError('1', 'socket hang up');
        chai.expect(commandEnd).to.throw(AssertionError);

        chai.expect(logs[0].consoleProps()).to.include({
            Error: 'socket hang up',
        });
    });

    it('WHEN debug is off THEN expect ignored requests not to be logged', () => {
        failOnNetworkError({ ignoreRequests: ['foo'] });

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 200);
        commandEnd();

        chai.expect(logs).to.be.empty;
    });

    it('WHEN debug is on THEN expect each ignored request logged with the entry that ignored it', () => {
        failOnNetworkError({
            ignoreRequests: [{ method: 'POST' }, { url: 'foo', status: 200 }],
            debug: true,
        });

        incomingRequest('1', 'GET', 'http://foo');
        responseReceived('1', 200);
        chai.expect(commandEnd).to.not.throw();

        chai.expect(logs).to.have.length(1);
        chai.expect(logs[0]).to.include({
            name: 'ignored',
            message:
                "**{ url: 'foo', status: 200 }** matched GET http://foo → 200",
        });
        chai.expect(logs[0].consoleProps()).to.deep.equal({
            Request: 'GET http://foo',
            Status: 200,
            'Ignored by': mapToRequests([{ url: 'foo', status: 200 }])[0],
            'As RegExp': /foo/,
        });
    });

    it('WHEN debug is on and a request fails THEN expect both logged in order before the error', () => {
        failOnNetworkError({ ignoreRequests: ['foo'], debug: true });

        incomingRequest('1', 'GET', 'http://foo');
        incomingRequest('2', 'GET', 'http://bar');
        responseReceived('1', 200);
        responseReceived('2', 500);
        chai.expect(commandEnd).to.throw(AssertionError);

        chai.expect(logs.map((log) => log.name)).to.deep.equal([
            'ignored',
            'unexpected',
        ]);
    });
});

describe('addIgnoredRequestsCommands()', () => {
    const register = (config: Config) => {
        const failOnNetwork = failOnNetworkError(config);
        addIgnoredRequestsCommands(failOnNetwork);
        return failOnNetwork;
    };

    it('WHEN called THEN expect the five commands registered', () => {
        register({});

        chai.expect(Object.keys(customCommands)).to.have.members([
            'getIgnoredRequests',
            'setIgnoredRequests',
            'addIgnoredRequests',
            'deleteIgnoredRequests',
            'waitForRequests',
        ]);
    });

    it('WHEN getIgnoredRequests runs THEN expect it to yield ignoreRequests', async () => {
        const { getConfig } = register({ ignoreRequests: ['foo'] });

        customCommands.getIgnoredRequests();

        chai.expect(await runCommands()).to.equal(getConfig().ignoreRequests);
    });

    it('WHEN setIgnoredRequests runs THEN expect ignoreRequests replaced and other options kept', () => {
        const { getConfig } = register({
            ignoreRequests: ['foo'],
            debug: true,
        });

        customCommands.setIgnoredRequests(['bar']);

        chai.expect(getConfig()).to.deep.equal(
            createConfig({ ignoreRequests: ['bar'], debug: true })
        );
    });

    it('WHEN addIgnoredRequests runs THEN expect the entries appended', () => {
        const { getConfig } = register({ ignoreRequests: ['foo'] });

        customCommands.addIgnoredRequests([{ status: 404 }]);

        chai.expect(getConfig().ignoreRequests).to.deep.equal(
            mapToRequests(['foo', { status: 404 }])
        );
    });

    it('WHEN deleteIgnoredRequests runs THEN expect equal entries removed, in any form', () => {
        const predicate = () => true;
        const { getConfig } = register({
            ignoreRequests: [
                'foo',
                { url: /foo/ },
                { status: 404 },
                predicate,
                () => true,
            ],
        });

        customCommands.deleteIgnoredRequests([
            { url: 'foo' },
            { status: { from: 404, to: 404 } },
            predicate,
        ]);

        chai.expect(
            getConfig().ignoreRequests.map((entry) => entryToString(entry))
        ).to.deep.equal(['{ url: /foo/ }', '{ predicate: function }']);
    });

    it('WHEN deleteIgnoredRequests gets an invalid entry THEN expect a plain Error', () => {
        register({ ignoreRequests: ['foo'] });

        chai.expect(() => customCommands.deleteIgnoredRequests([42]))
            .to.throw(Error)
            .with.property('constructor', Error);
    });

    it('WHEN waitForRequests runs THEN expect it to wait like the returned waitForRequests', async () => {
        register({});

        customCommands.waitForRequests(1000);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(500, 700);
    });
});

describe('isSameEntry()', () => {
    const entry = (request: string | RequestMatcher) =>
        mapToRequests([request])[0];

    [
        ['foo', { url: 'foo' }, true],
        ['foo', { url: /foo/ }, false],
        [{ status: 404 }, { status: { from: 404, to: 404 } }, true],
        [{ method: 'get' }, { method: 'GET' }, true],
        [{ url: 'foo', status: 404 }, { url: 'foo' }, false],
    ].forEach(([a, b, expected]) => {
        it(`WHEN entries are ${JSON.stringify(a)} and ${JSON.stringify(b)} THEN expect ${expected}`, () => {
            chai.expect(
                isSameEntry(
                    entry(a as string | RequestMatcher),
                    entry(b as string | RequestMatcher)
                )
            ).to.equal(expected);
        });
    });

    it('WHEN predicates are different functions THEN expect false', () => {
        chai.expect(
            isSameEntry(
                entry({ predicate: () => true }),
                entry({ predicate: () => true })
            )
        ).to.be.false;
    });
});

describe('entryToString()', () => {
    [
        [{ url: 'foo' }, "{ url: 'foo' }"],
        [{ url: /fo\/o/i }, '{ url: /fo\\/o/i }'],
        [{ url: "it's" }, "{ url: 'it\\'s' }"],
        [{ method: 'get' }, "{ method: 'GET' }"],
        [{ method: ['GET', 'PUT'] }, "{ method: ['GET', 'PUT'] }"],
        [{ status: 404 }, '{ status: 404 }'],
        [
            { status: { from: 200, to: 399 } },
            '{ status: { from: 200, to: 399 } }',
        ],
        [
            { url: 'foo', method: 'GET', status: 500 },
            "{ url: 'foo', method: 'GET', status: 500 }",
        ],
    ].forEach(([entry, expected]) => {
        it(`WHEN entry is ${expected} THEN expect it written like the config`, () => {
            chai.expect(
                entryToString(mapToRequests([entry as RequestMatcher])[0])
            ).to.equal(expected);
        });
    });

    it('WHEN entry is a named function THEN expect its name', () => {
        function isSourceMap() {
            return true;
        }
        chai.expect(entryToString(mapToRequests([isSourceMap])[0])).to.equal(
            '{ predicate: isSourceMap }'
        );
    });
});

describe('escapeMarkdown()', () => {
    it('WHEN text has Markdown characters THEN expect them escaped', () => {
        chai.expect(escapeMarkdown('a*b_c`d[e](f)')).to.equal(
            'a\\*b\\_c\\`d\\[e\\]\\(f\\)'
        );
    });
});

describe('waitForRequests()', function () {
    this.timeout(5000);

    it('WHEN request failed without a response THEN expect it to resolve at the first check', async () => {
        const { waitForRequests } = failOnNetworkError({
            ignoreRequests: ['foo'],
        });

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
        const { waitForRequests } = failOnNetworkError({
            ignoreRequests: ['foo'],
        });

        waitForRequests(2000);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(500, 700);
    });

    it('WHEN request arrives just after the command starts THEN expect it to wait for that request', async () => {
        const { waitForRequests } = failOnNetworkError({
            ignoreRequests: ['foo'],
        });

        waitForRequests(3000);
        // the plugin learns about a request a few ms after cy.visit resolves
        setTimeout(() => incomingRequest('1', 'GET', 'http://foo'), 20);
        setTimeout(() => responseReceived('1', 200), 800);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(800, 1200);
    });

    it('WHEN request is still pending at the timeout THEN expect it to resolve without failing', async () => {
        const { waitForRequests } = failOnNetworkError({
            ignoreRequests: ['foo'],
        });

        incomingRequest('1', 'GET', 'http://foo');
        waitForRequests(1200);

        const start = Date.now();
        await runCommands();
        chai.expect(Date.now() - start).to.be.within(1200, 1400);
    });

    it('WHEN request is made after waitForRequests is called THEN expect it to wait for that request', async () => {
        const { waitForRequests } = failOnNetworkError({
            ignoreRequests: ['foo'],
        });

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
            ignoreRequests: ['foo'],
        });

        setConfig({ ignoreRequests: ['bar'] });
        testAfterRun();

        chai.expect(getConfig()).to.deep.equal(
            createConfig({ ignoreRequests: ['foo'] })
        );
    });

    it('WHEN entries were added to getConfig() during a test THEN expect them gone after test:after:run', () => {
        const { getConfig } = failOnNetworkError({ ignoreRequests: ['foo'] });

        getConfig().ignoreRequests.push({ url: 'bar' });
        testAfterRun();

        chai.expect(getConfig()).to.deep.equal(
            createConfig({ ignoreRequests: ['foo'] })
        );
    });

    it('WHEN an entry of getConfig() was changed during a test THEN expect the original entry after test:after:run', () => {
        const { getConfig } = failOnNetworkError({ ignoreRequests: ['foo'] });

        getConfig().ignoreRequests[0].url = 'bar';
        testAfterRun();

        chai.expect(getConfig()).to.deep.equal(
            createConfig({ ignoreRequests: ['foo'] })
        );
    });
});

describe('types', () => {
    it('WHEN an entry is a function or sets predicate THEN expect it to compile', () => {
        const config: Config = {
            ignoreRequests: [
                (request) => request.status === 404,
                { method: 'POST', predicate: (request) => !request.error },
            ],
        };

        chai.expect(() => validateConfig(config)).to.not.throw();
    });

    it('WHEN method is any string or a list of methods THEN expect it to compile', () => {
        const config: Config = {
            ignoreRequests: [
                { method: 'HEAD' },
                { method: 'OPTIONS' },
                { method: 'PURGE' },
                { method: ['GET', 'POST'] },
            ],
        };

        chai.expect(() => validateConfig(config)).to.not.throw();
    });
});

describe('getConfig()', () => {
    // the plugin matches against normalized entries, where a string would
    // exclude every request and a numeric status none
    it('WHEN a string or a numeric status is added to getConfig() THEN expect a type error', () => {
        const { getConfig } = failOnNetworkError({ ignoreRequests: ['foo'] });

        // @ts-expect-error a string entry is not normalized to { url }
        getConfig().ignoreRequests.push('bar');
        // @ts-expect-error a numeric status is not normalized to a range
        getConfig().ignoreRequests.push({ status: 500 });
    });

    it('WHEN config is created THEN expect getConfig() to return normalized entries', () => {
        const { getConfig } = failOnNetworkError({
            ignoreRequests: [
                'foo',
                { method: 'get', status: 500 } as unknown as RequestMatcher,
            ],
        });

        chai.expect(getConfig().ignoreRequests).to.deep.equal([
            {
                url: 'foo',
                method: undefined,
                status: undefined,
                predicate: undefined,
            },
            {
                url: undefined,
                method: 'GET',
                status: { from: 500, to: 500 },
                predicate: undefined,
            },
        ]);
    });
});

describe('removed requests option', () => {
    // a plain Error, as for other config mistakes
    [
        [{ requests: ['foo'] }, "{ requests: ['foo'] }"],
        [
            { ignoreRequests: ['foo'], requests: undefined },
            "{ ignoreRequests: ['foo'], requests: undefined }",
        ],
    ].forEach(([config, title]) => {
        it(`WHEN config ${title} THEN expect error that requests was renamed`, () => {
            chai.expect(() => validateConfig(config as Config))
                .to.throw(Error)
                .with.property(
                    'message',
                    'cypress-fail-on-network-error: config.requests was renamed to ignoreRequests'
                );
        });
    });

    it('WHEN config sets requests THEN expect failOnNetworkError to throw', () => {
        chai.expect(() =>
            failOnNetworkError({ requests: ['foo'] } as Config)
        ).to.throw(Error, 'config.requests was renamed to ignoreRequests');
    });

    it('WHEN getConfig() is read THEN expect no requests property', () => {
        const { getConfig } = failOnNetworkError({ ignoreRequests: ['foo'] });

        chai.expect(getConfig()).to.not.have.property('requests');
        // @ts-expect-error requests was removed from NormalizedConfig
        getConfig().requests;
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
            { ignoreRequests: [{ url: 'url', status: '400', method: 'GET' }] },
            'config.ignoreRequests[0].status'
        );
    });

    it('WHEN config is invalid status object THEN expect error', () => {
        expectInvalid(
            {
                ignoreRequests: [
                    { url: 'url', status: { from: 200 }, method: 'GET' },
                ],
            },
            'config.ignoreRequests[0].status.to'
        );
    });

    it('WHEN config is valid THEN expect no error', () => {
        const config: Config = {
            ignoreRequests: [
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
            { ignoreRequests: ['foo'], request: undefined },
            "{ ignoreRequests: ['foo'], request: undefined }",
        ],
    ].forEach(([config, title]) => {
        it(`WHEN config ${title} has an unknown key THEN expect error naming the key`, () => {
            expectInvalid(config, 'config has unknown keys request');
        });
    });

    it('WHEN debug is not a boolean THEN expect error naming config.debug', () => {
        expectInvalid({ debug: 'yes' }, 'config.debug');
    });

    it('WHEN debug is a boolean THEN expect no error', () => {
        chai.expect(() => validateConfig({ debug: true })).to.not.throw();
    });

    it('WHEN ignoreRequests is undefined THEN expect no error', () => {
        chai.expect(() =>
            validateConfig({ ignoreRequests: undefined })
        ).to.not.throw();
    });

    ['foo', {}, null].forEach((requests) => {
        it(`WHEN ignoreRequests is ${JSON.stringify(requests)} THEN expect error naming config.ignoreRequests`, () => {
            expectInvalid(
                { ignoreRequests: requests },
                'config.ignoreRequests'
            );
        });
    });

    [42, /foo/, null, ['foo']].forEach((entry) => {
        it(`WHEN entry is ${String(entry)} THEN expect error naming the entry`, () => {
            expectInvalid(
                { ignoreRequests: ['foo', entry] },
                'config.ignoreRequests[1]'
            );
        });
    });

    [
        [{}, '{}'],
        [{ url: undefined }, '{ url: undefined }'],
        [{ url: '' }, "{ url: '' }"],
        ['', "''"],
    ].forEach(([entry, title]) => {
        it(`WHEN entry ${title} sets none of url, method or status THEN expect error naming the entry`, () => {
            expectInvalid(
                { ignoreRequests: ['foo', entry] },
                'config.ignoreRequests[1]'
            );
        });
    });

    [{ stauts: 404 }, { url: 'foo', stauts: 404 }].forEach((entry) => {
        it(`WHEN entry ${JSON.stringify(entry)} has an unknown key THEN expect error naming the entry and key`, () => {
            const config = { ignoreRequests: ['foo', entry] };
            expectInvalid(config, 'config.ignoreRequests[1]');
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
                { ignoreRequests: ['foo', entry] },
                'config.ignoreRequests[1].url'
            );
        });
    });

    it('WHEN entry sets only predicate THEN expect no error', () => {
        chai.expect(() =>
            validateConfig({ ignoreRequests: [{ predicate: () => true }] })
        ).to.not.throw();
    });

    it('WHEN predicate is not a function THEN expect error naming the entry and key', () => {
        expectInvalid(
            { ignoreRequests: ['foo', { predicate: true }] },
            'config.ignoreRequests[1].predicate'
        );
    });

    it('WHEN url is a RegExp that is not empty but matches every URL THEN expect no error', () => {
        chai.expect(() =>
            validateConfig({ ignoreRequests: [{ url: /.*/ }] })
        ).to.not.throw();
    });

    ['(', { url: '[a-' }].forEach((entry) => {
        it(`WHEN url ${JSON.stringify(entry)} is not a valid regular expression THEN expect error naming the entry`, () => {
            expectInvalid(
                { ignoreRequests: ['foo', entry] },
                'config.ignoreRequests[1]'
            );
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
                { ignoreRequests: ['foo', entry] },
                `config.ignoreRequests[1].${key}`
            );
        });
    });

    [
        [null, 'config must be an object, got null'],
        [['foo'], 'config must be an object, got Array'],
        [
            { ignoreRequests: {} },
            'config.ignoreRequests must be an array, got Object',
        ],
        [
            { ignoreRequests: [42] },
            'must be a string, an object or a function, got number',
        ],
        [
            { ignoreRequests: [/foo/] },
            'must be a string, an object or a function, got RegExp',
        ],
        [
            { ignoreRequests: [{ url: () => true }] },
            '.url must be a string or a RegExp, got function',
        ],
        [
            { ignoreRequests: [{ status: new Date() }] },
            '.status must be a number or a { from, to } range, got Date',
        ],
        [
            { ignoreRequests: [{ status: { from: 200, to: '299' } }] },
            '.status.to must be a number, got string',
        ],
        [
            { ignoreRequests: [{ status: { from: undefined, to: 299 } }] },
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

    [
        [{ method: [] }, '{ method: [] }', 'config.ignoreRequests[1].method'],
        [
            { method: ['GET', 42] },
            "{ method: ['GET', 42] }",
            'config.ignoreRequests[1].method[1]',
        ],
        [
            { method: ['GET', ''] },
            "{ method: ['GET', ''] }",
            'config.ignoreRequests[1].method[1]',
        ],
        [{ method: {} }, '{ method: {} }', 'config.ignoreRequests[1].method'],
    ].forEach(([entry, title, name]) => {
        it(`WHEN entry ${title} has an invalid method THEN expect error naming ${name}`, () => {
            expectInvalid({ ignoreRequests: ['foo', entry] }, name as string);
        });
    });

    it('WHEN config is normalized by createConfig THEN expect no error', () => {
        const config = createConfig({
            ignoreRequests: [
                'foo',
                { method: 'GET' },
                { url: /foo/, status: 200 },
            ],
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
            {
                url: 'url1',
                status: undefined,
                method: undefined,
                predicate: undefined,
            },
            {
                url: 'url2',
                status: { from: 400, to: 400 },
                method: 'GET',
                predicate: undefined,
            },
            {
                url: undefined,
                status: undefined,
                method: 'GET',
                predicate: undefined,
            },
            {
                url: undefined,
                status: { from: 200, to: 399 },
                method: undefined,
                predicate: undefined,
            },
        ]);
    });
    it('WHEN method is lower case THEN expect it upper-cased', () => {
        chai.expect(
            mapToRequests([{ method: 'get' } as unknown as RequestMatcher])
        ).to.deep.equal([
            {
                url: undefined,
                status: undefined,
                method: 'GET',
                predicate: undefined,
            },
        ]);
    });
    it('WHEN entry is a function THEN expect it as predicate', () => {
        const predicate = () => true;

        chai.expect(mapToRequests([predicate])).to.deep.equal([
            {
                url: undefined,
                method: undefined,
                status: undefined,
                predicate,
            },
        ]);
    });

    it('WHEN method is a list THEN expect each method upper-cased', () => {
        chai.expect(
            mapToRequests([{ method: ['get', 'Purge'] }])
        ).to.deep.equal([
            {
                url: undefined,
                status: undefined,
                method: ['GET', 'PURGE'],
                predicate: undefined,
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
                predicate: undefined,
            },
        ]);
    });
});

describe('isRequestExcluded()', () => {
    it('WHEN request is excluded THEN expect true', () => {
        const config = createConfig({
            ignoreRequests: [{ url: 'foo', status: 400, method: 'GET' }],
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
            ignoreRequests: [{ url: 'foo', status: 200, method: 'POST' }],
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
        const config = createConfig({ ignoreRequests: [{ method: 'PATCH' }] });
        const request: RequestSession = {
            requestId: '1',
            method: 'patch',
            url: 'http://foo',
            status: 400,
        };
        chai.expect(isRequestExcluded(request, config)).to.be.true;
    });

    [
        [{ method: 'HEAD' }, 'HEAD', true],
        [{ method: 'OPTIONS' }, 'OPTIONS', true],
        // browsers keep a custom method's case
        [{ method: 'PURGE' }, 'purge', true],
        [{ method: ['GET', 'PUT'] }, 'PUT', true],
        [{ method: ['GET', 'PUT'] }, 'POST', false],
    ].forEach(([entry, method, expected]) => {
        it(`WHEN entry is ${JSON.stringify(entry)} and request method is ${method} THEN expect ${expected}`, () => {
            const config = createConfig({
                ignoreRequests: [entry as RequestMatcher],
            });
            const request: RequestSession = {
                requestId: '1',
                method: method as string,
                url: 'http://foo',
                status: 500,
            };
            chai.expect(isRequestExcluded(request, config)).to.equal(expected);
        });
    });

    describe('WHEN entry has a predicate', () => {
        const request: RequestSession = {
            requestId: '1',
            method: 'GET',
            url: 'http://foo',
            status: 404,
        };

        [true, false].forEach((result) => {
            it(`WHEN the predicate returns ${result} THEN expect ${result}`, () => {
                const config = createConfig({ ignoreRequests: [() => result] });

                chai.expect(isRequestExcluded(request, config)).to.equal(
                    result
                );
            });
        });

        it('WHEN the predicate is called THEN expect it to get a copy of the request', () => {
            let received: RequestSession | undefined;
            const config = createConfig({
                ignoreRequests: [
                    (request) => {
                        received = request;
                        request.status = 200;
                        return false;
                    },
                ],
            });

            isRequestExcluded(request, config);

            chai.expect(received).to.deep.equal({ ...request, status: 200 });
            chai.expect(request.status).to.equal(404);
        });

        it('WHEN the other fields of its entry do not match THEN expect the predicate not to be called', () => {
            let called = false;
            const config = createConfig({
                ignoreRequests: [
                    {
                        status: 500,
                        predicate: () => {
                            called = true;
                            return true;
                        },
                    },
                ],
            });

            chai.expect(isRequestExcluded(request, config)).to.be.false;
            chai.expect(called).to.be.false;
        });
    });

    describe('WHEN config has status range 200 to 399', () => {
        const config = createConfig({
            ignoreRequests: [{ status: { from: 200, to: 399 } }],
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
            ignoreRequests: [{ status: { from: 399, to: 200 } }],
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
