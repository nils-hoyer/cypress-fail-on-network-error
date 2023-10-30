# cypress-fail-on-network-error

This Plugin observes network requests through cypress network events. Cypress test fails when a response or request error is received. For observing `console.error()` please check out [cypress-fail-on-console-error](https://www.npmjs.com/package/cypress-fail-on-console-error).

### Installation

```
npm install cypress-fail-on-network-error --save-dev
```

### Usage

`cypress/support/e2e.js`

```js
import failOnNetworkError, { Config, Request } from 'cypress-fail-on-network-error';

const config: Config = {
    requests: [
        'simpleUrlToExclude',
        { url: 'simpleUrlToExclude', method: 'GET', status: 400 },
        { url: /urlToExclude/, method: 'POST', status: 428 },
        { status: 430 },
        { status: { from: 200, to: 399 } },
    ],
};

failOnNetworkError(config)
```

### Config

| Parameter             | Default               | <div style="width:300px">Description</div>    |
|---                    |---                    |---                                            |
| `requests`     | `[]` | Exclude requests from throwing `AssertionError`. Types `string`, `RegExp`, `Request` are accepted. `string` and `request.url` will be converted to type `RegExp`. [String.match()](https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/String/match) will be used for matching. |                                   

<br/>

### Set config from cypress test 
Use `failOnNetworkError` functions `getConfig()` and `setConfig()` with your own requirements. Detailed example implementation [cypress comands](https://github.com/nils-hoyer/cypress-fail-on-network-error/blob/main/cypress/support/e2e.ts#L14-L64) & [cypress test](https://github.com/nils-hoyer/cypress-fail-on-network-error/blob/main/cypress/e2e/shouldfailOnNetworkError.cy.ts#L1-L25). Note that the config will be resetted to initial config between tests.
```js
const { getConfig, setConfig } = failOnNetworkError(config);

Cypress.Commands.addAll({
    getConfigRequests: () => {
        return cy.wrap(getConfig().requests);
    },
    setConfigRequests: (requests: (string | Request)[]) => {
        setConfig({ ...getConfig(), requests });
    },
});
```

```js
describe('example test', () => {
    it('should set exclude requests', () => {
        cy.setConfigRequests(['urlToExclude']);
        cy.visit('url');
    });
});
```

### Wait for all pending requests to be resolved
Use `failOnNetworkError` function `waitForRequests()` to wait until all pending requests are resolved. The default timeout is 10000 ms which can be changed by overriding the default value `waitForRequests(5000)`. When reaching the timeout, Cypress test execution will continue without throwing an timeout exception.
Detailed documenation for [cypress comands](https://github.com/nils-hoyer/cypress-fail-on-network-error/blob/main/cypress/support/e2e.ts#L13-L35) & [cypress test](https://github.com/nils-hoyer/cypress-fail-on-network-error/blob/main/cypress/e2e/shouldWaitForRequests.cy.ts).

```js
const { waitForRequests } = failOnNetworkError(config);

Cypress.Commands.addAll({
    waitForRequests: () => waitForRequests(),
});
```

```js
describe('example test', () => {
    it('should wait for requests to be solved', () => {
        cy.visit('url');
        cy.wait(0).waitForRequests();
    });
});
```


### Contributing
1. Create an project issue with proper description and expected behaviour
2. Provide a PR with implementation and tests. Command `npm run verify` have to pass locally
