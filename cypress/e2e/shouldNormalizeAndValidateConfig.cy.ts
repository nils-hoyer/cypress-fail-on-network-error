import { Request } from '../../dist/index';

describe('shouldNormalizeAndValidateConfig', () => {
    it('should pass when a lower-case method matches the request', () => {
        cy.setConfigRequests([
            { url: /xhr/, method: 'get' } as unknown as Request,
        ]);
        cy.visit(
            'http://localhost:3000/test?method=get&status=500&requests=1&delay=0'
        );
        cy.wait(1000);
    });

    it('should fail when an entry has an unknown key', () => {
        cy.setConfigRequests([{ stauts: 500 } as unknown as Request]);
    });
});
