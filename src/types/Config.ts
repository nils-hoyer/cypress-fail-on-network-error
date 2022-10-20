import { Request } from "./Request";

export interface Config {
    excludeRequests?: (string | Request)[];
}
