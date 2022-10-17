export interface Request {
    url?: string | RegExp;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    status?: number;
}
