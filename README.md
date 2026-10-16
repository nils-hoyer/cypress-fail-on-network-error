# cypress-fail-on-network-error

[![npm](https://img.shields.io/npm/v/cypress-fail-on-network-error)](https://www.npmjs.com/package/cypress-fail-on-network-error)
[![CI](https://github.com/nils-hoyer/cypress-fail-on-network-error/actions/workflows/ci.yml/badge.svg)](https://github.com/nils-hoyer/cypress-fail-on-network-error/actions/workflows/ci.yml)
[![Sponsor](https://img.shields.io/github/sponsors/nils-hoyer?label=Sponsor&logo=GitHub)](https://github.com/sponsors/nils-hoyer)

Fail Cypress tests when the application under test makes a network request you did not expect, such as an API call that returns a `500`.

To fail tests on `console.error()` calls, see [cypress-fail-on-console-error](https://www.npmjs.com/package/cypress-fail-on-console-error).

## Installation

```sh
npm install cypress-fail-on-network-error --save-dev
```

## Usage

Call `failOnNetworkError()` in your support file, `cypress/support/e2e.js` or `cypress/support/e2e.ts`:

```js
import failOnNetworkError from 'cypress-fail-on-network-error';

failOnNetworkError({
    // don't fail on successful responses
    ignoreRequests: [{ status: { from: 200, to: 399 } }],
});
```

Call it once. A later call, for example in a spec or a `beforeEach`, replaces the earlier one and logs a warning to the browser console.

Every XHR and `fetch` request is checked, whatever its status, so without the entry above a `200` fails the test too. Page loads from `cy.visit()` and scripts, stylesheets and images are not checked. Neither are requests that the browser cancels, because the page aborted them (`AbortController`, `xhr.abort()`) or navigated away.

When a request gets a response, or fails without one, and no entry in `ignoreRequests` matches it, the test fails at the end of the current command. The error starts with `cypress-fail-on-network-error:` and lists each such request on a line of its own, such as `GET http://localhost:3000/api/cart → 500`, or the error instead of the status for a request without a response. Each one is also logged to the command log as `unexpected`:

![An unexpected request in the Cypress command log and the failed test's error](./docs/commandLog.png)

## Config (optional)

| Option           | Default | Description |
| ---------------- | ------- | ----------- |
| `ignoreRequests` | `[]`    | Requests that don't fail a test, as `string` (shorthand for `{ url }`), `{ url, method, status, predicate }`, or a function (shorthand for `{ predicate }`). A request that matches any entry is excluded. `requests`, its old name, still works. |
| `debug` | `false` | Also logs each request that `ignoreRequests` ignores, with the entry that matched it. See [Debugging](#debugging). |

```ts
import failOnNetworkError, { Config } from 'cypress-fail-on-network-error';

const config: Config = {
    ignoreRequests: [
        { status: { from: 200, to: 399 } },
        'analytics', // any request whose URL contains "analytics"
        { url: /\/api\/feature-flags/, method: 'GET', status: 404 },
        { method: 'POST', status: 409 }, // a 409 from any POST request
        { method: ['HEAD', 'OPTIONS'] }, // any HEAD or OPTIONS request
        ({ url, status }) => status === 404 && url.endsWith('.map'),
    ],
};

failOnNetworkError(config);
```

### How requests are matched

- Every field an entry sets must match. A field it leaves out matches any value.
- `url` is a `string` or `RegExp` that matches anywhere in the full URL. Strings are converted with `new RegExp(string)`, so [escape special characters](https://javascript.info/regexp-escaping).
- `method` is any HTTP method, such as `GET`, `HEAD` or `OPTIONS`, in any case, or a list of methods, which matches any of them.
- `status` is a number, or a range `{ from, to }` that includes both ends.
- `predicate` is a function that gets the request's `method`, `url`, and `status` or `error`, and excludes it when it returns `true`. It is called only when the other fields of its entry match. An error it throws fails the test.
- A request that fails without a response, for example when the connection is refused, has no status. Only entries without `status` match it.

## Change the config in a test

To change the ignored requests in a test, and to wait for pending requests, register the commands in your support file:

```ts
import failOnNetworkError, {
    addIgnoredRequestsCommands,
} from 'cypress-fail-on-network-error';

const failOnNetwork = failOnNetworkError(config);
addIgnoredRequestsCommands(failOnNetwork);
```

Then use them in a test. Changes last until the end of the test.

```ts
it('should tolerate an unavailable recommendations service', () => {
    cy.addIgnoredRequests([{ url: /\/api\/recommendations/, status: 503 }]);
    cy.visit('/');
});
```

| Command                                    | Description |
| ------------------------------------------ | ----------- |
| `cy.getIgnoredRequests()`                  | Yields `ignoreRequests`. |
| `cy.setIgnoredRequests(['foo', { url: /bar/ }])`    | Replaces `ignoreRequests`. |
| `cy.addIgnoredRequests([{ status: 404 }])` | Adds to `ignoreRequests`. |
| `cy.deleteIgnoredRequests(['foo'])`        | Removes equal entries from `ignoreRequests`, in any form: `'foo'` removes `{ url: 'foo' }`, and a predicate only the same function. |
| `cy.waitForRequests(timeout)`              | Waits for pending requests, see [below](#wait-for-pending-requests). |

The package declares the commands for TypeScript. `cy.getIgnoredRequests()` yields each entry normalized: a string becomes `{ url }`, a function `{ predicate }`, a number in `status` becomes `{ from, to }`, and `method` is upper case.

To change other options, use `getConfig()` and `setConfig()`, which `failOnNetworkError()` returns. `setConfig()` accepts every form of entry:

```ts
const { getConfig, setConfig } = failOnNetwork;

Cypress.Commands.add('setDebug', (debug) => setConfig({ ...getConfig(), debug }));
```

## Wait for pending requests

A response that arrives after the test's last command is not checked. To check slow requests too, end the test with `cy.waitForRequests()`, which `addIgnoredRequestsCommands()` registers:

```ts
it('should check every request the page makes', () => {
    cy.visit('/');
    cy.waitForRequests();
});
```

`cy.waitForRequests(timeout = 10000)` waits until every request of the current test has a response or has failed. It checks every 500 ms, starting 500 ms after the command runs, so it also sees requests the page has just made. When the timeout passes first, the test continues without an error.

It does not wait for requests that were pending when the page unloaded, such as after `cy.visit()` to another page; a response that still arrives is checked. Electron and Firefox report nothing for a request that the page aborts, so `waitForRequests` waits for it until the timeout.

## Debugging

Click an `unexpected` entry in the command log to print the request, its status or error, and the `ignoreRequests` entries it was matched against to the browser console.

Set `debug: true` to also log each ignored request, with the entry that matched it:

```ts
failOnNetworkError({
    ignoreRequests: [{ status: { from: 200, to: 399 } }],
    debug: true,
});
```

![An ignored request and an unexpected one in the Cypress command log](./docs/debugTrue.png)

## Contributing

1. Open an issue that describes the problem and the expected behavior.
2. Install dependencies with `npm ci`. The integration tests run Cypress in Chrome, which must be installed. `BROWSER=firefox` runs them in Firefox. CI runs Chrome and Firefox.
3. Make your change in `src/index.ts` and run `npm run build`. The tests run against `dist/`, which is not committed.
4. Run `npm run verify` (build, type check, format check, unit and integration tests). It must pass.
5. Open a PR with the implementation and tests. Don't change the version in `package.json`: the maintainer releases from GitHub Actions, which increases the version.
