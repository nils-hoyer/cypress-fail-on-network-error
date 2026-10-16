import { RequestMatcher } from '../../dist/index';

describe('shouldNormalizeAndValidateConfig', () => {
    beforeEach(() => {
        cy.visit('/');
    });

    it('should pass when a lower-case method matches the request', () => {
        cy.setConfigRequests([
            { url: /xhr/, method: 'get' } as unknown as RequestMatcher,
        ]);
        cy.xhr('/xhr?status=500');
        cy.waitForRequests();
    });

    // browsers upper-case only the standard methods, so fetch sends "patch"
    it('should pass when a method the browser sends in lower case matches', () => {
        cy.setConfigRequests([{ url: /xhr/, method: 'PATCH' }]);
        cy.fetch('/xhr?status=500', { method: 'patch' });
        cy.waitForRequests();
    });

    it('should fail when an entry has an unknown key', () => {
        cy.setConfigRequests([{ stauts: 500 } as unknown as RequestMatcher]);
    });
});
