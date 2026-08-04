import { assertSameOrigin, requireUser } from "@/lib/auth";
import { appEnv } from "@/lib/db";
import { advanceListing, newListingState, type ListingInput, type ListingState } from "@/lib/listing-workflow";
import { getRequestExecutionContext } from "vinext/shims/request-context";

function key(userId:string,runId:string){return `listing-runs/${userId}/${runId}/state.json`;}
async function readState(userId:string,runId:string){const object=await appEnv().FILES?.get(key(userId,runId));if(!object)throw new Error("Listing 任务不存在或已过期");return JSON.parse(await object.text()) as ListingState;}
async function saveState(userId:string,runId:string,state:ListingState){const bucket=appEnv().FILES;if(!bucket)throw new Error("Listing 文件存储尚未配置");await bucket.put(key(userId,runId),JSON.stringify(state),{httpMetadata:{contentType:"application/json; charset=utf-8"},customMetadata:{userId,runId,kind:"listing-workflow-state"}});}

// Nodes 3/5/6/7 run concurrently. Serialize state writes so R2 never receives
// competing PUTs for the same object (which otherwise produces error 10058).
const saveQueues=new Map<string,Promise<void>>();
async function saveStateSerial(userId:string,runId:string,state:ListingState){const id=key(userId,runId);const previous=saveQueues.get(id)??Promise.resolve();const current=previous.catch(()=>undefined).then(()=>saveState(userId,runId,state));saveQueues.set(id,current);try{await current;}finally{if(saveQueues.get(id)===current)saveQueues.delete(id);}}

async function readInputs(form:FormData){const names=["keywords","product","reviews","competitors"];const inputs:ListingInput[]=[];for(const name of names){const value=form.get(name);if(!(value instanceof File)||value.size===0)throw new Error(`请上传${name}文件`);if(value.size>20*1024*1024)throw new Error("单个 Listing 文件不能超过 20MB");inputs.push({name:value.name,contentType:value.type,bytes:await value.arrayBuffer()});}return inputs;}

export async function GET(request:Request){try{const user=await requireUser(request);const runId=new URL(request.url).searchParams.get("runId");if(!runId)return Response.json({error:"缺少 runId"},{status:400});return Response.json({runId,state:await readState(user.id,runId)});}catch(error){if(error instanceof Response)return error;return Response.json({error:error instanceof Error?error.message:"读取 Listing 任务失败"},{status:400});}}

export async function POST(request:Request){try{assertSameOrigin(request);const user=await requireUser(request);if(user.mustChangePassword)return Response.json({error:"首次登录必须先修改密码"},{status:428});const form=await request.formData();const action=String(form.get("action")??"start");const bucket=appEnv().FILES;if(!bucket)return Response.json({error:"Listing 文件存储尚未配置"},{status:503});let runId=String(form.get("runId")??"");let state:ListingState;
if(action==="asset"){const file=form.get("file");if(!(file instanceof File)||file.size===0)return Response.json({error:"请选择参考文件"},{status:400});if(file.size>20*1024*1024)return Response.json({error:"参考文件不能超过 20MB"},{status:413});const safe=file.name.replace(/[^\p{L}\p{N}._ -]/gu,"_").slice(0,120)||"reference.txt";await bucket.put(`listing-assets/${user.id}/${crypto.randomUUID()}/${safe}`,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||"application/octet-stream"},customMetadata:{userId:user.id,kind:"listing-reference",filename:safe}});return Response.json({ok:true,filename:safe});}
if(action==="start"){runId=crypto.randomUUID();state=newListingState(await readInputs(form));await saveStateSerial(user.id,runId,state);return Response.json({runId,state});}
if(!runId)return Response.json({error:"缺少 runId"},{status:400});state=await readState(user.id,runId);
if(action!=="run"&&action!=="confirm")return Response.json({error:"不支持的 Listing 操作"},{status:400});
const confirmation=action==="confirm"?String(form.get("confirmation")??""):undefined;
const task=advanceListing(user.id,state,confirmation,async snapshot=>saveStateSerial(user.id,runId,snapshot));
const context=getRequestExecutionContext();
if(context){
  context.waitUntil(task.then(async finalState=>saveStateSerial(user.id,runId,finalState)).catch(async error=>{state.stage="error";state.activeNode=null;state.progressMessage=error instanceof Error?error.message:"Listing 工作流执行失败";state.updatedAt=Date.now();await saveStateSerial(user.id,runId,state);}));
  return Response.json({runId,state},{status:202});
}
state=await task;await saveStateSerial(user.id,runId,state);return Response.json({runId,state});}catch(error){if(error instanceof Response)return error;return Response.json({error:error instanceof Error?error.message:"Listing 工作流执行失败"},{status:400});}}
