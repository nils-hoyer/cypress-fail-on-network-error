export interface RequestSession {
    requestId: string,
    method: string
    url: string;
    status?: number;
    // canceled?: boolean;
    // currentTest?: {
    //     title: string,
    //     titlePath: string[],
    //   }
}
