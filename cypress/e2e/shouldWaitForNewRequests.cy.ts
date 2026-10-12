describe('shouldWaitForNewRequests', () => {
    it('should fail when a slow failing request starts just before waitForRequests', () => {
        cy.setConfigRequests([]);
        cy.visit('/');
        cy.fetch('/xhr?status=500&delay=1000');
        cy.waitForRequests();
    });
});
