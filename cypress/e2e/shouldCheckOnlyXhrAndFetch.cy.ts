describe('shouldCheckOnlyXhrAndFetch', () => {
    it('should fail on the XHR but not report the script, stylesheet and image', () => {
        cy.setConfigRequests([]);
        cy.visit('http://localhost:3000/resources');
        cy.wait(1000);
    });
});
