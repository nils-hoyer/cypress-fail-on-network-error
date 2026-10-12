describe('shouldFailOnRequestError', () => {
    it('should fail on a request error', () => {
        cy.setConfigRequests([]);
        cy.visit(
            'http://localhost:3000/test?method=get&status=none&requests=1&delay=0'
        );
        cy.wait(1000);
    });

    it('should pass on an excluded request error', () => {
        cy.setConfigRequests(['/xhr']);
        cy.visit(
            'http://localhost:3000/test?method=get&status=none&requests=1&delay=0'
        );
        cy.wait(1000);
    });
});
