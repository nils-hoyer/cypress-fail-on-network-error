describe('shouldResetConfigBetweenTests', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    // the config is reset after the afterEach hook has run
    afterEach(() => {
        cy.wrap({ some: 'command' });
    });

    it('should pass on a request excluded through setConfigRequests', () => {
        cy.setConfigRequests(['/xhr']);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });

    it('should fail on the same request in the next test', () => {
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
