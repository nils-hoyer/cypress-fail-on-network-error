describe('shouldRunAllTestsAlthoughAssertionError2', () => {
    it('when request exluded then pass on network request 428', () => {
        cy.setConfigRequests(['xhr']);
        cy.visit(
            'http://localhost:3000/test?method=get&status=428&requests=1&delay=0'
        );
        cy.wait(1000);
    });
});
