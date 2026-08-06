type WorkerEnv = Record<string, unknown>;
type SqlCursor<T> = { toArray(): T[] };
type SqlStorage = { exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlCursor<T> };
type ObjectState = {
  storage: { sql: SqlStorage };
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
};

function clip(value: unknown, maximum = 120_000): string | null {
  if (value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length > maximum ? `${text.slice(0, maximum)}\n[checkpoint truncated]` : text;
}

export class AdsAgentState {
  constructor(private readonly state: ObjectState, private readonly env: WorkerEnv) {
    void this.env;
    void state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          run_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          account_id TEXT,
          conversation_id TEXT,
          phase TEXT NOT NULL,
          status TEXT NOT NULL,
          input_json TEXT,
          output_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transitions (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL,
          phase TEXT NOT NULL,
          payload_json TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS transitions_run_idx ON transitions(run_id, seq);
      `);
    });
  }

  async begin(input: Record<string, unknown>): Promise<void> {
    const runId = String(input.runId ?? "");
    if (!runId) throw new Error("runId is required");
    const now = Date.now();
    this.state.storage.sql.exec(
      `INSERT INTO runs(run_id,user_id,account_id,conversation_id,phase,status,input_json,created_at,updated_at)
       VALUES(?,?,?,?,?,'running',?,?,?)
       ON CONFLICT(run_id) DO UPDATE SET phase=excluded.phase,status='running',input_json=excluded.input_json,updated_at=excluded.updated_at`,
      runId,
      String(input.userId ?? ""),
      input.accountId == null ? null : String(input.accountId),
      input.conversationId == null ? null : String(input.conversationId),
      "received",
      clip(input),
      now,
      now,
    );
    this.state.storage.sql.exec(`INSERT INTO transitions(run_id,phase,payload_json,created_at) VALUES(?,?,?,?)`, runId, "received", clip(input), now);
  }

  async transition(runId: string, phase: string, payload?: unknown): Promise<void> {
    const now = Date.now();
    this.state.storage.sql.exec(`UPDATE runs SET phase=?,updated_at=? WHERE run_id=?`, phase, now, runId);
    this.state.storage.sql.exec(`INSERT INTO transitions(run_id,phase,payload_json,created_at) VALUES(?,?,?,?)`, runId, phase, clip(payload), now);
  }

  async finish(runId: string, status: string, payload?: unknown): Promise<void> {
    const now = Date.now();
    const phase = status === "failure" ? "failed" : "completed";
    this.state.storage.sql.exec(`UPDATE runs SET phase=?,status=?,output_json=?,updated_at=? WHERE run_id=?`, phase, status, clip(payload), now, runId);
    this.state.storage.sql.exec(`INSERT INTO transitions(run_id,phase,payload_json,created_at) VALUES(?,?,?,?)`, runId, phase, clip(payload), now);
  }

  async getRun(runId: string): Promise<Record<string, unknown> | null> {
    return this.state.storage.sql.exec<Record<string, unknown>>(`SELECT * FROM runs WHERE run_id=?`, runId).toArray()[0] ?? null;
  }
}
