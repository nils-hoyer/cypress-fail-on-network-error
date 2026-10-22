# cypress-fail-on-network-error

[![npm](https://img.shields.io/npm/v/cypress-fail-on-network-error)](https://www.npmjs.com/package/cypress-fail-on-network-error)
[![CI](https://github.com/nils-hoyer/cypress-fail-on-network-error/actions/workflows/ci.yml/badge.svg)](https://github.com/nils-hoyer/cypress-fail-on-network-error/actions/workflows/ci.yml)
[![Sponsor](https://img.shields.io/github/sponsors/nils-hoyer?label=Sponsor&logo=GitHub)](https://github.com/sponsors/nils-hoyer)

Fail Cypress tests when the application under test makes a network request you did not expect, such as an API call that returns a `500`. Set up once in your support file, it checks every XHR and `fetch` request in every test, including failed calls that your app or third-party scripts swallow, which Cypress doesn't fail on.

To fail tests on `console.error()` calls, see [cypress-fail-on-console-error](https://www.npmjs.com/package/cypress-fail-on-console-error).

## Installation

```sh
npm install cypress-fail-on-network-error --save-dev
```

## Usage

Call `failOnNetworkError()` in your support file, `cypress/support/e2e.ts`:

```ts
import failOnNetworkError from 'cypress-fail-on-network-error';

failOnNetworkError();
```

An XHR or `fetch` request fails the test when it gets an error response (`400` or higher) or no response at all. It is logged to the command log:

<img src="./docs/commandLog.png" width="450" alt="An unexpected request in the Cypress command log and the failed test's error">

The plugin sees each request as Cypress's proxy does, so a response that the browser then blocks, for example for missing CORS headers, does not fail the test.

## Configuration

| Option           | Default | Description |
| ---------------- | ------- | ----------- |
| `ignoreRequests` | `[{ status: { from: 100, to: 399 } }]` | Requests that don't fail a test, see [Matching requests](#matching-requests). Your list replaces the default, so keep its entry to ignore successful responses, or use `[]` to fail on every request. |
| `debug` | `false` | Also logs each request that `ignoreRequests` ignores, with the entry that matched it. See [Debugging](#debugging). |

```ts
import failOnNetworkError, { type Config } from 'cypress-fail-on-network-error';

const config: Config = {
    ignoreRequests: [
        { status: { from: 100, to: 399 } }, // keep the default
        'analytics', // any request whose URL contains "analytics"
        { url: '/api/*/avatar*', status: 404 }, // a glob
        /\/api\/v\d+\/health/, // a RegExp: /api/v1/health, /api/v2/health, …
        { url: '/api/feature-flags', method: 'GET', status: 404 },
        { method: 'POST', status: 409 }, // a 409 from any POST request
        { method: ['HEAD', 'OPTIONS'] }, // any HEAD or OPTIONS request
        // responses that the server marks as expected
        ({ responseHeaders }) => responseHeaders?.['x-expected-error'] === 'true',
    ],
};

failOnNetworkError(config);
```

### Matching requests

An entry is an object with any of `url`, `method`, `status` and `predicate`. A string or a `RegExp` is shorthand for `{ url }`, and a function for `{ predicate }`. A request that matches any entry is ignored. Within an entry, every field it sets must match.

- `url` is a `string` or a `RegExp`. A string matches when the URL contains it, such as `'/api/users'`, or as a [glob](https://on.cypress.io/minimatch), as in `cy.intercept()`, such as `'/api/*/users'`. A `RegExp` matches anywhere in the full URL.
    - Because a string matches when the URL contains it, `'/api/feature-flags'` also matches `/api/feature-flags-v2`. To match only that path, use a `RegExp` such as `/\/api\/feature-flags(\?|$)/`.
    - A glob must match the query too, so `'/api/*/avatar'` does not match `/api/1/avatar?size=64`, but `'/api/*/avatar*'` does.
- `method` is an HTTP method, such as `'GET'`, in any case, or a list of methods.
- `status` is a number, or a range `{ from, to }` that includes both ends. A request without a response, for example when the connection is refused, has no status, so only entries without `status` match it.
- `predicate` gets the request's `method`, `url`, `requestHeaders`, and `status` and `responseHeaders` or `error`, and ignores the request when it returns `true`. Header names are lower case. Request and response bodies are not available.

## Ignoring requests in one test

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
    cy.addIgnoredRequests([{ url: '/api/recommendations', status: 503 }]);
    cy.visit('/');
});
```

| Command                                    | Description |
| ------------------------------------------ | ----------- |
| `cy.getIgnoredRequests()`                  | Yields `ignoreRequests`. |
| `cy.setIgnoredRequests(['/api/cart'])`     | Replaces `ignoreRequests`, including the default entry. |
| `cy.addIgnoredRequests([{ status: 404 }])` | Adds to `ignoreRequests`. |
| `cy.deleteIgnoredRequests(['/api/cart'])`  | Removes equal entries from `ignoreRequests`. |
| `cy.waitForRequests(timeout)`              | Waits for pending requests, see [below](#waiting-for-pending-requests). |

To change `debug` in a test, use `getConfig()` and `setConfig()`, which `failOnNetworkError()` returns:

```ts
const { getConfig, setConfig } = failOnNetwork;

Cypress.Commands.add('setDebug', (debug: boolean) => {
    setConfig({ ...getConfig(), debug });
});

declare global {
    namespace Cypress {
        interface Chainable {
            setDebug(debug: boolean): Chainable<void>;
        }
    }
}
```

## Waiting for pending requests

A response that arrives after the test's last command is not checked. To check slow requests too, end the test with `cy.waitForRequests()`, which `addIgnoredRequestsCommands()` registers:

```ts
it('should check every request the page makes', () => {
    cy.visit('/');
    cy.waitForRequests();
});
```

`cy.waitForRequests(timeout = 10000)` waits until every request of the current test has a response or has failed. When the timeout passes first, the test continues without an error, and each request that is still pending is logged as `pending`.

## Debugging

Click an `unexpected` entry in the command log to print the request, its status or error, and the `ignoreRequests` entries it was matched against to the browser console.

Set `debug: true` to also log each ignored request, with the entry that matched it:

```ts
failOnNetworkError({
    ignoreRequests: [{ status: { from: 200, to: 399 } }],
    debug: true,
});
```

<img src="./docs/debugTrue.png" width="450" alt="An ignored request and an unexpected one in the Cypress command log">

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
