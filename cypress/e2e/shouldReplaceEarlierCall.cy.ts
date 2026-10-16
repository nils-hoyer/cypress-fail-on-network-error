import failOnNetworkError from '../../dist/index';

// replaces the support file's call for this spec; the support file is a
// separate bundle, with its own copy of the plugin module
const { waitForRequests } = failOnNetworkError({
    ignoreRequests: [{ status: 500 }],
});

describe('shouldReplaceEarlierCall', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass on a response that only the latest call excludes', () => {
        cy.fetch('/xhr?status=500');
        waitForRequests();
    });

    it('should fail on a response that only the earlier call excludes', () => {
        cy.fetch('/xhr?status=200');
        waitForRequests();
    });
});
