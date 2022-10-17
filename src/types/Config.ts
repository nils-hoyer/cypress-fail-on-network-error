import { Request } from "./Request";

export interface Config {
    // mode?: 'error' | 'log'
    excludeRequests?: (string | Request)[];
    // waitRequests?: 'afterEach' | 'after' | 'none';
    // waitRequestsTimeout?: number;

}
