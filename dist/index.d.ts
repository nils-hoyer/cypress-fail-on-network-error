export type Config = {
    requests?: (string | Request)[];
};
export interface Request {
    url?: string | RegExp;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    status?: number | Range;
}
export type Range = {
    from: number;
    to: number;
};
export default function failOnNetworkError(_config?: Config): {
    getConfig: () => Required<Config>;
    setConfig: (_config: Config) => void;
    waitForRequests: (timeout?: number) => Cypress.Chainable<any>;
};
export declare const validateConfig: (config: Config) => void;
export declare const createConfig: (config: Config) => Required<Config>;
export declare const mapToRequests: (_unknowns: (string | Request)[]) => Request[];
export declare const findRequest: (requests: RequestSession[], eventRequestId: string) => RequestSession | undefined;
export declare const isRequestExcluded: (request: RequestSession, config: Required<Config>) => boolean;
export type RequestSession = {
    requestId: string;
    method: string;
    url: string;
    status?: number;
};
