describe('shouldFailOnRequestError', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should fail on an XHR without a response', () => {
        cy.setIgnoredRequests([]);
        cy.xhr('/xhr?status=none');
        cy.waitForRequests();
    });

    it('should fail on a fetch without a response', () => {
        cy.setIgnoredRequests([]);
        cy.fetch('/xhr?status=none');
        cy.waitForRequests();
    });

    it('should pass on an excluded request without a response', () => {
        cy.setIgnoredRequests(['/xhr']);
        cy.fetch('/xhr?status=none');
        cy.waitForRequests();
    });
});
