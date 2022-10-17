export interface Request {
    url?: Url;
    method?: Method
    status?: number | Range;
}

export type Url = string | RegExp;
export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type Range = {
    from: number;
    to: number;
}
