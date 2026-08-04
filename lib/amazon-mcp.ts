import { appEnv } from "./db";
export type AmazonCredentials={clientId:string;clientSecret:string;refreshToken:string;profileId:string;region:string;advertiserAccountId?:string};
export type McpTool={name:string;description?:string;inputSchema:Record<string,unknown>};
type Rpc={jsonrpc:string;id?:number;result?:unknown;error?:{code:number;message:string;data?:unknown}};
const MCP_PROTOCOL="2025-06-18";
export class AmazonMcpClient{
  private accessToken:string|null=null;private sessionId:string|null=null;private id=1;
  constructor(private credentials:AmazonCredentials,private mode:"FIXED"|"DYNAMIC"="DYNAMIC"){}
  private async token(){if(this.accessToken)return this.accessToken;const form=new URLSearchParams({grant_type:"refresh_token",refresh_token:this.credentials.refreshToken,client_id:this.credentials.clientId,client_secret:this.credentials.clientSecret});const response=await fetch("https://api.amazon.com/auth/o2/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form});if(!response.ok)throw new Error(`Amazon 授权刷新失败 (${response.status})`);const data=await response.json() as {access_token?:string};if(!data.access_token)throw new Error("Amazon 未返回 access token");this.accessToken=data.access_token;return data.access_token;}
  private async headers(){const h:Record<string,string>={Authorization:`Bearer ${await this.token()}`,"Amazon-Ads-ClientId":this.credentials.clientId,"Amazon-Ads-AI-Account-Selection-Mode":this.mode,Accept:"application/json, text/event-stream","Content-Type":"application/json"};if(this.mode==="FIXED")h["Amazon-Advertising-API-Scope"]=this.credentials.profileId;if(this.sessionId)h["Mcp-Session-Id"]=this.sessionId;return h;}
  private async post(message:unknown):Promise<Rpc[]>{
    const url=appEnv().AMAZON_MCP_URL??"https://advertising-ai.amazon.com/mcp";
    let last:unknown;
    for(let attempt=0;attempt<5;attempt++){
      try{
        const response=await fetch(url,{method:"POST",headers:await this.headers(),body:JSON.stringify(message)});
        const sid=response.headers.get("Mcp-Session-Id");if(sid)this.sessionId=sid;
        const text=await response.text();
        if(!response.ok)throw new Error(`Amazon MCP 请求失败 (${response.status}): ${text.slice(0,240)}`);
        if(!text.trim())return[];
        const contentType=response.headers.get("content-type")??"";
        if(contentType.includes("text/event-stream")||text.trimStart().startsWith("data:"))return text.split(/\r?\n/).filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trim()).filter(v=>v&&v!=="[DONE]").map(v=>JSON.parse(v) as Rpc);
        return[JSON.parse(text) as Rpc];
      }catch(error){
        last=error;
        const messageText=error instanceof Error?error.message:"";
        const retryable=/network|fetch|timeout|reset|temporarily unavailable|\b5\d\d\b/i.test(messageText);
        if(!retryable||attempt===4)throw error;
        this.sessionId=null;
        await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));
      }
    }
    throw last instanceof Error?last:new Error("Amazon MCP 请求失败");
  }
  private async initialize(){if(this.sessionId)return;const id=this.id++;const rows=await this.post({jsonrpc:"2.0",id,method:"initialize",params:{protocolVersion:MCP_PROTOCOL,capabilities:{},clientInfo:{name:"amz-pilot",version:"1.0.0"}}});const reply=rows.find(r=>r.id===id);if(reply?.error)throw new Error(reply.error.message);await this.post({jsonrpc:"2.0",method:"notifications/initialized",params:{}});}
  async listTools():Promise<McpTool[]>{await this.initialize();const id=this.id++;const rows=await this.post({jsonrpc:"2.0",id,method:"tools/list",params:{}});const reply=rows.find(r=>r.id===id);if(reply?.error)throw new Error(reply.error.message);const result=reply?.result as {tools?:McpTool[]}|undefined;return result?.tools??[];}
  async callTool(name:string,args:Record<string,unknown>):Promise<unknown>{this.mode=this.modeFor(name);await this.initialize();const id=this.id++;const prepared=this.withAccountContext(name,args);const rows=await this.post({jsonrpc:"2.0",id,method:"tools/call",params:{name,arguments:prepared}});const reply=rows.find(r=>r.id===id);if(reply?.error)throw new Error(reply.error.message);return reply?.result;}
  private modeFor(name:string):"FIXED"|"DYNAMIC"{return modeForTool(name);} private withAccountContext(name:string,args:Record<string,unknown>){const dynamic=this.modeFor(name)==="DYNAMIC";const body={...((args.body as Record<string,unknown>)??{})};if(dynamic){if(!name.startsWith("reporting-")&&!body.accessRequestedAccount)body.accessRequestedAccount={profileId:this.credentials.profileId};}else{delete body.accessRequestedAccount;delete body.accessRequestedAccounts;}if(name==="reporting-create_report"||name==="reporting-create_campaign_report"){delete body.accessRequestedAccount;if(!body.accessRequestedAccounts&&this.credentials.advertiserAccountId)body.accessRequestedAccounts=[{advertiserAccountId:this.credentials.advertiserAccountId}];}if(name==="reporting-retrieve_report"){delete body.accessRequestedAccounts;delete body.accessRequestedAccount;}if(name==="reporting-create_report"&&Array.isArray(body.reports)){body.reports=body.reports.map((report)=>{if(!report||typeof report!=="object")return report;const copy={...(report as Record<string,unknown>)};const query={...((copy.query as Record<string,unknown>)??{})};const fields=Array.isArray(query.fields)?query.fields.filter((field):field is string=>typeof field==="string"):[];if(fields.some(field=>field==="metric.totalCost"||field==="metric.sales")&&!fields.includes("budgetCurrency.value"))fields.unshift("budgetCurrency.value");const timeFields=new Set(["date.value","dateRange.value","week.value","month.value","quarter.value"]);const cleaned=fields.filter(field=>!timeFields.has(field));cleaned.unshift("date.value");query.fields=[...new Set(cleaned)];copy.query=query;return copy;});}return{...args,body};}
}
export function modeForTool(name:string):"FIXED"|"DYNAMIC"{return name.includes("query_")||name.includes("delete_target")||name.startsWith("reporting-")?"DYNAMIC":"FIXED";}
export function isWriteTool(name:string){return /(?:^|[-_])(create|update|delete|archive|pause|enable)(?:[-_]|$)/i.test(name)&&!name.startsWith("reporting-");}
export const preferredTools=["ads_accounts-list_ads_accounts","campaign_management-query_campaign","campaign_management-query_ad_group","campaign_management-query_ad","campaign_management-query_target","campaign_management-query_portfolio","campaign_management-create_campaign","campaign_management-create_ad_group","campaign_management-create_ad","campaign_management-create_target","campaign_management-update_campaign","campaign_management-update_ad_group","campaign_management-update_ad","campaign_management-update_target","campaign_management-update_target_bid","campaign_management-delete_target","reporting-create_campaign_report","reporting-create_report","reporting-retrieve_report"];
