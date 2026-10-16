import failOnNetworkError from '../../dist/index';

// replaces the support file's call, whose config sets ignoreRequests
const { waitForRequests } = failOnNetworkError();

describe('shouldFailOnlyOnErrorsByDefault', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on 2xx and 3xx responses', () => {
        cy.fetch('/xhr?status=200');
        cy.xhr('/xhr?status=204');
        cy.fetch('/xhr?status=304');
        waitForRequests();
    });

    it('should fail on a 4xx response', () => {
        cy.fetch('/xhr?status=404');
        waitForRequests();
    });

    it('should fail on a 5xx response', () => {
        cy.xhr('/xhr?status=500');
        waitForRequests();
    });

    it('should fail on a request without a response', () => {
        cy.fetch('/xhr?status=none');
        waitForRequests();
    });
});
