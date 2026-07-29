import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  name: "amz-pilot-ops",
  main: "./worker/index.ts",
  compatibility_date: "2026-07-28",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    AMAZON_MCP_URL: "https://advertising-ai.amazon.com/mcp",
    MODEL_BASE_URL: "https://hjlyy.cc/v1",
    MODEL_NAME: "gpt-5.6-luna",
    MODEL_USER_AGENT: "Mozilla/5.0",
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: "amz-pilot-ops-db",
      database_id: "e3ea5f58-883d-4d7d-a74a-a870f1dbb22d",
    },
  ],
  triggers: { crons: ["*/5 * * * *"] },
  r2_buckets: [
    {
      binding: "FILES",
      bucket_name: "amz-pilot-ops-files",
    },
  ],
  images: { binding: "IMAGES" },
  observability: {
    enabled: true,
    head_sampling_rate: 1,
  },
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
