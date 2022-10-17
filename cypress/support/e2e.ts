import failOnNetworkRequest, { Config, Request } from '../../dist/index';
import './commands';

const config: Config = {
    // mode: 'error',
    excludeRequests: [
        'excludedUrl',
        { url: /xhr/, method: 'GET', status: 428 },
        { status: 430 },
        { status: { from: 200, to: 399 } },
    ],
    // waitRequests: 'none',
    // waitRequestsTimeout: 30000,
};

const { getConfig, setConfig } = failOnNetworkRequest(config);

Cypress.Commands.addAll({
    getConfigRequests: () => {
        return cy.wrap(getConfig().excludeRequests);
    },
    setConfigRequests: (requests: (string | Request)[]) => {
        setConfig({ ...getConfig(), excludeRequests: requests });
    },
});

declare global {
    namespace Cypress {
        interface Chainable {
            getConfigRequests(): Chainable<any>;
            setConfigRequests(requests: (string | Request)[]): Chainable<void>;
        }
    }
}
