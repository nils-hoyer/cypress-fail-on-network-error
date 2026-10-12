describe('shouldCheckOnlyXhrAndFetch', () => {
    it('should fail on the XHR but not report the script, stylesheet and image', () => {
        cy.setConfigRequests([]);
        cy.visit('/resources');
        cy.waitForRequests();
    });
});
