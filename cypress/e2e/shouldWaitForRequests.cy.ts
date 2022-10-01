describe('shouldWaitForRequests', () => {
    beforeEach(() => {
        cy.setConfigRequests(['/xhr']);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=2001'
        );
        cy.wait(0).waitForRequests();
    });

    it('should fail on request mismatch', () => {
        cy.setConfigRequests(['/xhr']);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=2002'
        );
        cy.wait(0).waitForRequests();

        cy.setConfigRequests([]);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=2003'
        );
        cy.wait(0).waitForRequests();
    });

    it('should pass on request match', () => {
        cy.setConfigRequests(['/xhr']);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=2004'
        );
        cy.wait(0).waitForRequests();
    });
});
