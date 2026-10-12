// common in projects whose app throws errors that tests want to ignore
Cypress.on('uncaught:exception', () => false);

describe('shouldFailDespiteUncaughtExceptionHandler', () => {
    it('should fail on a 500 response although uncaught exceptions are ignored', () => {
        cy.setConfigRequests([]);
        cy.visit(
            'http://localhost:3000/test?method=get&status=500&requests=1&delay=0'
        );
        cy.waitForRequests();
    });
});
