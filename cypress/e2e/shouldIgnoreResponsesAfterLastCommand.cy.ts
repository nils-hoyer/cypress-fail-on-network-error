// a response that arrives after the test's last command is not checked: no
// command:end follows to fail the test, and test:after:run drops the request
describe('shouldIgnoreResponsesAfterLastCommand', () => {
    beforeEach(() => {
        cy.setConfigRequests([{ status: { from: 200, to: 399 } }]);
        cy.visit('/');
    });

    it('should pass when a failing response arrives after the last command', () => {
        cy.fetch('/xhr?status=500&delay=500');
    });

    it('should pass when the late response of the previous test arrives during this test', () => {
        // outlasts the previous test's response, which arrives during this
        // test unless the browser cancelled it when the page was reset
        cy.fetch('/xhr?status=200&delay=1000');
        cy.waitForRequests();
    });
});
