import { Config } from './types/Config';
import { Request } from './types/Request';
export default function failOnConsoleError(_config?: Config): {
    getConfig: () => Required<Config>;
    setConfig: (_config: Config) => void;
};
export declare const validateConfig: (config: Config) => void;
export declare const createConfig: (config: Config) => Required<Config>;
export declare const mapToRequest: (_unknown: string | Request) => Request;
export { Config } from './types/Config';
