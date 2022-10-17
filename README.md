# cypress-fail-on-network-request

This Plugin observes cypress network events. Cypress test fails when `response:received` or `request:error` event from cypress is received.
<br>
Cypress will not automatically wait xhr requests to finish (after e.g. `cy.visit` or `cy.click`) before continue or finish the test. Then `cypress-fail-on-network-request` can only evaluate network requests events received within the test execution itself.

### Installation

```
npm install cypress-fail-on-network-request --save-dev
```

### Usage

`cypress/support/e2e.js`

```js
import failOnNetworkRequest, { Config } from 'cypress-fail-on-network-request';

const config: Config = {
    excludeRequests: [
        'simpleUrlToExclude',
        { url: '/urlToExclude', method: 'GET', status: 400 },
        { status: 200 },
    ],
};

failOnNetworkRequest(config)
```

### Config

| Parameter             | Default               | <div style="width:300px">Description</div>    |
|---                    |---                    |---                                            |
| `excludeRequests`     | `[]` | Exclude requests from throwing `AssertionError`. Types `RegExp`, `string` and `Request` are accepted. Url as `string` will be converted to type ``RegExp`. [String.match()](https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/String/match) will be used for matching. |                                   

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
    it('should set exclude messages', () => {
        cy.setConfigRequests(['urlToExclude']);
        cy.visit('url');
    });
});
```

### Contributing
1. Create an project issue with proper description and expected behaviour
2. Provide a PR with implementation and tests. Command `npm run verify` have to pass locally
