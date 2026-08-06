import { d1, ensureSchema } from "./db";

export type AgentKind = "ads" | "store" | "enhanced-ads";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;

function clip(value: unknown, max = 60_000) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}\n[log truncated]` : text;
}

export async function startAgentLog(userId: string, agent: AgentKind, prompt: unknown, accountId?: string) {
  const runId = crypto.randomUUID();
  try {
    await ensureSchema();
    await d1().prepare(`DELETE FROM agent_logs WHERE created_at < ?`).bind(Date.now() - RETENTION_MS).run();
    await d1().prepare(`INSERT INTO agent_logs(id,user_id,account_id,agent,run_id,event_type,round,tool_name,input_json,output_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, accountId ?? null, agent, runId, "run.start", 0, null, clip(prompt, 30_000), null, "running", Date.now()).run();
  } catch { /* Logging must never break the agent. */ }
  return runId;
}

export async function writeAgentLog(input: {
  userId: string;
  agent: AgentKind;
  runId: string;
  event: string;
  round?: number;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  status?: string;
  accountId?: string;
}) {
  try {
    await d1().prepare(`INSERT INTO agent_logs(id,user_id,account_id,agent,run_id,event_type,round,tool_name,input_json,output_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), input.userId, input.accountId ?? null, input.agent, input.runId, input.event, input.round ?? null, input.toolName ?? null, input.input === undefined ? null : clip(input.input), input.output === undefined ? null : clip(input.output), input.status ?? "info", Date.now()).run();
  } catch { /* Logging must never break the agent. */ }
}

export async function finishAgentLog(userId: string, agent: AgentKind, runId: string, status: string, output?: unknown, accountId?: string) {
  await writeAgentLog({ userId, agent, runId, event: "run.finish", status, output, accountId });
}

export async function purgeExpiredAgentLogs() {
  try {
    const now = Date.now();
    const state = await d1().prepare(`SELECT value FROM maintenance_state WHERE key=?`).bind("agent_logs_cleanup").first<{ value: number }>();
    if (state && now - Number(state.value) < CLEANUP_INTERVAL_MS) return;
    await d1().batch([
      d1().prepare(`DELETE FROM agent_logs WHERE created_at < ?`).bind(now - RETENTION_MS),
      d1().prepare(`INSERT INTO maintenance_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind("agent_logs_cleanup", now),
    ]);
  } catch { /* Cleanup is best effort. */ }
}
