import * as chai from 'chai';
import { RequestSession } from 'dist/types/RequestSession';
import { Config } from '../dist/types/Config';
import failOnNetworkRequest, {
    createConfig,
    isRequestExcluded,
} from './../dist/index';

//@ts-ignore
global['Cypress'] = { on: (f, s) => true };

describe('failOnNetworkRequest()', () => {
    it('WHEN failOnNetworkRequest is created with Config THEN expect no error', () => {
        const config: Config = {
            excludeRequests: ['foo'],
        };
        failOnNetworkRequest(config);
    });
    it('WHEN failOnNetworkRequest is created with no Config THEN expect no error', () => {
        failOnNetworkRequest();
    });
});

describe('isRequestExcluded()', () => {
    it('WHEN request is excluded THEN expect true', () => {
        const config: Required<Config> = createConfig({
            excludeRequests: [{ url: 'foo', status: 400, method: 'GET' }],
        });
        const request: RequestSession = {
            requestId: '1',
            method: 'GET',
            url: 'http://foo',
            status: 400,
        };
        chai.expect(isRequestExcluded(request, config)).to.be.true;
    });
    it('WHEN request is not excluded THEN expect false', () => {
        const config: Required<Config> = createConfig({
            excludeRequests: [{ url: 'foo', status: 200, method: 'POST' }],
        });
        const request: RequestSession = {
            requestId: '1',
            method: 'GET',
            url: 'http://foo',
            status: 400,
        };
        chai.expect(isRequestExcluded(request, config)).to.be.false;
    });
});
