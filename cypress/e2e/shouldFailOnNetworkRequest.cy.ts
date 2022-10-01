describe('shouldFailOnNetworkRequest', () => {
    it('when no request exluded then fail on network request 400', () => {
        cy.setRequests([]);
        cy.visit('http://localhost:3000/testStatusCode/400', {
            failOnStatusCode: false,
        });
        cy.wrap({});
        cy.wait(1);
    });
    // it('when not matching request as string exluded then fail on network request 400', () => {
    //     cy.setRequests(['notMatching']);
    //     cy.visit('http://localhost:3000/testStatusCode/400', {
    //         failOnStatusCode: false,
    //     });
    // });
    // it('when not matching request as Request exluded then fail on network request 400', () => {
    //     cy.setRequests([{ url: 'notMatching' }]);
    //     cy.visit('http://localhost:3000/testStatusCode/400', {
    //         failOnStatusCode: false,
    //     });
    // });
    // it('when not matching request as Request exluded then fail on network request 400', () => {
    //     cy.setRequests([{ url: 'notMatching', status: 400 }]);
    //     cy.visit('http://localhost:3000/testStatusCode/400', {
    //         failOnStatusCode: false,
    //     });
    // });
    // it('when not matching request as Request exluded then fail on network request 400', () => {
    //     cy.setRequests([{ url: 'notMatching', method: 'GET', status: 400 }]);
    //     cy.visit('http://localhost:3000/testStatusCode/400', {
    //         failOnStatusCode: false,
    //     });
    // });
});
