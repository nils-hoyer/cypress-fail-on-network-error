# cypress-fail-on-network-request

This Plugin observes network requests through cypress network events. Cypress test fails when `response:received` or `request:error` event is received. 

<p>

For observing `console.error()` please check out [cypress-fail-on-console-error](https://www.npmjs.com/package/cypress-fail-on-console-error).

<p>

By default cypress will not wait for xhr requests to be solved after cypress commands (after e.g. `cy.visit` or `cy.click`). Also the browser cancel unsolved requests when `window.location` changes (cypress commands or website). As a result of that `cypress-fail-on-network-request` can only evaluate network request events within the cypress test execution. The plugin also provide an experimental function to manually wait for all requests to be solved within the test. See section `Wait for requests to be solved`


### Installation

```
npm install cypress-fail-on-network-request --save-dev
```

### Usage

`cypress/support/e2e.js`

```js
import failOnNetworkRequest, { Config, Request } from 'cypress-fail-on-network-request';

const config: Config = {
    excludeRequests: [
        'simpleUrlToExclude',
        { url: /urlToExclude/, method: 'GET', status: 400 },
        { status: 430 },
        { status: { from: 200, to: 399 } },
    ],
};

failOnNetworkRequest(config)
```

### Config

| Parameter             | Default               | <div style="width:300px">Description</div>    |
|---                    |---                    |---                                            |
| `requests`     | `[]` | Exclude requests from throwing `AssertionError`. Types `string`, `RegExp`, `Request` are accepted. `string` and `request.url` will be converted to type `RegExp`. [String.match()](https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/String/match) will be used for matching. |                                   

<br/>

### Set config from cypress test 
Use `failOnNetworkRequest` functions `getConfig()` and `setConfig()` with your own requirements. Detailed example implementation [cypress comands](https://github.com/nils-hoyer/cypress-fail-on-network-request/blob/main/cypress/support/e2e.ts#L14-L64) & [cypress test](https://github.com/nils-hoyer/cypress-fail-on-network-request/blob/main/cypress/e2e/shouldFailOnNetworkRequest.cy.ts#L1-L25). Note that the config will be resetted to initial config between tests.
```js
const { getConfig, setConfig } = failOnNetworkRequest(config);

Cypress.Commands.addAll({
    getConfigRequests: () => {
        return cy.wrap(getConfig().excludeRequests);
    },
    setConfigRequests: (requests: (string | Request)[]) => {
        setConfig({ ...getConfig(), excludeRequests: requests });
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

### Wait for requests to be solved
Use `failOnNetworkRequest` function `waitForRequests()` to wait until all requests are resolved. The default timeout is 10.000 ms which can be changed by overriding the default value `waitForRequests(5000)`. The functions is designed to continue after timeout, even if requests are not resolved. 

<p>

Keep in mind that the website or cypress can interrupt pending requests anytime by changing `window.location`, which results in those requests can never be resolved. Detailed example implementation [cypress comands](https://github.com/nils-hoyer/cypress-fail-on-network-request/blob/main/cypress/support/e2e.ts#L13-L35) & [cypress test](https://github.com/nils-hoyer/cypress-fail-on-network-request/blob/main/cypress/e2e/shouldWaitForRequests.cy.ts).
```js

const { waitForRequests } = failOnNetworkRequest(config);

Cypress.Commands.addAll({
    waitForRequests: () => waitForRequests(),
});
```

```js
describe('example test', () => {
    it('should wait for requests to be solved', () => {
        cy.visit('url');
        cy.wait(0).waitForRequests();
        // seems to run only stable on next tick
    });
});
```


### Contributing
1. Create an project issue with proper description and expected behaviour
2. Provide a PR with implementation and tests. Command `npm run verify` have to pass locally
