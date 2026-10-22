// the support file's config excludes statuses from 200 to 399
describe('shouldChangeIgnoredRequests', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on a response that an added entry excludes', () => {
        cy.addIgnoredRequests([{ status: 503 }]);
        cy.fetch('/xhr?status=503');
        cy.fetch('/xhr?status=200');
        cy.waitForRequests();
    });

    it('should pass on a response that an added RegExp entry excludes', () => {
        cy.addIgnoredRequests([/status=503/]);
        cy.fetch('/xhr?status=503');
        cy.waitForRequests();
    });

    it('should fail on a response whose entry was deleted', () => {
        cy.deleteIgnoredRequests([{ status: { from: 200, to: 399 } }]);
        cy.fetch('/xhr?status=200');
        cy.waitForRequests();
    });

    it('should pass when the entry deleted in the previous test is back', () => {
        cy.getIgnoredRequests().should('deep.include', {
            url: undefined,
            method: undefined,
            status: { from: 200, to: 399 },
            predicate: undefined,
        });
        cy.fetch('/xhr?status=200');
        cy.waitForRequests();
    });
});
