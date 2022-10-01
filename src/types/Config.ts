import { Request } from "./Request";

export interface Config {
    requests?: (string | Request)[];
    timeout?: number;
}
