// without waitForRequests the tests end before the responses arrive
describe('shouldWaitForRequests', () => {
    beforeEach(() => {
        cy.setIgnoredRequests(['/xhr']);
        cy.visit('/');
        cy.fetch('/xhr?status=500&delay=600');
        cy.waitForRequests();
    });

    it('should pass on a slow excluded response', () => {
        cy.fetch('/xhr?status=500&delay=600');
        cy.waitForRequests();
    });

    it('should fail on a slow response after the config changes', () => {
        cy.setIgnoredRequests([]);
        cy.fetch('/xhr?status=500&delay=600');
        cy.waitForRequests();
    });
});
