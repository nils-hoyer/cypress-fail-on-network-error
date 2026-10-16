describe('shouldNotLeakConfigChanges', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on a request excluded through getIgnoredRequests', () => {
        cy.getIgnoredRequests().then((requests) =>
            requests.push({ url: '/xhr' })
        );
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });

    it('should fail on the same request in the next test', () => {
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
