describe('shouldFailOnNetworkRequest', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should fail on an XHR that matches no entry', () => {
        cy.setIgnoredRequests([]);
        cy.xhr('/xhr?status=200');
        cy.waitForRequests();
    });

    it('should pass on an excluded XHR after a failed test', () => {
        cy.setIgnoredRequests(['/xhr']);
        cy.xhr('/xhr?status=200');
        cy.waitForRequests();
    });

    it('should fail on a fetch that matches no entry after a passed test', () => {
        cy.setIgnoredRequests([]);
        cy.fetch('/xhr?status=200');
        cy.waitForRequests();
    });
});
