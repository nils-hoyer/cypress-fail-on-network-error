describe('shouldContinueAfterWaitTimeout', () => {
    it('should pass when a request is still pending at the timeout', () => {
        cy.setIgnoredRequests(['/xhr']);
        cy.visit('/');
        cy.xhr('/xhr?status=200&delay=3000');
        cy.waitForRequests(1200);
    });
});
