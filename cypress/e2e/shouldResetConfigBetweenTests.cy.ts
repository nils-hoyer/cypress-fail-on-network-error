describe('shouldResetBetweenTests', () => {
    beforeEach(() => {
        cy.wrap({ some: 'command' });
    });

    afterEach(() => {
        cy.wrap({ some: 'command' });
    });

    it('should pass AssertionError on console.error', () => {
        // reset config, reset requests
        cy.setExcludeMessages([
            'firstErrorExcluded',
            'secondErrorNotExcluded',
        ]).then(() => {
            cy.visit('./cypress/fixtures/consoleError.html');
        });
    });

    it('should throw AssertionError on console.error', () => {
        cy.visit('./cypress/fixtures/consoleError.html');
    });
});
