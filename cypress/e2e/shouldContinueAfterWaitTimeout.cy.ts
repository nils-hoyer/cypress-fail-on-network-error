describe('shouldContinueAfterWaitTimeout', () => {
    it('should pass and log the request that is still pending at the timeout', () => {
        const pending: string[] = [];
        cy.on('log:added', (attributes) => {
            if (attributes.name === 'pending') pending.push(attributes.message);
        });
        cy.setIgnoredRequests(['/xhr']);
        cy.visit('/');
        cy.xhr('/xhr?status=200&delay=3000');
        cy.waitForRequests(1200).then(() => {
            expect(pending).to.have.length(1);
            expect(pending[0])
                .to.contain('/xhr?status=200')
                .and.contain('had no response after 1200 ms');
        });
    });
});
