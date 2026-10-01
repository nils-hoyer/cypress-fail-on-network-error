# Copilot instructions

## What this project is

`cypress-fail-on-network-error` is a Cypress plugin published to npm. Users call `failOnNetworkError(config)` once in their Cypress support file. The plugin listens to Cypress's internal `request:event` (the proxy-logging events behind the command log, which cover XHR and `fetch` requests). When a request gets a response or errors, the plugin throws a chai `AssertionError` unless the request matches an entry in `config.requests`. Every request that is not excluded fails the test, including `2xx` responses.

## Repository layout

- `src/index.ts`: the whole plugin. Default export `failOnNetworkError`, the types `Config`, `Request`, `Range` and `RequestSession`, and helper functions (`validateConfig`, `createConfig`, `mapToRequests`, `findRequest`, `isRequestExcluded`) that are exported so the unit tests can reach them.
- `dist/`: compiled output, ignored by git. npm publishes it (`files` in `package.json`), and the `prepack` script rebuilds it before every `npm pack` and `npm publish`. Never edit it by hand, and do not commit it.
- `test/unitTest.ts`: mocha unit tests for the helpers. They import from `../dist/index.js` and stub `global.Cypress`.
- `test/integrationTest.ts`: runs `cypress run --browser chrome --headless` on specs in `cypress/e2e/` and asserts on the stdout summary (passing/failing counts and the `cypress-fail-on-network-error` error text).
- `cypress/e2e/*.cy.ts`: fixture specs driven by the integration test. Several fail on purpose. Do not "fix" a failing spec; the integration test depends on the exact pass/fail counts. `shouldResetConfigBetweenTests.cy.ts` and `shouldWaitForRequests.cy.ts` are not run by `integrationTest.ts`.
- `cypress/support/e2e.ts`: registers the plugin from `../../dist/index` and defines the `getConfigRequests`, `setConfigRequests` and `waitForRequests` custom commands used by the specs.
- `backend/app.cjs` and `backend/index.html`: Express test server on port 3000. `integrationTest.ts` starts it with the exported `start()` before the tests and closes it after them. `node backend/app.cjs` (`npm run build:be`) runs it on its own.
    - `GET /test?method=&status=&requests=&delay=` serves a page that fires `requests` XHRs at `http://127.0.0.1:3000/xhr/?status=&delay=`. All four query parameters are required.
    - `GET /xhr?status=&delay=` responds with `status` after `delay` milliseconds.
- `types/`: legacy vendored typings that no tsconfig references. Leave them alone.
- `README.md`: user documentation. Update it whenever public API or behavior changes.

## Build and test

- Use Node.js LTS (CI uses `lts/*`). Integration tests need Chrome installed.
- `npm ci` installs dependencies.
- `npm run verify` is what CI runs, and it must pass before a PR is merged. It runs, in order:
    1. `build`: compiles `src/` to `dist/`.
    2. `lint`: `tsc` type checks for `src/`, `test/` and `cypress/`.
    3. `prettier:check`
    4. `test`: unit tests, then integration tests.
- The integration tests start the test server themselves and fail if port 3000 is already in use.
- Tests run against `dist/`, not `src/`. Rebuild (`npm run build:fe`) before running tests after a source change.
- `npm run test:ut` runs the unit tests only, which is the fast loop. `npm run test:it` is slow because it launches Cypress several times.
- `npm run dev` rebuilds `dist/` on source changes and restarts the test server on backend changes.

## Conventions

- TypeScript in `strict` mode, ES modules (`"type": "module"`), `target` es6. The backend is CommonJS (`.cjs`).
- Prettier config: 4-space indent, single quotes, semicolons, `es5` trailing commas, LF line endings. Run `npm run prettier` before committing.
- Name unit tests `WHEN <condition> THEN expect <result>`.
- Add a unit test for any change to a helper in `src/index.ts`. Add an integration test and fixture spec for any change to runtime behavior inside Cypress.
- The plugin runs inside the Cypress browser bundle. Keep runtime `dependencies` to `chai` and `type-detect`, and do not use Node-only APIs in `src/`.
- Config validation uses `chai.expect` with `type-detect` and throws `AssertionError`. Follow the same pattern for new config options.
- `package.json` declares `peerDependencies.cypress` as `>=8.4.0`, the oldest Cypress the plugin was tested on, and `engines.node` as `>=18`, which `chai` 6 needs. The `exports` map exposes only the package root and `package.json`. Raising either minimum or narrowing `exports` is a breaking change.
- Keep the public API backward compatible: the default export's signature, the returned `{ getConfig, setConfig, waitForRequests }`, and the `Config`, `Request` and `Range` types. A breaking change needs a major version bump.
- Keep the `cypress-fail-on-network-error:` prefix on thrown error messages. Integration tests and users match on it.
- Dependabot handles dependency updates (`.github/dependabot.yml`): monthly for npm and GitHub Actions, with npm minor and patch updates grouped into one pull request. `.github/workflows/dependabot-auto-merge.yml` turns on auto-merge for minor and patch updates, so they merge once CI passes; major updates wait for review. Dependabot pull requests do not bump the version, so they ship with the next release. Do not bump dependencies unless the task asks for it.

## Releases

Merging a pull request that changes `version` in `package.json` publishes a release: on every push to `main`, `.github/workflows/release.yml` checks for a tag named after the version (without a `v` prefix, such as `1.0.6`). When there is none, it runs `npm run verify`, publishes the package to npm with trusted publishing (no token), then creates the tag and the GitHub release with generated notes. Each step skips work that is already done, so a failed run can be re-run. A pull request that leaves the version alone ships with the next release.

Decide the release in every pull request, and add the matching label:

| Release | Label             | When                                                                                                                                                 |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| major   | `breaking-change` | Removes or renames an export, option or type; changes a default or the type of error thrown; raises the minimum Cypress or Node version.             |
| minor   | `enhancement`     | Adds an option, export or behavior that existing configs do not notice. Stricter validation that only rejects configs that never worked also counts. |
| patch   | `bug`             | Makes behavior match the documentation; updates a runtime dependency.                                                                                |
| none    | `documentation`   | Changes only docs, tests, CI, dev dependencies, or refactors without a change in behavior. No version bump.                                          |

- Choose the highest type among all changes merged since the last release, not just the current pull request's, because the bump releases all of them. For example, while a breaking change sits unreleased on `main`, the next bump must be major.
- Bump with `npm version <type> --no-git-tag-version`, which updates `package.json` and `package-lock.json` and creates no tag. The release workflow creates the tag.
- Give the pull request a plain, descriptive title, such as "Fix status ranges that never match", without a type prefix. The generated release notes list titles as written, grouped by label (`.github/release.yml`).

## Behavior to preserve

- A string entry in `requests` is shorthand for `{ url }`. `url` values go through `new RegExp(url).test(requestUrl)`, so they match anywhere in the full URL.
- Entries are OR'd: a request is excluded if any entry matches. Fields within one entry are AND'd, and an omitted field matches any value.
- A numeric `status` is normalized to a `{ from, to }` range with both ends equal.
- After every test (`test:after:run`) the config is reset to the one passed to `failOnNetworkError()`, and tracked requests are cleared. Responses for requests from an earlier test are ignored.
- `waitForRequests(timeout = 10000)` polls every 500 ms until every tracked request has a status, and resolves without failing when the timeout passes.
