// a page that fetches on load, in a test that ends right after cy.visit():
// the request can reach the plugin after test:after:run, even during the next
// test, and the browser gives up on it when test isolation resets the page
describe('shouldIgnoreRequestsFromEarlierTests', () => {
    [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].forEach((delay) => {
        it(`should pass when the page's request outlasts the test (delay ${delay} ms)`, () => {
            // the response may still arrive during this test
            cy.addIgnoredRequests([{ status: 500 }]);
            cy.visit(`/fetch-on-load?status=500&delay=${delay}`);
        });

        it(`should pass when the request of the previous test arrives during this test (delay ${delay} ms)`, () => {
            cy.visit('/');
            cy.waitForRequests();
        });
    });
});
