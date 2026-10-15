describe('shouldMatchMethods', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on HEAD and OPTIONS requests that a list of methods excludes', () => {
        cy.setIgnoredRequests([{ method: ['HEAD', 'OPTIONS'], status: 500 }]);
        cy.xhr('/xhr?status=500', 'HEAD');
        cy.fetch('/xhr?status=500', { method: 'OPTIONS' });
        cy.waitForRequests();
    });

    it('should pass on a custom method, which the browser keeps in lower case', () => {
        // Node's HTTP parser answers a method in lower case with a 400
        cy.setIgnoredRequests([{ method: 'PURGE' }]);
        cy.fetch('/xhr?status=500', { method: 'purge' });
        cy.waitForRequests();
    });

    it('should fail on a method that the list does not contain', () => {
        cy.setIgnoredRequests([{ method: ['GET', 'PUT'], status: 500 }]);
        cy.xhr('/xhr?status=500', 'POST');
        cy.waitForRequests();
    });
});
