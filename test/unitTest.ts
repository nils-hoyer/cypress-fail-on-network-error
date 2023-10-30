import * as chai from 'chai';
import { AssertionError } from 'chai';
import failOnNetworkError, {
    Config,
    RequestSession,
    createConfig,
    isRequestExcluded,
    mapToRequests,
    validateConfig,
} from './../dist/index';

//@ts-ignore
global['Cypress'] = { on: (f, s) => true };

describe('failOnNetworkError()', () => {
    it('WHEN failOnNetworkError is created with Config THEN expect no error', () => {
        const config: Config = {
            requests: ['foo'],
        };
        failOnNetworkError(config);
    });
    it('WHEN failOnNetworkError is created with no Config THEN expect no error', () => {
        failOnNetworkError();
    });
});

describe('validateConfig()', () => {
    it('WHEN config is invalid status type THEN expect assertion error', () => {
        const config: any = {
            requests: [{ url: 'url', status: '400', method: 'GET' }],
        };

        chai.expect(() => validateConfig(config)).to.throw(AssertionError);
    });

    it('WHEN config is invalid status object THEN expect assertion error', () => {
        const config: any = {
            requests: [{ url: 'url', status: { from: 200 }, method: 'GET' }],
        };

        chai.expect(() => validateConfig(config)).to.throw(AssertionError);
    });

    it('WHEN config is valid THEN expect no assertion error', () => {
        const config: Config = {
            requests: [
                'url',
                { url: 'url', status: 200, method: 'GET' },
                { url: 'url', status: { from: 200, to: 299 }, method: 'GET' },
            ],
        };

        chai.expect(() => validateConfig(config)).to.not.throw(AssertionError);
    });
});

describe('mapToRequests()', () => {
    it('WHEN mapToRequests is called THEN expect Request object array', () => {
        const requests = [
            'url1',
            { url: 'url2', status: 400, method: 'GET' },
            { method: 'GET' },
            { status: { from: 200, to: 399 } },
        ] as (string | Request)[];

        const mappedRequests = mapToRequests(requests as any);
        debugger;
        chai.expect(mappedRequests).to.deep.equal([
            { url: 'url1', status: undefined, method: undefined },
            { url: 'url2', status: { from: 400, to: 400 }, method: 'GET' },
            { url: undefined, status: undefined, method: 'GET' },
            {
                url: undefined,
                status: { from: 200, to: 399 },
                method: undefined,
            },
        ]);
    });
});

describe('isRequestExcluded()', () => {
    it('WHEN request is excluded THEN expect true', () => {
        const config: Required<Config> = createConfig({
            requests: [{ url: 'foo', status: 400, method: 'GET' }],
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
            requests: [{ url: 'foo', status: 200, method: 'POST' }],
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
