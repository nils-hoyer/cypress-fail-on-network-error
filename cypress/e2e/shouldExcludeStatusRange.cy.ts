describe('shouldExcludeStatusRange', () => {
    beforeEach(() => {
        cy.setConfigRequests([{ status: { from: 200, to: 399 } }]);
        cy.visit('/');
    });

    it('should pass on a status inside the range', () => {
        cy.fetch('/xhr?status=200');
        cy.waitForRequests();
    });

    it('should fail on a status outside the range', () => {
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
