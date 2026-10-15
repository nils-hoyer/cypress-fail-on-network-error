// the URL does not contain the globs as text, so only Cypress.minimatch can
// match them
describe('shouldMatchGlobs', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on a response whose URL the glob matches', () => {
        cy.setConfigRequests([{ glob: '**/xhr?status=5*' }]);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });

    it('should fail on a response whose URL the glob does not match', () => {
        cy.setConfigRequests([{ glob: '**/xhr?status=4*' }]);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
