import { env } from "cloudflare:workers";

export type AppEnv = {
  DB: D1Database;
  FILES?: R2Bucket;
  CREDENTIAL_ENCRYPTION_KEY?: string;
  MODEL_BASE_URL?: string;
  MODEL_API_KEY?: string;
  MODEL_NAME?: string;
  MODEL_USER_AGENT?: string;
  AMAZON_MCP_URL?: string;
  RANK_TRACKER_URL?: string;
  BOOTSTRAP_AMAZON_CREDENTIALS?: string;
  CRON_SECRET?: string;
  INITIALIZE_SECRET?: string;
  AUTH_PEPPER?: string;
};
export function appEnv(): AppEnv {
  return env as unknown as AppEnv;
}
export function d1(): D1Database {
  const db = appEnv().DB;
  if (!db) throw new Error("数据库尚未配置");
  return db;
}

let ready: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const db = d1();
    const sql = [
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'operator', must_change_password INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS invites (code_hash TEXT PRIMARY KEY, created_by TEXT NOT NULL, max_uses INTEGER NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, revoked_at INTEGER, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, region TEXT NOT NULL, marketplace TEXT, timezone TEXT, currency TEXT, profile_id TEXT NOT NULL, advertiser_account_id TEXT, encrypted_credentials TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_profile_idx ON accounts(user_id, profile_id)`,
      `CREATE TABLE IF NOT EXISTS model_settings (user_id TEXT PRIMARY KEY, base_url TEXT NOT NULL, model_name TEXT NOT NULL, user_agent TEXT, encrypted_api_key TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS site_models (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, base_url TEXT NOT NULL, model_name TEXT NOT NULL, user_agent TEXT, encrypted_api_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(created_by) REFERENCES users(id))`,
      `CREATE TABLE IF NOT EXISTS user_model_selections (user_id TEXT PRIMARY KEY, source TEXT NOT NULL, preset_model_id TEXT, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(preset_model_id) REFERENCES site_models(id) ON DELETE SET NULL)`,
      `CREATE TABLE IF NOT EXISTS review_api_settings (id INTEGER PRIMARY KEY CHECK(id=1), encrypted_api_key TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(updated_by) REFERENCES users(id))`,
      `CREATE TABLE IF NOT EXISTS review_tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, asin TEXT NOT NULL, marketplace TEXT NOT NULL, pages INTEGER NOT NULL, star_mode TEXT NOT NULL, stars_json TEXT NOT NULL, sort_by TEXT NOT NULL, reviewer_type TEXT NOT NULL, media_type TEXT NOT NULL, variant TEXT NOT NULL, status TEXT NOT NULL, upstream_tasks_json TEXT NOT NULL, review_count INTEGER NOT NULL DEFAULT 0, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS review_items (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, review_id TEXT NOT NULL, asin TEXT NOT NULL, marketplace TEXT NOT NULL, user_name TEXT, rating INTEGER NOT NULL, title TEXT, review_date TEXT, review_content TEXT, verified_purchase INTEGER NOT NULL DEFAULT 0, helpful_votes INTEGER NOT NULL DEFAULT 0, product_variant TEXT, images_json TEXT NOT NULL DEFAULT '[]', page INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, FOREIGN KEY(task_id) REFERENCES review_tasks(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS review_analyses (id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, status TEXT NOT NULL, model_name TEXT, review_count INTEGER NOT NULL DEFAULT 0, result_json TEXT, raw_response TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER, FOREIGN KEY(task_id) REFERENCES review_tasks(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS model_token_usage (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, model_name TEXT NOT NULL, model_source TEXT NOT NULL, operation TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, provider_reported INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS image_model_settings (user_id TEXT PRIMARY KEY, base_url TEXT NOT NULL, model_name TEXT NOT NULL, encrypted_api_key TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT, message_id TEXT, object_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS custom_skills (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, instructions TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS report_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, report_id TEXT, create_tool TEXT NOT NULL, request_fingerprint TEXT NOT NULL, request_args TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS report_files (id TEXT PRIMARY KEY, report_job_id TEXT NOT NULL, part_number INTEGER NOT NULL, object_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, row_count INTEGER NOT NULL, summary_json TEXT NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(report_job_id) REFERENCES report_jobs(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS report_snapshots (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, report_type TEXT NOT NULL, window_key TEXT NOT NULL, snapshot_date TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, report_id TEXT, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, metrics_json TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS ad_daily_facts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, report_date TEXT NOT NULL, campaign_id TEXT NOT NULL, campaign_name TEXT, ad_group_id TEXT NOT NULL, ad_group_name TEXT, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, purchases REAL NOT NULL DEFAULT 0, sales REAL NOT NULL DEFAULT 0, attribution_final INTEGER NOT NULL DEFAULT 0, source_report_id TEXT NOT NULL, sync_id TEXT NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS ad_data_syncs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, sync_date TEXT NOT NULL, mode TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, report_id TEXT, status TEXT NOT NULL, rows_upserted INTEGER NOT NULL DEFAULT 0, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS ad_keyword_daily_facts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, report_date TEXT NOT NULL, campaign_id TEXT NOT NULL, campaign_name TEXT, ad_group_id TEXT NOT NULL, ad_group_name TEXT, keyword_id TEXT NOT NULL, keyword TEXT NOT NULL, keyword_type TEXT, match_type TEXT, keyword_bid REAL, keyword_status TEXT, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, purchases REAL NOT NULL DEFAULT 0, sales REAL NOT NULL DEFAULT 0, attribution_final INTEGER NOT NULL DEFAULT 0, source_report_id TEXT NOT NULL, sync_id TEXT NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS ad_search_term_daily_facts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, report_date TEXT NOT NULL, campaign_id TEXT NOT NULL, campaign_name TEXT, ad_group_id TEXT NOT NULL, ad_group_name TEXT, keyword_id TEXT NOT NULL, keyword TEXT, keyword_type TEXT, match_type TEXT, targeting TEXT, search_term TEXT NOT NULL, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, purchases REAL NOT NULL DEFAULT 0, sales REAL NOT NULL DEFAULT 0, attribution_final INTEGER NOT NULL DEFAULT 0, source_report_id TEXT NOT NULL, sync_id TEXT NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS ad_report_syncs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, sync_date TEXT NOT NULL, report_kind TEXT NOT NULL, mode TEXT NOT NULL, trigger_type TEXT NOT NULL DEFAULT 'automatic', start_date TEXT NOT NULL, end_date TEXT NOT NULL, report_id TEXT, status TEXT NOT NULL, rows_upserted INTEGER NOT NULL DEFAULT 0, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS ad_anomaly_analyses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, analysis_date TEXT NOT NULL, report_kind TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, model_name TEXT NOT NULL, status TEXT NOT NULL, prompt TEXT NOT NULL, summary TEXT, anomalies_json TEXT, raw_response TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, tool_name TEXT NOT NULL, tool_args TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL, executed_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, name TEXT NOT NULL, prompt TEXT NOT NULL, schedule_type TEXT NOT NULL, scheduled_time TEXT NOT NULL, timezone TEXT NOT NULL, day_of_week INTEGER, require_approval INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, next_run_at INTEGER NOT NULL, last_run_at INTEGER, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS task_runs (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, status TEXT NOT NULL, detail TEXT, started_at INTEGER NOT NULL, finished_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, outcome TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY, username TEXT NOT NULL, ip_hash TEXT NOT NULL, success INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS rank_tracker_settings (user_id TEXT PRIMARY KEY, encrypted_proxies TEXT NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS sp_api_settings (user_id TEXT PRIMARY KEY, encrypted_credentials TEXT NOT NULL, region TEXT NOT NULL, marketplace_id TEXT NOT NULL, marketplace_name TEXT NOT NULL, country_code TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS rank_history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, asin TEXT NOT NULL, keyword TEXT NOT NULL, status TEXT NOT NULL, rank INTEGER, page INTEGER, position INTEGER, variant_asin TEXT, variant_asins_json TEXT, sponsored_count INTEGER, total_results INTEGER, proxy_host TEXT, actual_ip TEXT, error TEXT, scraped_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
      `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS site_models_enabled_idx ON site_models(enabled,updated_at)`,
      `CREATE INDEX IF NOT EXISTS review_tasks_user_time_idx ON review_tasks(user_id,created_at)`,
      `CREATE INDEX IF NOT EXISTS review_tasks_status_idx ON review_tasks(user_id,status,updated_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS review_items_task_review_idx ON review_items(task_id,review_id)`,
      `CREATE INDEX IF NOT EXISTS review_items_task_rating_idx ON review_items(task_id,rating,review_date)`,
      `CREATE INDEX IF NOT EXISTS review_analyses_user_time_idx ON review_analyses(user_id,updated_at)`,
      `CREATE INDEX IF NOT EXISTS model_token_usage_user_time_idx ON model_token_usage(user_id,created_at)`,
      `CREATE INDEX IF NOT EXISTS rank_history_user_idx ON rank_history(user_id,scraped_at)`,
      `CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks(status,next_run_at)`,
      `CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_logs(user_id,created_at)`,
      `CREATE INDEX IF NOT EXISTS attachments_user_idx ON attachments(user_id,created_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS custom_skills_user_name_idx ON custom_skills(user_id,name)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS report_jobs_request_idx ON report_jobs(user_id,account_id,request_fingerprint)`,
      `CREATE INDEX IF NOT EXISTS report_jobs_history_idx ON report_jobs(user_id,created_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS report_files_job_part_idx ON report_files(report_job_id,part_number)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS report_snapshots_window_idx ON report_snapshots(account_id,report_type,window_key,snapshot_date)`,
      `CREATE INDEX IF NOT EXISTS report_snapshots_lookup_idx ON report_snapshots(user_id,account_id,status,snapshot_date)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ad_daily_facts_key_idx ON ad_daily_facts(account_id,report_date,campaign_id,ad_group_id)`,
      `CREATE INDEX IF NOT EXISTS ad_daily_facts_range_idx ON ad_daily_facts(user_id,account_id,report_date)`,
      `CREATE INDEX IF NOT EXISTS ad_daily_facts_sync_idx ON ad_daily_facts(account_id,sync_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ad_data_syncs_account_date_idx ON ad_data_syncs(account_id,sync_date)`,
      `CREATE INDEX IF NOT EXISTS ad_data_syncs_status_idx ON ad_data_syncs(user_id,account_id,status,updated_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ad_keyword_daily_facts_key_idx ON ad_keyword_daily_facts(account_id,report_date,campaign_id,ad_group_id,keyword_id)`,
      `CREATE INDEX IF NOT EXISTS ad_keyword_daily_facts_range_idx ON ad_keyword_daily_facts(user_id,account_id,report_date)`,
      `CREATE INDEX IF NOT EXISTS ad_keyword_daily_facts_sync_idx ON ad_keyword_daily_facts(account_id,sync_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ad_search_term_daily_facts_key_idx ON ad_search_term_daily_facts(account_id,report_date,campaign_id,ad_group_id,keyword_id,search_term)`,
      `CREATE INDEX IF NOT EXISTS ad_search_term_daily_facts_range_idx ON ad_search_term_daily_facts(user_id,account_id,report_date)`,
      `CREATE INDEX IF NOT EXISTS ad_search_term_daily_facts_sync_idx ON ad_search_term_daily_facts(account_id,sync_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ad_report_syncs_account_date_kind_idx ON ad_report_syncs(account_id,sync_date,report_kind)`,
      `CREATE INDEX IF NOT EXISTS ad_report_syncs_status_idx ON ad_report_syncs(user_id,account_id,status,updated_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ad_anomaly_analyses_account_date_kind_idx ON ad_anomaly_analyses(account_id,analysis_date,report_kind)`,
      `CREATE INDEX IF NOT EXISTS ad_anomaly_analyses_history_idx ON ad_anomaly_analyses(user_id,account_id,analysis_date)`,
    ];
    await db.batch(sql.map((s) => db.prepare(s)));
    const reviewTaskColumns = await db
      .prepare(`PRAGMA table_info(review_tasks)`)
      .all<{ name: string }>();
    const existingReviewTaskColumns = new Set(
      reviewTaskColumns.results.map((column) => column.name),
    );
    // A previous deployment used a compact review_tasks shape. Keep its empty
    // history compatible by adding the newer query fields in place.
    for (const statement of [
      [`pages`, `ALTER TABLE review_tasks ADD COLUMN pages INTEGER NOT NULL DEFAULT 1`],
      [`star_mode`, `ALTER TABLE review_tasks ADD COLUMN star_mode TEXT NOT NULL DEFAULT 'all_stars'`],
      [`stars_json`, `ALTER TABLE review_tasks ADD COLUMN stars_json TEXT NOT NULL DEFAULT '["one_star","two_star","three_star","four_star","five_star"]'`],
      [`sort_by`, `ALTER TABLE review_tasks ADD COLUMN sort_by TEXT NOT NULL DEFAULT 'recent'`],
      [`reviewer_type`, `ALTER TABLE review_tasks ADD COLUMN reviewer_type TEXT NOT NULL DEFAULT 'all_reviews'`],
      [`media_type`, `ALTER TABLE review_tasks ADD COLUMN media_type TEXT NOT NULL DEFAULT 'all_contents'`],
      [`variant`, `ALTER TABLE review_tasks ADD COLUMN variant TEXT NOT NULL DEFAULT 'all_formats'`],
      [`upstream_tasks_json`, `ALTER TABLE review_tasks ADD COLUMN upstream_tasks_json TEXT NOT NULL DEFAULT '[]'`],
      [`review_count`, `ALTER TABLE review_tasks ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0`],
      [`completed_at`, `ALTER TABLE review_tasks ADD COLUMN completed_at INTEGER`],
    ] as const) {
      if (!existingReviewTaskColumns.has(statement[0])) {
        await db.prepare(statement[1]).run();
      }
    }
    for (const statement of [
      `ALTER TABLE accounts ADD COLUMN marketplace TEXT`,
      `ALTER TABLE accounts ADD COLUMN timezone TEXT`,
      `ALTER TABLE accounts ADD COLUMN currency TEXT`,
      `ALTER TABLE rank_history ADD COLUMN variant_asins_json TEXT`,
      `ALTER TABLE rank_history ADD COLUMN actual_ip TEXT`,
    ]) {
      try {
        await db.prepare(statement).run();
      } catch {
        /* Existing column. */
      }
    }
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO users (id,username,password_hash,password_salt,role,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        )
        .bind(
          "usr_jiliang",
          "jiliang",
          "2klPVh/8uuDr23re4HOhiM1jBuiJdHzeOBSgcdGkp6k=",
          "/zah47YICLqONKFqNKVEwA==",
          "admin",
          1,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO users (id,username,password_hash,password_salt,role,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        )
        .bind(
          "usr_cyl",
          "cyl",
          "oTFrCQLrcO72g0r9SINsBLBXujQ6XM8Z7ws7vV2TFZ0=",
          "ihEMjk45NQRTH/EAJpjvHw==",
          "operator",
          1,
          now,
          now,
        ),
      db
        .prepare(
          `UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE username='jiliang' AND must_change_password=1`,
        )
        .bind(
          "2klPVh/8uuDr23re4HOhiM1jBuiJdHzeOBSgcdGkp6k=",
          "/zah47YICLqONKFqNKVEwA==",
          now,
        ),
      db
        .prepare(
          `UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE username='cyl' AND must_change_password=1`,
        )
        .bind(
          "oTFrCQLrcO72g0r9SINsBLBXujQ6XM8Z7ws7vV2TFZ0=",
          "ihEMjk45NQRTH/EAJpjvHw==",
          now,
        ),
    ]);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
