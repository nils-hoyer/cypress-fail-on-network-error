describe('shouldFailOnRequestError', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should fail on an XHR without a response', () => {
        cy.setIgnoredRequests([]);
        cy.xhr('/xhr?status=none');
        cy.waitForRequests();
    });

    it('should fail on a fetch without a response', () => {
        cy.setIgnoredRequests([]);
        cy.fetch('/xhr?status=none');
        cy.waitForRequests();
    });

    // Electron and Firefox report it without a message, with the code ECONNREFUSED
    it('should fail on a fetch to a port that refuses the connection', () => {
        cy.setIgnoredRequests([]);
        cy.request('/closed-port')
            .its('body.port')
            .then((port) => {
                cy.fetch(`http://localhost:${port}/refused`);
            });
        cy.waitForRequests();
    });

    // Cypress's proxy retries a request without a response, in Electron and Firefox
    it('should fail once on a request that cy.intercept() forces to fail', () => {
        cy.setIgnoredRequests([]);
        cy.intercept('/xhr*', { forceNetworkError: true });
        cy.fetch('/xhr?status=200');
        cy.waitForRequests();
    });

    it('should pass on an excluded request without a response', () => {
        cy.setIgnoredRequests(['/xhr']);
        cy.fetch('/xhr?status=none');
        cy.waitForRequests();
    });
});
