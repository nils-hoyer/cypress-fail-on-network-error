export interface Request {
    url?: Url;
    method?: Method;
    status?: number | Range;
}
export declare type Url = string | RegExp;
export declare type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export declare type Range = {
    from: number;
    to: number;
};
