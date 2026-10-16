// Chrome reports a cancelled request as a request error, Electron and Firefox
// send no event for it
describe('shouldIgnoreCancelledRequests', () => {
    beforeEach(() => {
        cy.setIgnoredRequests([]);
        cy.visit('/');
    });

    it('should pass on a fetch that the page aborts', () => {
        cy.window().then((win) => {
            const controller = new win.AbortController();
            win.fetch('/xhr?status=200&delay=2000', {
                signal: controller.signal,
            }).catch(() => {});
            setTimeout(() => controller.abort(), 300);
        });
        // Electron and Firefox wait until the timeout for the aborted request
        cy.waitForRequests(1500);
    });

    it('should pass on an XHR that the page aborts', () => {
        cy.window().then((win) => {
            const request = new win.XMLHttpRequest();
            request.open('GET', '/xhr?status=200&delay=2000');
            request.send();
            setTimeout(() => request.abort(), 300);
        });
        cy.waitForRequests(1500);
    });

    it('should pass when a visit cancels a pending fetch, without waiting for it', () => {
        cy.fetch('/xhr?status=200&delay=2000');
        // let the request reach the server before the page unloads
        cy.wait(300);
        cy.visit('/');
        cy.then(() => Date.now()).then((start) => {
            cy.waitForRequests(5000).then(() => {
                expect(Date.now() - start).to.be.lessThan(1500);
            });
        });
    });

    it('should fail on a response after a visit', () => {
        cy.fetch('/xhr?status=500&delay=300');
        cy.visit('/');
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
