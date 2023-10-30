import { expect } from 'chai';
import * as process from 'child_process';
import * as util from 'util';

const exec = util.promisify(process.exec);
const cypressRun =
    'cypress run --browser chrome --headless --config-file ./cypress/cypress.config.ts';

describe('Cypress', () => {
    it('WHEN request error is called THEN cypress fails', async () => {
        const spec = ' --spec ./cypress/e2e/shouldfailOnNetworkError.cy.ts';
        let testResult = '';

        try {
            await exec(cypressRun + spec);
        } catch (error: any) {
            testResult = error.stdout;
        } finally {
            // console.log(testResult);
            expect(testResult).to.match(/Passing:.*1/);
            expect(testResult).to.match(/Failing:.*2/);
            expect(testResult).to.match(/cypress-fail-on-network-request/);
        }
    });

    it('WHEN request error is called but excluded THEN cypress pass', async () => {
        const spec = ' --spec ./cypress/e2e/shouldPassOnNetworkRequest.cy.ts';

        const { stdout } = await exec(cypressRun + spec);
        const testResult = stdout;

        // console.log(testResult);
        expect(testResult).to.match(/Passing:.*2/);
        expect(testResult).to.match(/Failing:.*0/);
        expect(testResult).to.not.match(/cypress-fail-on-network-request/);
    });

    it('WHEN run multiple tests files THEN cypress run all files', async () => {
        const spec =
            ' --spec "cypress/e2e/shouldRunAllTestsAlthoughAssertionError.cy.ts,cypress/e2e/shouldRunAllTestsAlthoughAssertionError2.cy.ts"';
        let testResult = '';

        try {
            await exec(cypressRun + spec);
        } catch (error: any) {
            testResult = error.stdout;
        } finally {
            // console.log(testResult);
            const expectedTestResult = /1 of 2 failed.*2.*1.*1/;
            expect(testResult).to.match(expectedTestResult);
        }
    });
});
