// excluded by the config in cypress/support/e2e.ts
describe('shouldPassOnNetworkRequest', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on a URL excluded by a string entry', () => {
        cy.fetch('/xhr?status=500&excludedUrl');
        cy.waitForRequests();
    });

    it('should pass on a request excluded by URL, method and status', () => {
        cy.xhr('/xhr?status=428');
        cy.waitForRequests();
    });

    it('should pass on a status excluded by a status entry', () => {
        cy.fetch('/xhr?status=430', { method: 'POST' });
        cy.waitForRequests();
    });

    it('should pass on a status excluded by a status range', () => {
        cy.fetch('/xhr?status=201');
        cy.waitForRequests();
    });
});
