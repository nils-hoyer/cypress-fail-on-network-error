describe('shouldFailOnNetworkRequest', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should fail on an XHR that matches no entry', () => {
        cy.setConfigRequests([]);
        cy.xhr('/xhr?status=200');
        cy.waitForRequests();
    });

    it('should pass on an excluded XHR after a failed test', () => {
        cy.setConfigRequests(['/xhr']);
        cy.xhr('/xhr?status=200');
        cy.waitForRequests();
    });

    it('should fail on a fetch that matches no entry after a passed test', () => {
        cy.setConfigRequests([]);
        cy.fetch('/xhr?status=200');
        cy.waitForRequests();
    });
});
