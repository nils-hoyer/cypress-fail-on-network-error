// as regular expressions, as in 1.x, the strings in the passing tests would
// not match their requests
describe('shouldMatchUrlStrings', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on a request whose URL contains the string', () => {
        cy.setIgnoredRequests(['/xhr?status=500']);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });

    it('should pass on a request whose path a glob matches', () => {
        cy.setIgnoredRequests(['/xhr?status=50?']);
        cy.fetch('/xhr?status=503');
        cy.waitForRequests();
    });

    it('should pass on a request whose full URL a glob matches', () => {
        cy.setIgnoredRequests(['http://localhost:*/x*']);
        cy.xhr('/xhr?status=500');
        cy.waitForRequests();
    });

    it('should fail on a request that the string matches only as a regular expression', () => {
        cy.setIgnoredRequests(['x.r\\?status=500$']);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });

    it('should pass on a request that a RegExp matches', () => {
        cy.setIgnoredRequests([{ url: /x.r\?status=500$/ }]);
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
