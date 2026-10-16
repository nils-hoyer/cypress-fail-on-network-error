import failOnNetworkError, {
    Config,
    NormalizedRequest,
    RequestMatcher,
    RequestPredicate,
} from '../../dist/index';

const config: Config = {
    ignoreRequests: [
        'excludedUrl',
        { url: /xhr/, method: 'GET', status: 428 },
        { status: 430 },
        { status: { from: 200, to: 399 } },
    ],
};

const { getConfig, setConfig, waitForRequests } = failOnNetworkError(config);

Cypress.Commands.addAll({
    getConfigRequests: () => {
        return cy.wrap(getConfig().ignoreRequests);
    },
    setConfigRequests: (
        requests: (string | RequestMatcher | RequestPredicate)[]
    ) => {
        setConfig({ ...getConfig(), ignoreRequests: requests });
    },
    setDebug: (debug: boolean) => {
        setConfig({ ...getConfig(), debug });
    },
    waitForRequests: (timeout?: number) => waitForRequests(timeout),
    // make a request from the page without waiting for the response
    fetch: (url: string, init?: RequestInit) => {
        cy.window({ log: false }).then((win) => {
            // a request without a response rejects, which is not this test's error
            win.fetch(url, init).catch(() => {});
        });
    },
    xhr: (url: string, method = 'GET') => {
        cy.window({ log: false }).then((win) => {
            const request = new win.XMLHttpRequest();
            request.open(method, url);
            request.send();
        });
    },
});

declare global {
    namespace Cypress {
        interface Chainable {
            getConfigRequests(): Chainable<NormalizedRequest[]>;
            setConfigRequests(
                requests: (string | RequestMatcher | RequestPredicate)[]
            ): Chainable<void>;
            setDebug(debug: boolean): Chainable<void>;
            waitForRequests(timeout?: number): Chainable<void>;
            fetch(url: string, init?: RequestInit): Chainable<void>;
            xhr(url: string, method?: string): Chainable<void>;
        }
    }
}
