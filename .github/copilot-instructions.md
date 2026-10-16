# Copilot instructions

## What this project is

`cypress-fail-on-network-error` is a Cypress plugin published to npm. Users call `failOnNetworkError(config)` once in their Cypress support file. The plugin listens to Cypress's internal `request:event` (the proxy-logging events behind the command log, which cover XHR and `fetch` requests). When a request gets a response or errors and matches no entry in `config.requests`, the plugin records the failure, and its `command:end` listener throws a chai `AssertionError` at the end of the running command. Every request that is not excluded fails the test, including `2xx` responses.

## Repository layout

- `src/index.ts`: the whole plugin. Default export `failOnNetworkError`, the types `Config`, `Request`, `Range`, `NormalizedRequest`, `NormalizedConfig` and `RequestSession`, and helper functions (`validateConfig`, `createConfig`, `mapToRequests`, `findRequest`, `isRequestExcluded`) that are exported so the unit tests can reach them.
- `dist/`: compiled output, ignored by git. npm publishes it (`files` in `package.json`), and the `prepack` script rebuilds it before every `npm pack` and `npm publish`. Never edit it by hand, and do not commit it.
- `test/unitTest.ts`: mocha unit tests for the helpers and the event listeners. They import from `../dist/index.js` and stub the `Cypress` and `cy` globals before each test. The `Cypress.on` stub stores each listener by event name, and helpers such as `incomingRequest`, `responseReceived`, `requestError`, `commandEnd` and `testAfterRun` fire those events. A failing request throws only when `commandEnd()` fires.
- `test/integrationTest.ts`: starts the test server on a free port, runs every spec in `cypress/e2e/` in one `cypress.run()` call (the Module API) with that port as `baseUrl`, and checks each test's result. A test titled `should pass …` must pass, one titled `should fail …` must fail with an error that starts with `AssertionError: cypress-fail-on-network-error:` (or `Error:` for config validation), and any other title fails the check. `errorChecks` adds checks on the error for a few tests. The `BROWSER` environment variable picks the browser (`chrome` by default).
- `cypress/e2e/*.cy.ts`: fixture specs driven by the integration test. Tests titled `should fail …` fail on purpose; do not "fix" them. A new spec needs no change to `integrationTest.ts`. Specs visit `/` and make their requests with `cy.fetch()` or `cy.xhr()`, use relative URLs, and end with `cy.waitForRequests()`, not a fixed `cy.wait()`, so a response cannot arrive after the test has ended.
- `cypress/support/e2e.ts`: registers the plugin from `../../dist/index` and defines the custom commands used by the specs: `getConfigRequests`, `setConfigRequests` and `waitForRequests`, and `fetch` and `xhr`, which make a request from the page without waiting for the response.
- `backend/app.cjs`: Express test server. `integrationTest.ts` starts it with the exported `start()`, which listens on a free port, before the tests and closes it after them. `node backend/app.cjs` (`npm run build:be`) runs it on port 3000, the `baseUrl` in the Cypress config, for `npx cypress open`.
    - `GET /` serves a blank page.
    - `/xhr?status=&delay=` responds to any method with `status` after `delay` milliseconds (default `0`). `status=none` closes the connection without a response instead, which Cypress reports as a `request:error`. Electron and Firefox retry such a request, and each retry is a new request.
    - `GET /resources` serves a page that loads a script, a stylesheet and an image from the server, and sends one XHR.
- `README.md`: user documentation. Update it whenever public API or behavior changes. Do not document config validation there: an invalid config fails with a message that explains itself.

## Build and test

- Use Node.js LTS (CI uses `lts/*`). Mocha loads the `.ts` test files through Node's built-in type stripping, without `ts-node`, so `devEngines` in `package.json` sets the oldest Node that strips types by default, and `npm ci` fails on an older one. `devEngines` applies only to work on this repository; `engines` is what users need. `test/tsconfig.json` sets `erasableSyntaxOnly` and `verbatimModuleSyntax`, so `npm run lint` rejects syntax Node cannot strip (such as `enum`) and imports used only as types without `import type`. Integration tests run in Chrome by default, which must be installed; `BROWSER=firefox` or `BROWSER=electron` runs them in another browser. CI runs Chrome and Firefox, as two jobs of a matrix, because Cypress reports requests differently in each: Chrome sends a `request:error` for a cancelled request, Firefox sends nothing and retries a request without a response. Electron is not tested in CI: Cypress 16 deprecates it as a test browser and will remove it. The runner's browsers update on their own schedule, so a browser release can fail CI on an unrelated pull request.
- `npm ci` installs dependencies.
- `npm run verify` is what CI runs, once per browser, and it must pass before a PR is merged. It runs, in order:
    1. `build`: compiles `src/` to `dist/`.
    2. `lint`: `tsc` type checks for `src/`, `test/` and `cypress/`.
    3. `prettier:check`
    4. `test`: unit tests, then integration tests.
- The integration tests start the test server themselves on a free port, so a dev server on port 3000 does not get in the way. They also remove `ELECTRON_RUN_AS_NODE`, which VS Code sets in its terminals and which stops the Cypress binary from starting; run `npx cypress open` there with `ELECTRON_RUN_AS_NODE= npx cypress open`.
- Tests run against `dist/`, not `src/`. Rebuild (`npm run build:fe`) before running tests after a source change.
- `npm run test:ut` runs the unit tests only, which is the fast loop. `npm run test:it` takes about 30 s, because it launches Cypress and runs every spec.
- `npm run dev` rebuilds `dist/` on source changes and restarts the test server on backend changes.

## Conventions

- TypeScript in `strict` mode, ES modules (`"type": "module"`), `target` es6. The backend is CommonJS (`.cjs`).
- Prettier config: 4-space indent, single quotes, semicolons, `es5` trailing commas, LF line endings. Run `npm run prettier` before committing.
- Name unit tests `WHEN <condition> THEN expect <result>`.
- Add a unit test for any change to a helper in `src/index.ts`. Add an integration test and fixture spec for any change to runtime behavior inside Cypress.
- The plugin runs inside the Cypress browser bundle. Keep runtime `dependencies` to `chai` (a unit test checks that `dist/index.js` imports nothing else), and do not use Node-only APIs in `src/`.
- Config validation uses plain checks (the `typeName`, `expectType` and `invalid` helpers) and throws a plain `Error`, not chai's `AssertionError`: a broken config is not a failed check. The message starts with the `cypress-fail-on-network-error:` prefix, names the entry and key, such as `config.requests[1].status`, and says what it got. Follow the same pattern for new config options, and add them to `configKeys` or `requestKeys`, or validation rejects them. Only a request that fails the test throws `AssertionError`.
- `package.json` declares `peerDependencies.cypress` as `>=8.4.0`, the oldest Cypress the plugin was tested on, and `engines.node` as `>=18`, which `chai` 6 needs. The `exports` map exposes only the package root and `package.json`. Raising either minimum or narrowing `exports` is a breaking change.
- Keep the public API backward compatible: the default export's signature, the returned `{ getConfig, setConfig, waitForRequests }`, and the `Config`, `Request`, `Range`, `NormalizedRequest` and `NormalizedConfig` types. A breaking change needs a major version bump.
- Keep the `cypress-fail-on-network-error:` prefix on thrown error messages. Integration tests and users match on it.
- Dependabot handles dependency updates (`.github/dependabot.yml`): monthly for npm and GitHub Actions, with npm minor and patch updates grouped into one pull request. `.github/workflows/dependabot-automerge.yml` waits for CI on minor and patch updates and squash-merges them when it passes; major updates wait for review. `main` has no required checks (the Release workflow pushes to it), so the workflow waits for CI itself instead of using `gh pr merge --auto`. Dependency updates ship with the next release. Do not bump dependencies unless the task asks for it.

## Releases

Releases are started by hand: run `.github/workflows/release.yml` from the Actions tab on `main` and choose `patch`, `minor` or `major`. It runs CI, then `npm version`, which commits `Release <version>` and tags `<version>` without a `v` prefix, like the earlier tags. It pushes both to `main` together, publishes to npm with trusted publishing (OIDC, which also adds provenance) from the `npm` environment, and creates the GitHub release with generated notes. If the publish job fails, "Re-run failed jobs" publishes the tag that was already pushed instead of increasing the version again.

Do not change `version` in `package.json` in a pull request; the Release workflow does that. Label every pull request with the release type it needs:

| Release | Label             | When                                                                                                                                                                   |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| major   | `breaking-change` | Removes or renames an export, option or type; changes a default or the type of error thrown when a request fails the test; raises the minimum Cypress or Node version. |
| minor   | `enhancement`     | Adds an option, export or behavior that existing configs do not notice. Stricter validation that only rejects configs that never worked also counts.                   |
| patch   | `bug`             | Makes behavior match the documentation; updates a runtime dependency.                                                                                                  |
| none    | `documentation`   | Changes only docs, tests, CI, dev dependencies, or refactors without a change in behavior. Ships with the next release.                                                |

- When running the Release workflow, choose the highest type among the pull requests merged since the last release. For example, while a breaking change sits unreleased on `main`, the next release must be major.
- Give the pull request a plain, descriptive title, such as "Fix status ranges that never match", without a type prefix. The generated release notes list titles as written, grouped by label (`.github/release.yml`).

## Behavior to preserve

- Validation rejects unknown keys, whatever their value, at the top level (`configKeys`) and in entries (`requestKeys`), entries that set none of `url`, `method` and `status` (an empty `url` counts as unset), entries that are neither a string nor an object, `url` strings that are not valid regular expressions, and an empty `url` RegExp (`/(?:)/` or `new RegExp('')`), which matches every request. A RegExp that is not empty but matches everything, such as `/.*/`, stays valid. It must accept the normalized config from `getConfig()`, because `test:after:run` passes it back to `setConfig()`.
- `getConfig()` returns a `NormalizedConfig`: `mapToRequests` turns a string into `{ url }`, a numeric `status` into a range and `method` into upper case, and `isRequestExcluded` matches only normalized entries. An entry pushed to `getConfig().requests` skips normalization (a string would exclude every request), so the type allows only `NormalizedRequest`.
- A string entry in `requests` is shorthand for `{ url }`. `url` values go through `new RegExp(url).test(requestUrl)`, so they match anywhere in the full URL.
- Methods match case-insensitively: `mapToRequests` upper-cases the entry's method and `isRequestExcluded` upper-cases the request's, because browsers upper-case only the standard methods.
- Entries are OR'd: a request is excluded if any entry matches. Fields within one entry are AND'd, and an omitted field matches any value.
- A numeric `status` is normalized to a `{ from, to }` range with both ends equal, and a reversed range has its ends swapped. A range matches statuses from `from` to `to`, including both ends; a request without a status never matches an entry that sets `status`.
- Never throw inside the `request:event` listener. Cypress delivers that event from the server outside the command queue, so an error thrown there becomes an uncaught exception: Cypress says it "originated from your application code", and a project's `uncaught:exception` handler that returns `false` hides it. Record the failure and throw it from `command:end`, as cypress-fail-on-console-error does. A failure recorded after the test's last command is dropped by `test:after:run`.
- A request that the browser cancels, because the page aborted it or navigated away, does not fail the test. Chrome reports it as a `request:error` whose message starts with `CDP Fetch request canceled by the browser:` (seen with Cypress 16.1.1, from its CDP Fetch transport); the error has no other field that marks a cancellation, so `isCancelledByBrowser` matches the start of that message only. Electron and Firefox send no event for it. On `window:unload` every request still pending is marked `cancelled`, so `waitForRequests` stops waiting for it; a response that still arrives is checked. A request the page aborts without unloading stays pending in Electron and Firefox until `waitForRequests` times out. `shouldIgnoreCancelledRequests` covers the Chrome half in Chrome and the unload half in Firefox, so it needs both CI jobs.
- After every test (`test:after:run`) the config is reset to the one passed to `failOnNetworkError()`, and tracked requests are cleared. Responses for requests from an earlier test are ignored.
- `waitForRequests(timeout = 10000)` starts polling when its command runs, not when it is called. It checks every 500 ms, starting 500 ms after the command runs (the plugin learns about a request a few ms after the page makes it), until every tracked request has a status, an error or was cancelled, and resolves without failing when the timeout passes.
