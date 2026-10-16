describe('shouldPassHeadersToPredicates', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on a response whose request header a predicate checks', () => {
        cy.setIgnoredRequests([
            ({ requestHeaders }) =>
                requestHeaders?.['x-expected-error'] === 'true',
        ]);
        cy.fetch('/xhr?status=500', {
            headers: { 'X-Expected-Error': 'true' },
        });
        cy.waitForRequests();
    });

    it('should pass on a response whose response header a predicate checks', () => {
        // the test server sends JSON
        cy.setIgnoredRequests([
            ({ responseHeaders }) =>
                String(responseHeaders?.['content-type']).indexOf(
                    'application/json'
                ) === 0,
        ]);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });

    it('should fail when the request header that the predicate checks is missing', () => {
        cy.setIgnoredRequests([
            ({ requestHeaders }) =>
                requestHeaders?.['x-expected-error'] === 'true',
        ]);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
