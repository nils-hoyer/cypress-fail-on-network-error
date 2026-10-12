import failOnNetworkError, {
    Config,
    NormalizedRequest,
    Request,
} from '../../dist/index';
import './commands';

const config: Config = {
    requests: [
        'excludedUrl',
        { url: /xhr/, method: 'GET', status: 428 },
        { status: 430 },
        { status: { from: 200, to: 399 } },
    ],
};

const { getConfig, setConfig, waitForRequests } = failOnNetworkError(config);

Cypress.Commands.addAll({
    getConfigRequests: () => {
        return cy.wrap(getConfig().requests);
    },
    setConfigRequests: (requests: (string | Request)[]) => {
        setConfig({ ...getConfig(), requests });
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
            setConfigRequests(requests: (string | Request)[]): Chainable<void>;
            waitForRequests(timeout?: number): Chainable<void>;
            fetch(url: string, init?: RequestInit): Chainable<void>;
            xhr(url: string, method?: string): Chainable<void>;
        }
    }
}
