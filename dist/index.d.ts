import { Config } from './types/Config';
import { Request } from './types/Request';
import { RequestSession } from './types/RequestSession';
export default function failOnNetworkRequest(_config?: Config): {
    getConfig: () => Required<Config>;
    setConfig: (_config: Config) => void;
    waitForRequests: (timeout?: number) => Cypress.Chainable<any>;
};
export declare const validateConfig: (config: Config) => void;
export declare const createConfig: (config: Config) => Required<Config>;
export declare const mapToRequests: (_unknowns: (string | Request)[]) => Request[];
export declare const findRequest: (requests: RequestSession[], eventRequestId: string) => RequestSession | undefined;
export declare const isRequestExcluded: (request: RequestSession, config: Required<Config>) => boolean;
export { Config } from './types/Config';
export { Request } from './types/Request';
