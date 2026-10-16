describe('shouldMatchPredicates', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on a response that a predicate excludes', () => {
        cy.setIgnoredRequests([
            (request) =>
                request.url.indexOf('/xhr') !== -1 && request.status === 503,
        ]);
        cy.fetch('/xhr?status=503');
        cy.waitForRequests();
    });

    it('should pass when a predicate and the other fields of its entry match', () => {
        cy.setIgnoredRequests([
            {
                method: 'POST',
                predicate: (request) => (request.status ?? 0) >= 500,
            },
        ]);
        cy.xhr('/xhr?status=502', 'POST');
        cy.waitForRequests();
    });

    it('should fail on a response that the predicate does not exclude', () => {
        cy.setIgnoredRequests([(request) => request.status === 503]);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });

    it('should fail with an Error when a predicate throws', () => {
        cy.setIgnoredRequests([
            () => {
                throw new Error('predicate broke');
            },
        ]);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
