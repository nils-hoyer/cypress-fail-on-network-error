describe('shouldfailOnNetworkError', () => {
    it('should fail on request mismatch', () => {
        cy.setConfigRequests([]);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=0'
        );
        cy.wait(1000);
    });

    it('should pass on request match', () => {
        cy.setConfigRequests(['/xhr']);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=1'
        );
        cy.wait(1000);
    });

    it('should fail on request mismatch', () => {
        cy.setConfigRequests([]);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=2'
        );
        cy.wait(1000);
    });
});
