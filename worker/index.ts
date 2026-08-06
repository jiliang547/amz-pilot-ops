/** Cloudflare Worker entry point for AMZ Pilot. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runDueTasks } from "../lib/scheduler";
import { Container } from "@cloudflare/containers";
export { AdsAgentState } from "./ads-agent-state";
export { EnhancedAdsWorkflow } from "./enhanced-ads-workflow";
class rankTrackerContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
}
export { rankTrackerContainer as RankTrackerContainer };
class enhancedAdsContainer extends Container {
  defaultPort = 9000;
  sleepAfter = "10m";
  requiredPorts = [9000];
}
export { enhancedAdsContainer as EnhancedAdsContainer };
interface Env { ASSETS: Fetcher; DB: D1Database; RANK_CONTAINER: any; IMAGES: { input(stream: ReadableStream): { transform(options: Record<string, unknown>): { output(options: { format: string; quality: number }): Promise<{ response(): Response }> } } } }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void }
const worker={async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{const url=new URL(request.url);if(url.pathname==="/_vinext/image"){const allowed=[...DEFAULT_DEVICE_SIZES,...DEFAULT_IMAGE_SIZES];return handleImageOptimization(request,{fetchAsset:(path)=>env.ASSETS.fetch(new Request(new URL(path,request.url))),transformImage:async(body,{width,format,quality})=>(await env.IMAGES.input(body).transform(width>0?{width}:{}).output({format,quality})).response()},allowed)}return handler.fetch(request,env,ctx)},async scheduled(_controller:ScheduledController,_env:Env,ctx:ExecutionContext){ctx.waitUntil(runDueTasks())}};
export default worker;
