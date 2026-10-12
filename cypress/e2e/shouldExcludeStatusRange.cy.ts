describe('shouldExcludeStatusRange', () => {
    beforeEach(() => {
        cy.setConfigRequests([{ status: { from: 200, to: 399 } }]);
    });

    it('should pass on a status inside the range', () => {
        cy.visit(
            'http://localhost:3000/test?method=get&status=200&requests=1&delay=0'
        );
        cy.wait(1000);
    });

    it('should fail on a status outside the range', () => {
        cy.visit(
            'http://localhost:3000/test?method=get&status=500&requests=1&delay=0'
        );
        cy.wait(1000);
    });
});
