import { expect } from 'chai';
import * as process from 'child_process';
import type { Server } from 'http';
import * as util from 'util';
import { start } from '../backend/app.cjs';

const exec = util.promisify(process.exec);
// Cypress colors its output in CI, which puts escape codes between "Passing:" and the count
const stripColors = (output: string) => output.replace(/\u001b\[[0-9;]*m/g, '');
const cypressRun =
    'cypress run --browser chrome --headless --config-file ./cypress/cypress.config.ts';

describe('Cypress', () => {
    let server: Server;

    before(async () => {
        server = await start();
    });

    after((done) => {
        server.close(done);
    });

    it('WHEN request error is called THEN cypress fails', async () => {
        const spec = ' --spec ./cypress/e2e/shouldFailOnNetworkRequest.cy.ts';
        let testResult = '';

        try {
            await exec(cypressRun + spec);
        } catch (error: any) {
            testResult = error.stdout;
        } finally {
            // console.log(testResult);
            expect(testResult).to.match(/Passing:.*1/);
            expect(testResult).to.match(/Failing:.*2/);
            expect(testResult).to.match(/cypress-fail-on-network-error/);
        }
    });

    it('WHEN request error is called but excluded THEN cypress pass', async () => {
        const spec = ' --spec ./cypress/e2e/shouldPassOnNetworkRequest.cy.ts';

        const { stdout } = await exec(cypressRun + spec);
        const testResult = stdout;

        // console.log(testResult);
        expect(testResult).to.match(/Passing:.*2/);
        expect(testResult).to.match(/Failing:.*0/);
        expect(testResult).to.not.match(/cypress-fail-on-network-error/);
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

    it('WHEN status range is excluded THEN cypress passes inside and fails outside the range', async () => {
        const spec = ' --spec ./cypress/e2e/shouldExcludeStatusRange.cy.ts';
        let testResult = '';

        try {
            await exec(cypressRun + spec);
        } catch (error: any) {
            testResult = stripColors(error.stdout);
        } finally {
            expect(testResult).to.match(/Passing:\s+1\s/);
            expect(testResult).to.match(/Failing:\s+1\s/);
            expect(testResult).to.match(/cypress-fail-on-network-error/);
        }
    });

    it('WHEN request fails without a response THEN cypress fails with the error unless excluded', async () => {
        const spec = ' --spec ./cypress/e2e/shouldFailOnRequestError.cy.ts';
        let testResult = '';

        try {
            await exec(cypressRun + spec);
        } catch (error: any) {
            testResult = stripColors(error.stdout);
        } finally {
            expect(testResult).to.match(/Passing:\s+1\s/);
            expect(testResult).to.match(/Failing:\s+1\s/);
            expect(testResult).to.match(
                /cypress-fail-on-network-error:\s*\[.*"error":"/
            );
        }
    });

    it('WHEN waitForRequests times out with a request still pending THEN cypress continues and passes', async () => {
        const spec =
            ' --spec ./cypress/e2e/shouldContinueAfterWaitTimeout.cy.ts';

        const { stdout } = await exec(cypressRun + spec);
        const testResult = stripColors(stdout);

        expect(testResult).to.match(/Passing:\s+1\s/);
        expect(testResult).to.match(/Failing:\s+0\s/);
        expect(testResult).to.not.match(/cypress-fail-on-network-error/);
    });

    it('WHEN waitForRequests follows cy.visit directly THEN cypress waits for the requests the page made', async () => {
        const spec = ' --spec ./cypress/e2e/shouldWaitForNewRequests.cy.ts';
        let testResult = '';

        try {
            await exec(cypressRun + spec);
        } catch (error: any) {
            testResult = stripColors(error.stdout);
        } finally {
            expect(testResult).to.match(/Passing:\s+0\s/);
            expect(testResult).to.match(/Failing:\s+1\s/);
            expect(testResult).to.match(/cypress-fail-on-network-error/);
        }
    });

    it('WHEN config sets a lower-case method or an unknown key THEN cypress matches the method and rejects the key', async () => {
        const spec =
            ' --spec ./cypress/e2e/shouldNormalizeAndValidateConfig.cy.ts';
        let testResult = '';

        try {
            await exec(cypressRun + spec);
        } catch (error: any) {
            testResult = stripColors(error.stdout);
        } finally {
            expect(testResult).to.match(/Passing:\s+1\s/);
            expect(testResult).to.match(/Failing:\s+1\s/);
            expect(testResult).to.match(
                /cypress-fail-on-network-error: config\.requests\[0\] has unknown keys/
            );
        }
    });

    it('WHEN getConfig().requests is changed in a test THEN cypress uses the original config in the next test', async () => {
        const spec = ' --spec ./cypress/e2e/shouldNotLeakConfigChanges.cy.ts';
        let testResult = '';

        try {
            await exec(cypressRun + spec);
        } catch (error: any) {
            testResult = stripColors(error.stdout);
        } finally {
            expect(testResult).to.match(/Passing:\s+1\s/);
            expect(testResult).to.match(/Failing:\s+1\s/);
            expect(testResult).to.match(/cypress-fail-on-network-error/);
        }
    });

    it('WHEN page loads a script, stylesheet and image THEN cypress reports only the XHR', async () => {
        const spec = ' --spec ./cypress/e2e/shouldCheckOnlyXhrAndFetch.cy.ts';
        let testResult = '';

        try {
            await exec(cypressRun + spec);
        } catch (error: any) {
            testResult = stripColors(error.stdout);
        } finally {
            expect(testResult).to.match(/Failing:\s+1\s/);
            expect(testResult).to.match(
                /cypress-fail-on-network-error:\s*\[.*\/xhr\//
            );
            expect(testResult).to.not.match(/resource\.(css|js|svg)/);
        }
    });
});
