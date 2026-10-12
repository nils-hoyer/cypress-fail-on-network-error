// common in projects whose app throws errors that tests want to ignore
Cypress.on('uncaught:exception', () => false);

describe('shouldFailDespiteUncaughtExceptionHandler', () => {
    it('should fail on a 500 response although uncaught exceptions are ignored', () => {
        cy.setConfigRequests([]);
        cy.visit('/');
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
