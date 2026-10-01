# cypress-fail-on-network-error

[![npm](https://img.shields.io/npm/v/cypress-fail-on-network-error)](https://www.npmjs.com/package/cypress-fail-on-network-error)
[![CI](https://github.com/nils-hoyer/cypress-fail-on-network-error/actions/workflows/ci.yml/badge.svg)](https://github.com/nils-hoyer/cypress-fail-on-network-error/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/cypress-fail-on-network-error)](https://github.com/nils-hoyer/cypress-fail-on-network-error/blob/main/LICENSE)

Fail a Cypress test when your app makes a network request you did not expect, such as an API call that returns a `500`.

The plugin watches the XHR and `fetch` requests Cypress reports while a test runs. When a request gets a response, or fails without one, the plugin compares it with the `requests` list in your config. If no entry matches, the test fails with an `AssertionError`.

> **Note:** every request is checked, whatever its status. A `200` response fails the test too unless you exclude it, for example with `{ status: 200 }`.

To fail tests on `console.error()` calls instead, see [cypress-fail-on-console-error](https://www.npmjs.com/package/cypress-fail-on-console-error).

## Installation

```sh
npm install --save-dev cypress-fail-on-network-error
```

Requires Cypress 8.4 or later.

## Usage

Register the plugin once in your support file, `cypress/support/e2e.ts`:

```ts
import failOnNetworkError, { Config } from 'cypress-fail-on-network-error';

const config: Config = {
    requests: [
        // Don't fail on successful responses
        { status: 200 },
        // Ignore every request whose URL contains "analytics"
        'analytics',
        // Allow a 404 from one endpoint
        { url: /\/api\/feature-flags/, method: 'GET', status: 404 },
        // Allow a 409 from any POST request
        { method: 'POST', status: 409 },
    ],
};

failOnNetworkError(config);
```

In a JavaScript project (`e2e.js`), drop the `Config` import and the type annotation.

When a request is not excluded, the test fails with an error that starts with `cypress-fail-on-network-error:`. The error then lists every request seen in the current test as JSON (`requestId`, `method`, `url`, `status`).

## What gets checked

The plugin listens to the same network events Cypress uses for the request entries in its command log, which cover XHR and `fetch` requests. Page loads from `cy.visit()` and static assets such as scripts, stylesheets and images are not checked.

## Config

| Option     | Type                    | Default | Description                                                                               |
| ---------- | ----------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `requests` | `(string \| Request)[]` | `[]`    | Requests that must not fail the test. A request is excluded if it matches any entry. |

A `string` entry is shorthand for `{ url: string }`. A `Request` entry can set any combination of the fields below. Every field you set must match, and a field you leave out matches any value.

| Field    | Type                                              | Matches when                                                                                                                                                  |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`    | `string \| RegExp`                                | The pattern matches anywhere in the full request URL. A string is turned into a `RegExp`, so escape characters such as `.` and `?` to match them literally. |
| `method` | `'GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH'` | The request method is exactly this value.                                                                                                                     |
| `status` | `number \| { from: number; to: number }`          | The response status equals the number, or is within the range, including both ends.                                                                          |

A request that fails without a response (for example, when the connection is refused) has no status. Only entries without `status` can exclude it.

An invalid config, such as `status: '404'`, throws an `AssertionError` when you call `failOnNetworkError()` or `setConfig()`.

## Change the config inside a test

`failOnNetworkError()` returns `getConfig()` and `setConfig()`. Wrap them in custom commands to change the excluded requests for one test. After each test, the config goes back to the one you passed to `failOnNetworkError()`.

- `setConfig()` replaces the whole config.
- `getConfig()` returns the normalized config: string entries come back as `Request` objects, and a numeric `status` comes back as a `{ from, to }` range.

```ts
// cypress/support/e2e.ts
import failOnNetworkError, {
    Config,
    Request,
} from 'cypress-fail-on-network-error';

const config: Config = {
    requests: [{ status: 200 }],
};

const { getConfig, setConfig } = failOnNetworkError(config);

Cypress.Commands.addAll({
    getConfigRequests: () => cy.wrap(getConfig().requests),
    setConfigRequests: (requests: (string | Request)[]) => {
        setConfig({ ...getConfig(), requests });
    },
});

declare global {
    namespace Cypress {
        interface Chainable {
            getConfigRequests(): Chainable<(string | Request)[]>;
            setConfigRequests(requests: (string | Request)[]): Chainable<void>;
        }
    }
}
```

Because `setConfigRequests` replaces the list, include the entries you still need:

```ts
it('tolerates an unavailable recommendations service', () => {
    cy.setConfigRequests([
        { status: 200 },
        { url: /\/api\/recommendations/, status: 503 },
    ]);
    cy.visit('/');
});
```

The repository's [support file](https://github.com/nils-hoyer/cypress-fail-on-network-error/blob/main/cypress/support/e2e.ts) and [example specs](https://github.com/nils-hoyer/cypress-fail-on-network-error/tree/main/cypress/e2e) show these commands in use.

## Wait for pending requests

A response that arrives after a test has ended is not checked, so an error from a slow request can go unnoticed. `waitForRequests(timeout = 10000)` waits until every request seen in the current test has a response, checking every 500 ms. If the timeout passes first, the test continues without an error.

Take `waitForRequests` from the same `failOnNetworkError()` call as the other functions. Calling `failOnNetworkError()` more than once registers duplicate listeners.

```ts
// cypress/support/e2e.ts
const { getConfig, setConfig, waitForRequests } = failOnNetworkError(config);

Cypress.Commands.addAll({
    waitForRequests: (timeout?: number) => waitForRequests(timeout),
});

declare global {
    namespace Cypress {
        interface Chainable {
            waitForRequests(timeout?: number): Chainable<void>;
        }
    }
}
```

```ts
it('checks every request the page makes', () => {
    cy.visit('/');
    cy.waitForRequests();
});
```

## Contributing

1. Open an issue that describes the problem and the behavior you expect.
2. Open a pull request with the change and its tests. `npm run verify` must pass locally.

### Local setup

You need Node.js LTS and Chrome, because the integration tests run Cypress in headless Chrome.

```sh
npm ci
npm run verify
```

`npm run verify` runs the same checks as CI:

1. It builds the plugin into `dist/`.
2. It runs type checks and Prettier.
3. It runs the unit tests, then the integration tests. The integration tests start the test server on port 3000, so the port must be free.

`dist/` is not committed; npm builds it when the package is published. While you work, `npm run dev` rebuilds on every change and `npm run test:ut` runs the unit tests alone.
