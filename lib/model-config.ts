import { decryptJson } from "./crypto";
import { appEnv, d1, ensureSchema } from "./db";

export type ModelConfig = {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  userAgent: string;
  source: "personal" | "system";
};

type StoredSecret = { apiKey: string };

function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("模型接口地址必须使用 HTTPS");
  return url.toString().replace(/\/$/, "");
}

export async function modelConfigForUser(userId: string): Promise<ModelConfig> {
  await ensureSchema();
  const row = await d1().prepare(
    `SELECT base_url,model_name,user_agent,encrypted_api_key FROM model_settings WHERE user_id=?`,
  ).bind(userId).first<{
    base_url: string;
    model_name: string;
    user_agent: string | null;
    encrypted_api_key: string;
  }>();

  if (row) {
    const secret = await decryptJson<StoredSecret>(row.encrypted_api_key);
    return {
      baseUrl: normalizeBaseUrl(row.base_url),
      apiKey: secret.apiKey,
      modelName: row.model_name,
      userAgent: row.user_agent || "AMZ-Pilot/1.0",
      source: "personal",
    };
  }

  const runtime = appEnv();
  if (!runtime.MODEL_BASE_URL || !runtime.MODEL_API_KEY) throw new Error("请先在“模型配置”中填写模型接口和 API Key");
  return {
    baseUrl: normalizeBaseUrl(runtime.MODEL_BASE_URL),
    apiKey: runtime.MODEL_API_KEY,
    modelName: runtime.MODEL_NAME || "gpt-5.6-luna",
    userAgent: runtime.MODEL_USER_AGENT || "AMZ-Pilot/1.0",
    source: "system",
  };
}

export function modelEndpoint(config: ModelConfig): string {
  return `${config.baseUrl}/chat/completions`;
}

export function modelHeaders(config: ModelConfig): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${config.apiKey}`,
    "user-agent": config.userAgent,
  };
}

export async function testModelConfig(config: Omit<ModelConfig, "source">): Promise<void> {
  const tested = { ...config, source: "personal" as const };
  const response = await fetch(modelEndpoint(tested), {
    method: "POST",
    headers: modelHeaders(tested),
    body: JSON.stringify({
      model: config.modelName,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 4,
      stream: false,
      temperature: 0,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 220);
    throw new Error(`模型连接测试失败 (${response.status})${detail ? `：${detail}` : ""}`);
  }
}