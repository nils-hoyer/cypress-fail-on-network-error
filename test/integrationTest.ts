import { expect } from 'chai';
import cypress from 'cypress';
import { readdirSync } from 'fs';
import { basename } from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { start } from '../backend/app.cjs';

type RunResult = CypressCommandLine.RunResult;
type TestResult = CypressCommandLine.TestResult;

// VS Code sets ELECTRON_RUN_AS_NODE in its terminals, which stops the
// Cypress binary from starting
delete process.env.ELECTRON_RUN_AS_NODE;

// Chrome by default; BROWSER=firefox or BROWSER=electron runs the specs in
// another browser. CI runs Chrome and Firefox, whose network events differ.
const browser = process.env.BROWSER ?? 'chrome';
const specs = readdirSync('cypress/e2e').filter((file) =>
    file.endsWith('.cy.ts')
);

// checks on the error beyond the plugin prefix, by describe and test title
const errorChecks: Record<string, (error: string) => void> = {
    'shouldFailOnRequestError > should fail on an XHR without a response': (
        error
    ) => expect(error).to.match(/"error":"/),
    'shouldFailOnRequestError > should fail on a fetch without a response': (
        error
    ) => expect(error).to.match(/"error":"/),
    'shouldNormalizeAndValidateConfig > should fail when an entry has an unknown key':
        (error) =>
            expect(error).to.match(
                /^Error: cypress-fail-on-network-error: config\.ignoreRequests\[0\] has unknown keys/
            ),
    'shouldMatchPredicates > should fail with an Error when a predicate throws':
        (error) =>
            expect(error).to.match(
                /^Error: cypress-fail-on-network-error: a predicate in ignoreRequests threw on GET .*\/xhr\?status=500: predicate broke/
            ),
    'shouldCheckOnlyXhrAndFetch > should fail on the XHR but not report the script, stylesheet and image':
        (error) => {
            expect(error).to.match(/\/xhr\?status=200/);
            expect(error).to.not.match(/resource\.(css|js|svg)/);
        },
};

const expectedState = (title: string) => {
    if (title.startsWith('should pass')) return 'passed';
    if (title.startsWith('should fail')) return 'failed';
    throw new Error(
        `test title must start with "should pass" or "should fail": ${title}`
    );
};

const checkTest = (test: TestResult) => {
    const fullTitle = test.title.join(' > ');
    const title = test.title[test.title.length - 1];

    expect(test.state, fullTitle).to.equal(expectedState(title));
    if (test.state === 'passed') return;

    const error = test.displayError ?? '';
    // config validation throws Error, a failing request AssertionError
    expect(error, fullTitle).to.match(
        /^(AssertionError|Error): cypress-fail-on-network-error:/
    );
    expect(error, fullTitle).to.not.match(
        /originated from your application code/
    );
    errorChecks[fullTitle]?.(error);
};

describe('Cypress', () => {
    let server: Server;
    let runs: RunResult[];

    before(async function () {
        this.timeout(180000);
        server = await start();
        const { port } = server.address() as AddressInfo;

        const result = await cypress.run({
            browser,
            config: { e2e: { baseUrl: `http://localhost:${port}` } },
        });
        if ('failures' in result) throw new Error(result.message);
        runs = result.runs;
    });

    after((done) => {
        server.close(done);
    });

    it('WHEN all specs run in one cypress run THEN expect a result for every spec', () => {
        expect(
            runs.map((run) => basename(run.spec.relative)).sort()
        ).to.deep.equal(specs.sort());
    });

    for (const spec of specs) {
        it(`WHEN ${spec} runs THEN expect each test to pass or fail as its title says`, () => {
            const run = runs.find(
                (run) => basename(run.spec.relative) === spec
            );
            expect(run, spec).to.exist;
            expect(run!.tests, spec).to.not.be.empty;
            run!.tests.forEach(checkTest);
        });
    }
});
