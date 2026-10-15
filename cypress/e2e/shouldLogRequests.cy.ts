// the plugin logs to the command log at the end of the command after a
// request was checked
describe('shouldLogRequests', () => {
    let logs: { name: string; message: string }[];

    beforeEach(() => {
        logs = [];
        cy.on('log:added', ({ name, message }) => logs.push({ name, message }));
        cy.setConfigRequests([{ status: { from: 200, to: 399 } }]);
        cy.visit('/');
    });

    it('should pass and log each ignored request with the entry that ignored it when debug is on', () => {
        cy.setDebug(true);
        cy.fetch('/xhr?status=200');
        cy.waitForRequests();
        cy.then(() => {
            const ignored = logs.filter(({ name }) => name === 'ignored');
            expect(ignored).to.have.length(1);
            expect(ignored[0].message).to.match(
                /^\*\*{ status: { from: 200, to: 399 } }\*\* matched GET http:\/\/localhost:\d+\/xhr\?status=200 → 200$/
            );
        });
    });

    it('should pass without logging ignored requests when debug is off', () => {
        cy.fetch('/xhr?status=200');
        cy.waitForRequests();
        cy.then(() => {
            expect(logs.filter(({ name }) => name === 'ignored')).to.be.empty;
        });
    });

    it('should fail and log the failing request', () => {
        cy.on('fail', (error) => {
            const failed = logs.filter(({ name }) => name === 'unexpected');
            expect(failed).to.have.length(1);
            expect(failed[0].message).to.match(/\/xhr\?status=500 → 500$/);
            throw error;
        });
        cy.fetch('/xhr?status=500');
        cy.waitForRequests();
    });
});
