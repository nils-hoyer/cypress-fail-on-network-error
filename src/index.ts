import {
    createConfig,
    findIgnoringEntry,
    findRequest,
    invalid,
    isCancelledByBrowser,
    isSameEntry,
    logCheckedRequest,
    lowerCaseNames,
    mapToRequests,
    prefix,
    requestToString,
    validateConfig,
    waitUntil,
    type CheckedRequest,
    type Config,
    type IgnoredRequest,
    type NormalizedConfig,
    type NormalizedRequest,
    type RequestSession,
} from './internal.js';

export type {
    Config,
    Method,
    NormalizedConfig,
    NormalizedRequest,
    Range,
    RequestMatcher,
    RequestPredicate,
    RequestSession,
} from './internal.js';

// a request failed the test, like a failed assertion. Named like chai's
// AssertionError, so Cypress shows failures as before 2.0.
class AssertionError extends Error {
    name = 'AssertionError';
}

declare global {
    namespace Cypress {
        // registered by addIgnoredRequestsCommands()
        interface Chainable {
            getIgnoredRequests(): Chainable<NormalizedRequest[]>;
            setIgnoredRequests(
                ignoreRequests: IgnoredRequest[]
            ): Chainable<void>;
            addIgnoredRequests(
                ignoreRequests: IgnoredRequest[]
            ): Chainable<void>;
            deleteIgnoredRequests(
                ignoreRequests: IgnoredRequest[]
            ): Chainable<void>;
            waitForRequests(timeout?: number): Chainable<void>;
        }
    }
}

// the active call's marker, stored on the Cypress object under a global
// symbol, because the support file and a spec can be separate bundles, each
// with its own copy of this module
const activeInstanceKey = Symbol.for('cypress-fail-on-network-error');

export default function failOnNetworkError(_config: Config = {}) {
    let config: NormalizedConfig;
    let originConfig: NormalizedConfig;
    let requests: RequestSession[] = [];
    // requests checked since the last command:end, which logs them and throws
    // for those that matched no entry; ignored ones only with debug
    let checkedRequests: CheckedRequest[] = [];
    // set when a predicate threw, until the next command:end throws
    let predicateError: Error | undefined;

    const getRequests = () => requests;

    const getConfig = (): NormalizedConfig => config;
    const setConfig = (_config: Config): void => {
        validateConfig(_config);
        config = createConfig(_config);
        // a separate copy, so changes to getConfig() cannot leak into later tests
        originConfig = originConfig ?? createConfig(config);
    };

    const waitForRequests = (timeout = 10000): Cypress.Chainable<any> => {
        const requestsDone = () =>
            getRequests().every(
                (request: RequestSession) =>
                    request.status !== undefined ||
                    request.error !== undefined ||
                    request.cancelled === true
            );

        // create the promise when the command runs, not when it is queued,
        // and give Cypress's command timeout slack beyond our own timeout
        return cy
            .wrap(null, { log: false })
            .then({ timeout: timeout + 1000 }, () =>
                waitUntil(requestsDone, timeout)
            );
    };

    setConfig(_config);

    // a later call replaces this one, so a call in beforeEach or in a spec
    // does not add another set of listeners that checks every request too
    const instance = {};
    const cypress = Cypress as unknown as Record<symbol, object | undefined>;
    if (cypress[activeInstanceKey] !== undefined)
        console.warn(
            `${prefix} failOnNetworkError() was called more than once, so only the latest call checks requests. Call it once, in the support file.`
        );
    cypress[activeInstanceKey] = instance;
    const isActive = () => cypress[activeInstanceKey] === instance;

    Cypress.on('request:event', (eventName, event) => {
        if (!isActive()) return;
        if (eventName === 'incoming:request') {
            // check only XHR and fetch, like Cypress's command log; a request
            // without a resource type is checked as before
            const checkedResourceTypes = ['xhr', 'fetch', undefined];
            if (checkedResourceTypes.indexOf(event.resourceType) === -1) return;

            requests.push({
                requestId: event.requestId,
                method: event.method,
                url: event.url,
                requestHeaders: lowerCaseNames(event.headers),
                status: undefined,
            });
            return;
        }

        const subscribedEvents = ['request:error', 'response:received'];
        // a request from an earlier test was cleared by test:after:run
        const unknownRequest =
            findRequest(requests, event.requestId) === undefined;

        if (subscribedEvents.indexOf(eventName) === -1 || unknownRequest)
            return;

        // the page aborted the request or navigated away: not a network error
        if (
            eventName === 'request:error' &&
            isCancelledByBrowser(event.error?.message)
        ) {
            requests = requests.map((request: RequestSession) =>
                request.requestId === event.requestId
                    ? { ...request, cancelled: true }
                    : request
            );
            return;
        }

        requests = requests.map((request: RequestSession) => {
            if (request.requestId !== event.requestId) return request;
            return eventName === 'response:received'
                ? {
                      ...request,
                      status: event.status,
                      responseHeaders: lowerCaseNames(event.headers),
                  }
                : {
                      ...request,
                      error:
                          event.error?.message ??
                          'request failed without a response',
                  };
        });

        const request = findRequest(
            requests,
            event.requestId
        ) as RequestSession;
        try {
            const entries = getConfig().ignoreRequests;
            const ignoredBy = findIgnoringEntry(request, getConfig());
            if (ignoredBy === undefined || getConfig().debug)
                checkedRequests.push({
                    request,
                    ignoredBy,
                    entries: [...entries],
                });
        } catch (error) {
            // a broken predicate is a mistake in the config, not a failed check
            predicateError = invalid(
                `a predicate in ignoreRequests threw on ${request.method} ${request.url}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    });

    // request:event arrives from the server outside the command queue, where
    // a thrown error is an uncaught exception that uncaught:exception handlers
    // can hide. command:end runs inside the queue and fails the command.
    Cypress.on('command:end', () => {
        if (!isActive()) return;
        const checked = checkedRequests;
        checkedRequests = [];
        checked.forEach(logCheckedRequest);

        if (predicateError !== undefined) {
            const error = predicateError;
            predicateError = undefined;
            throw error;
        }
        const failed = checked.filter(({ ignoredBy }) => !ignoredBy);
        if (failed.length === 0) return;
        throw new AssertionError(
            `${prefix}\n${failed.map(({ request }) => requestToString(request)).join('\n')}`
        );
    });

    // Electron and Firefox send no event for a request that the browser
    // cancels when the page unloads, so waitForRequests would wait for it
    // until its timeout. A response that still arrives is checked.
    Cypress.on('window:unload', () => {
        if (!isActive()) return;
        requests = requests.map((request: RequestSession) =>
            request.status === undefined && request.error === undefined
                ? { ...request, cancelled: true }
                : request
        );
    });

    Cypress.on('test:after:run', () => {
        if (!isActive()) return;
        setConfig(originConfig);
        requests = [];
        checkedRequests = [];
        predicateError = undefined;
    });

    return {
        getConfig,
        setConfig,
        waitForRequests,
    };
}

/**
 * Registers the commands getIgnoredRequests, setIgnoredRequests,
 * addIgnoredRequests and deleteIgnoredRequests, which read and change
 * ignoreRequests for the current test, and waitForRequests.
 */
export const addIgnoredRequestsCommands = ({
    getConfig,
    setConfig,
    waitForRequests,
}: ReturnType<typeof failOnNetworkError>): void => {
    const setIgnoredRequests = (ignoreRequests: IgnoredRequest[]) =>
        setConfig({ ...getConfig(), ignoreRequests });

    Cypress.Commands.addAll({
        getIgnoredRequests: () =>
            cy.wrap(getConfig().ignoreRequests, { log: false }),
        setIgnoredRequests,
        addIgnoredRequests: (ignoreRequests: IgnoredRequest[]) =>
            setIgnoredRequests([
                ...getConfig().ignoreRequests,
                ...ignoreRequests,
            ]),
        deleteIgnoredRequests: (ignoreRequests: IgnoredRequest[]) => {
            validateConfig({ ignoreRequests });
            const deleted = mapToRequests(ignoreRequests);
            setIgnoredRequests(
                getConfig().ignoreRequests.filter(
                    (entry) => !deleted.some((each) => isSameEntry(entry, each))
                )
            );
        },
        waitForRequests: (timeout?: number) => waitForRequests(timeout),
    });
};
