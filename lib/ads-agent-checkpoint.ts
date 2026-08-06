import { appEnv } from "./db";
import type { AdsGraphPhase } from "./ads-agent-v2";

type CheckpointStub = {
  begin(input: Record<string, unknown>): Promise<void>;
  transition(runId: string, phase: AdsGraphPhase, payload?: unknown): Promise<void>;
  finish(runId: string, status: string, payload?: unknown): Promise<void>;
};

export function adsV2Checkpoint(instanceKey: string, runId: string) {
  const namespace = appEnv().ADS_AGENT_STATE;
  const stub = namespace?.getByName(instanceKey) as unknown as CheckpointStub | undefined;
  const safe = async (action: () => Promise<void>) => { try { await action(); } catch { /* Checkpointing must not break business execution. */ } };
  return {
    begin: (input: Record<string, unknown>) => stub ? safe(() => stub.begin({ ...input, runId })) : Promise.resolve(),
    transition: (phase: AdsGraphPhase, payload?: unknown) => stub ? safe(() => stub.transition(runId, phase, payload)) : Promise.resolve(),
    finish: (status: string, payload?: unknown) => stub ? safe(() => stub.finish(runId, status, payload)) : Promise.resolve(),
  };
}
