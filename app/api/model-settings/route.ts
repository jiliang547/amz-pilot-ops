import { assertSameOrigin, requireUser } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { d1, ensureSchema } from "@/lib/db";
import { modelConfigForUser, testModelConfig } from "@/lib/model-config";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const row = await d1().prepare(
      `SELECT base_url baseUrl,model_name modelName,user_agent userAgent,updated_at updatedAt FROM model_settings WHERE user_id=?`,
    ).bind(user.id).first();
    if (row) return Response.json({ configured: true, source: "personal", settings: row });
    const fallback = await modelConfigForUser(user.id);
    return Response.json({
      configured: false,
      source: fallback.source,
      settings: { baseUrl: fallback.baseUrl, modelName: fallback.modelName, userAgent: fallback.userAgent },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ configured: false, source: "none", settings: null });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (user.mustChangePassword) return Response.json({ error: "首次登录必须先修改密码" }, { status: 428 });
    await ensureSchema();
    const body = await request.json() as { baseUrl?: string; modelName?: string; apiKey?: string; userAgent?: string };
    const baseUrl = body.baseUrl?.trim() || "";
    const modelName = body.modelName?.trim() || "";
    const userAgent = body.userAgent?.trim().slice(0, 120) || "AMZ-Pilot/1.0";
    if (!baseUrl || !modelName) return Response.json({ error: "请填写模型接口地址和模型名称" }, { status: 400 });
    if (baseUrl.length > 500 || modelName.length > 160) return Response.json({ error: "模型配置内容过长" }, { status: 400 });

    const existing = await d1().prepare(`SELECT encrypted_api_key FROM model_settings WHERE user_id=?`).bind(user.id).first<{ encrypted_api_key: string }>();
    let apiKey = body.apiKey?.trim() || "";
    if (!apiKey && existing) apiKey = (await modelConfigForUser(user.id)).apiKey;
    if (!apiKey) return Response.json({ error: "首次配置必须填写 API Key" }, { status: 400 });
    if (apiKey.length > 1000) return Response.json({ error: "API Key 长度异常" }, { status: 400 });

    const config = { baseUrl, modelName, apiKey, userAgent };
    await testModelConfig(config);
    const now = Date.now();
    await d1().prepare(
      `INSERT INTO model_settings(user_id,base_url,model_name,user_agent,encrypted_api_key,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET base_url=excluded.base_url,model_name=excluded.model_name,user_agent=excluded.user_agent,encrypted_api_key=excluded.encrypted_api_key,updated_at=excluded.updated_at`,
    ).bind(user.id, baseUrl.replace(/\/$/, ""), modelName, userAgent, await encryptJson({ apiKey }), now, now).run();
    await d1().prepare(
      `INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), user.id, null, "model.configure", modelName, "Model endpoint tested; API key encrypted", "success", now).run();
    return Response.json({ ok: true, settings: { baseUrl: baseUrl.replace(/\/$/, ""), modelName, userAgent } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "模型配置保存失败" }, { status: 400 });
  }
}