import failOnNetworkError, {
    addIgnoredRequestsCommands,
    type Config,
} from '../../dist/index';

const config: Config = {
    ignoreRequests: [
        'excludedUrl',
        { url: /xhr/, method: 'GET', status: 428 },
        { status: 430 },
        { status: { from: 200, to: 399 } },
    ],
};

const failOnNetwork = failOnNetworkError(config);
// getIgnoredRequests, setIgnoredRequests, addIgnoredRequests,
// deleteIgnoredRequests and waitForRequests
addIgnoredRequestsCommands(failOnNetwork);

const { getConfig, setConfig } = failOnNetwork;

Cypress.Commands.addAll({
    setDebug: (debug: boolean) => {
        setConfig({ ...getConfig(), debug });
    },
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
            setDebug(debug: boolean): Chainable<void>;
            fetch(url: string, init?: RequestInit): Chainable<void>;
            xhr(url: string, method?: string): Chainable<void>;
        }
    }
}
