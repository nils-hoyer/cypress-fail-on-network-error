export interface RequestSession {
    requestId: string;
    method: string;
    url: string;
    status?: number;
}
