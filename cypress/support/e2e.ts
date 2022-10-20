import failOnNetworkRequest, { Config, Request } from '../../dist/index';
import './commands';

const config: Config = {
    excludeRequests: [
        'excludedUrl',
        { url: /xhr/, method: 'GET', status: 428 },
        { status: 430 },
        { status: { from: 200, to: 399 } },
    ],
};

const { getConfig, setConfig, waitForRequests } = failOnNetworkRequest(config);

Cypress.Commands.addAll({
    getConfigRequests: () => {
        return cy.wrap(getConfig().excludeRequests);
    },
    setConfigRequests: (requests: (string | Request)[]) => {
        setConfig({ ...getConfig(), excludeRequests: requests });
    },
    waitForRequests: () => {
        return waitForRequests();
    },
});

declare global {
    namespace Cypress {
        interface Chainable {
            getConfigRequests(): Chainable<any>;
            setConfigRequests(requests: (string | Request)[]): Chainable<void>;
            waitForRequests(): Chainable<void>;
        }
    }
}
