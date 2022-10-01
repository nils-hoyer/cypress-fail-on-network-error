describe('shouldPassOnNetworkRequest', () => {
    it('when request exluded then pass on network request 400', () => {
        cy.setRequests(['statusCode']);
        cy.visit('http://localhost:3000/testStatusCode/400', {
            failOnStatusCode: false,
        });
        cy.wait(1000);
    });
    it('when not matching request as string exluded then fail on network request 400', () => {
        cy.setRequests(['/statusCode/400']);
        cy.visit('http://localhost:3000/testStatusCode/400', {
            failOnStatusCode: false,
        });
        cy.wait(1000);
    });
    it('when not matching request as Request exluded then fail on network request 400', () => {
        cy.setRequests([{ url: 'statusCode' }]);
        cy.visit('http://localhost:3000/testStatusCode/400', {
            failOnStatusCode: false,
        });
        cy.wait(1000);
    });
    it.skip('when not matching request as Request exluded then fail on network request 400', () => {
        cy.setRequests([{ status: 400 }]);
        cy.visit('http://localhost:3000/testStatusCode/400', {
            failOnStatusCode: false,
        });
        cy.wait(1000);
    });
    it('when not matching request as Request exluded then fail on network request 400', () => {
        cy.setRequests([{ method: 'GET' }]);
        cy.visit('http://localhost:3000/testStatusCode/400', {
            failOnStatusCode: false,
        });
        cy.wait(1000);
    });
    it('when not matching request as Request exluded then fail on network request 400', () => {
        cy.setRequests([{ url: 'statusCode', status: 400, method: 'GET' }]);
        cy.visit('http://localhost:3000/testStatusCode/400', {
            failOnStatusCode: false,
        });
        cy.wait(1000);
    });
});
