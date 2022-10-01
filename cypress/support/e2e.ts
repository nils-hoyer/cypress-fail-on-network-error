import { Request } from 'dist/types/Request';
import failOnConsoleError, { Config } from '../../dist/index';
import './commands';

const config: Config = {
    requests: [
        'excludedUrl',
        { url: 'excludedUrl2', method: 'POST', status: 400 } as Request,
    ],
    timeout: 15000,
};

const { getConfig, setConfig } = failOnConsoleError(config);

Cypress.Commands.addAll({
    getRequests: () => {
        return cy.wrap(getConfig().requests);
    },
    setRequests: (requests: (string | Request)[]) => {
        setConfig({ ...getConfig(), requests });
    },
});

declare global {
    namespace Cypress {
        interface Chainable {
            getRequests(): Chainable<any>;
            setRequests(requests: (string | Request)[]): Chainable<void>;
        }
    }
}
