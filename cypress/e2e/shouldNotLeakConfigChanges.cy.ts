describe('shouldNotLeakConfigChanges', () => {
    it('should pass on a request excluded through getConfigRequests', () => {
        cy.getConfigRequests().then((requests) => requests.push('/xhr'));
        cy.visit(
            'http://localhost:3000/test?method=get&status=500&requests=1&delay=0'
        );
        cy.wait(1000);
    });

    it('should fail on the same request in the next test', () => {
        cy.visit(
            'http://localhost:3000/test?method=get&status=500&requests=1&delay=0'
        );
        cy.wait(1000);
    });
});
