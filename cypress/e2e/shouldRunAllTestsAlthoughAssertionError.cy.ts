describe('shouldRunAllTestsAlthoughAssertionError', () => {
    it('should fail on request mismatch', () => {
        cy.setConfigRequests([]);
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=0'
        );
        cy.wait(1000);
    });
});
