describe('shouldWaitForNewRequests', () => {
    it('should fail when the page makes a failing request just before waitForRequests', () => {
        cy.setConfigRequests([]);
        cy.visit(
            'http://localhost:3000/test?method=get&status=500&requests=1&delay=1000'
        );
        cy.waitForRequests();
    });
});
