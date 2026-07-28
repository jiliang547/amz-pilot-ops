import { env } from "cloudflare:workers";

export type AppEnv = {
  DB: D1Database;
  FILES?: R2Bucket;
  CREDENTIAL_ENCRYPTION_KEY?: string;
  MODEL_BASE_URL?: string; MODEL_API_KEY?: string; MODEL_NAME?: string; MODEL_USER_AGENT?: string;
  AMAZON_MCP_URL?: string; BOOTSTRAP_AMAZON_CREDENTIALS?: string; CRON_SECRET?: string; AUTH_PEPPER?: string;
};
export function appEnv(): AppEnv { return env as unknown as AppEnv; }
export function d1(): D1Database { const db = appEnv().DB; if (!db) throw new Error("数据库尚未配置"); return db; }

let ready: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const db = d1();
    const sql = [
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'operator', must_change_password INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS invites (code_hash TEXT PRIMARY KEY, created_by TEXT NOT NULL, max_uses INTEGER NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, revoked_at INTEGER, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, region TEXT NOT NULL, profile_id TEXT NOT NULL, advertiser_account_id TEXT, encrypted_credentials TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_profile_idx ON accounts(user_id, profile_id)`,
      `CREATE TABLE IF NOT EXISTS model_settings (user_id TEXT PRIMARY KEY, base_url TEXT NOT NULL, model_name TEXT NOT NULL, user_agent TEXT, encrypted_api_key TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT, message_id TEXT, object_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, tool_name TEXT NOT NULL, tool_args TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL, executed_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, name TEXT NOT NULL, prompt TEXT NOT NULL, schedule_type TEXT NOT NULL, scheduled_time TEXT NOT NULL, timezone TEXT NOT NULL, day_of_week INTEGER, require_approval INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, next_run_at INTEGER NOT NULL, last_run_at INTEGER, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS task_runs (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, status TEXT NOT NULL, detail TEXT, started_at INTEGER NOT NULL, finished_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, outcome TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY, username TEXT NOT NULL, ip_hash TEXT NOT NULL, success INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`, `CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks(status,next_run_at)`, `CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_logs(user_id,created_at)`, `CREATE INDEX IF NOT EXISTS attachments_user_idx ON attachments(user_id,created_at)`,
    ];
    await db.batch(sql.map(s => db.prepare(s)));
    const now = Date.now();
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO users (id,username,password_hash,password_salt,role,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind("usr_jiliang","jiliang","2klPVh/8uuDr23re4HOhiM1jBuiJdHzeOBSgcdGkp6k=","/zah47YICLqONKFqNKVEwA==","admin",1,now,now),
      db.prepare(`INSERT OR IGNORE INTO users (id,username,password_hash,password_salt,role,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind("usr_cyl","cyl","oTFrCQLrcO72g0r9SINsBLBXujQ6XM8Z7ws7vV2TFZ0=","ihEMjk45NQRTH/EAJpjvHw==","operator",1,now,now),
      db.prepare(`UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE username='jiliang' AND must_change_password=1`).bind("2klPVh/8uuDr23re4HOhiM1jBuiJdHzeOBSgcdGkp6k=","/zah47YICLqONKFqNKVEwA==",now),
      db.prepare(`UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE username='cyl' AND must_change_password=1`).bind("oTFrCQLrcO72g0r9SINsBLBXujQ6XM8Z7ws7vV2TFZ0=","ihEMjk45NQRTH/EAJpjvHw==",now),
    ]);
  })().catch(e => { ready = null; throw e; });
  return ready;
}