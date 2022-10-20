describe('shouldWaitForRequests', () => {
    it('should fail on request mismatch', () => {
        cy.setConfigRequests([]);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=2000'
        );
        cy.wait(0).waitForRequests();
    });

    it('should pass on request match', () => {
        cy.setConfigRequests(['/xhr']);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=2000'
        );
        cy.wait(0).waitForRequests();
    });
});
