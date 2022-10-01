import failOnNetworkRequest, { Config, Request } from '../../dist/index';
import './commands';

const config: Config = {
    requests: [
        'excludedUrl',
        { url: /xhr/, method: 'GET', status: 428 },
        { status: 430 },
        { status: { from: 200, to: 399 } },
    ],
};

const { getConfig, setConfig, waitForRequests } = failOnNetworkRequest(config);

Cypress.Commands.addAll({
    getConfigRequests: () => {
        return cy.wrap(getConfig().requests);
    },
    setConfigRequests: (requests: (string | Request)[]) => {
        setConfig({ ...getConfig(), requests });
    },
    waitForRequests: () => waitForRequests(),
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
