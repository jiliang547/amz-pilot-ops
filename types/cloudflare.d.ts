declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
  export type WorkflowEvent<T = unknown> = {
    payload: Readonly<T>;
    timestamp: Date;
    instanceId: string;
    workflowName: string;
  };
  export type WorkflowStep = {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    waitForEvent<T = unknown>(name: string, options: { type: string; timeout?: string }): Promise<{ type: string; payload: T; timestamp: Date }>;
    sleep(name: string, duration: string): Promise<void>;
  };
  export abstract class WorkflowEntrypoint<Env = Record<string, unknown>, Params = unknown> {
    protected env: Env;
    abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
}
interface D1Result<T=unknown>{results?:T[];success:boolean;meta:{changes?:number;[key:string]:unknown};}
interface D1PreparedStatement{bind(...values:unknown[]):D1PreparedStatement;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<{results:T[];success:boolean;meta:Record<string,unknown>}>;run<T=Record<string,unknown>>():Promise<D1Result<T>>;}
interface D1Database{prepare(query:string):D1PreparedStatement;batch<T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>;}
interface Fetcher{fetch(input:Request|string,init?:RequestInit):Promise<Response>;}
interface ScheduledController{cron:string;scheduledTime:number;noRetry():void;}
interface R2ObjectBody{arrayBuffer():Promise<ArrayBuffer>;text():Promise<string>;}
interface R2Bucket{put(key:string,value:ArrayBuffer|ArrayBufferView|Blob|string,options?:{httpMetadata?:{contentType?:string};customMetadata?:Record<string,string>}):Promise<unknown>;get(key:string):Promise<R2ObjectBody|null>;delete(key:string):Promise<void>;}
