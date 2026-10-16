import failOnNetworkError, { Config, RequestMatcher } from '../../dist/index';

describe('shouldNormalizeAndValidateConfig', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass when a lower-case method matches the request', () => {
        cy.setIgnoredRequests([
            { url: /xhr/, method: 'get' } as unknown as RequestMatcher,
        ]);
        cy.xhr('/xhr?status=500');
        cy.waitForRequests();
    });

    // browsers upper-case only the standard methods, so fetch sends "patch"
    it('should pass when a method the browser sends in lower case matches', () => {
        cy.setIgnoredRequests([{ url: /xhr/, method: 'PATCH' }]);
        cy.fetch('/xhr?status=500', { method: 'patch' });
        cy.waitForRequests();
    });

    it('should fail when an entry has an unknown key', () => {
        cy.setIgnoredRequests([{ stauts: 500 } as unknown as RequestMatcher]);
    });

    // a config that fails validation leaves the support file's call active
    it('should fail when the config sets the removed requests option', () => {
        failOnNetworkError({ requests: ['xhr'] } as Config);
    });
});
