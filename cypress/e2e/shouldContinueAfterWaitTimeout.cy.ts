describe('shouldContinueAfterWaitTimeout', () => {
    it('should pass when a request is still pending at the timeout', () => {
        cy.setConfigRequests(['/xhr']);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=3000'
        );
        // the plugin learns about the request asynchronously, after cy.visit
        cy.wait(500);
        cy.waitForRequests(1200);
    });
});
