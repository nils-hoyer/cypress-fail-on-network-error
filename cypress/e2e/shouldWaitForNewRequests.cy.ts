describe('shouldWaitForNewRequests', () => {
    it('should fail when a slow failing request starts just before waitForRequests', () => {
        cy.setIgnoredRequests([]);
        cy.visit('/');
        cy.fetch('/xhr?status=500&delay=1000');
        cy.waitForRequests();
    });
});
