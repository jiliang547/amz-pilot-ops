import { assertSameOrigin, requireUser } from "@/lib/auth";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { d1, ensureSchema } from "@/lib/db";
import { testModelConfig } from "@/lib/model-config";

async function admin(request: Request) {
  const user = await requireUser(request);
  if (user.role !== "admin")
    throw new Response(JSON.stringify({ error: "无权限" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  return user;
}

export async function GET(request: Request) {
  try {
    await admin(request);
    await ensureSchema();
    const rows = await d1()
      .prepare(
        `SELECT id,display_name displayName,base_url baseUrl,model_name modelName,user_agent userAgent,enabled,created_at createdAt,updated_at updatedAt FROM site_models ORDER BY updated_at DESC`,
      )
      .all();
    return Response.json({
      models: rows.results.map((row) => ({
        ...row,
        enabled: Boolean(row.enabled),
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "读取预设模型失败" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await admin(request);
    await ensureSchema();
    const body = (await request.json()) as {
      displayName?: string;
      baseUrl?: string;
      modelName?: string;
      apiKey?: string;
      userAgent?: string;
    };
    const displayName = body.displayName?.trim() || "",
      baseUrl = body.baseUrl?.trim() || "",
      modelName = body.modelName?.trim() || "",
      apiKey = body.apiKey?.trim() || "";
    const userAgent = body.userAgent?.trim().slice(0, 120) || "AMZ-Pilot/1.0";
    if (!displayName || !baseUrl || !modelName || !apiKey)
      return Response.json(
        { error: "请完整填写预设名称、接口、模型名称和 API Key" },
        { status: 400 },
      );
    if (
      displayName.length > 80 ||
      baseUrl.length > 500 ||
      modelName.length > 160 ||
      apiKey.length > 1000
    )
      return Response.json({ error: "模型配置内容过长" }, { status: 400 });
    await testModelConfig({ baseUrl, modelName, apiKey, userAgent });
    const id = crypto.randomUUID(),
      now = Date.now();
    await d1()
      .prepare(
        `INSERT INTO site_models(id,display_name,base_url,model_name,user_agent,encrypted_api_key,enabled,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?,?)`,
      )
      .bind(
        id,
        displayName,
        baseUrl.replace(/\/$/, ""),
        modelName,
        userAgent,
        await encryptJson({ apiKey }),
        user.id,
        now,
        now,
      )
      .run();
    await d1()
      .prepare(
        `INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        null,
        "site_model.create",
        id,
        `${displayName} · ${modelName}`,
        "success",
        now,
      )
      .run();
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "新增预设模型失败" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await admin(request);
    await ensureSchema();
    const body = (await request.json()) as {
      id?: string;
      displayName?: string;
      baseUrl?: string;
      modelName?: string;
      apiKey?: string;
      userAgent?: string;
      enabled?: boolean;
    };
    if (!body.id)
      return Response.json({ error: "缺少模型 ID" }, { status: 400 });
    const current = await d1()
      .prepare(`SELECT * FROM site_models WHERE id=?`)
      .bind(body.id)
      .first<Record<string, unknown>>();
    if (!current)
      return Response.json({ error: "预设模型不存在" }, { status: 404 });
    const displayName =
        body.displayName?.trim() || String(current.display_name),
      baseUrl = body.baseUrl?.trim() || String(current.base_url),
      modelName = body.modelName?.trim() || String(current.model_name);
    const userAgent =
      body.userAgent?.trim().slice(0, 120) ||
      String(current.user_agent || "AMZ-Pilot/1.0");
    let encryptedKey = String(current.encrypted_api_key);
    if (body.apiKey?.trim()) {
      await testModelConfig({
        baseUrl,
        modelName,
        apiKey: body.apiKey.trim(),
        userAgent,
      });
      encryptedKey = await encryptJson({ apiKey: body.apiKey.trim() });
    } else if (
      body.baseUrl !== undefined ||
      body.modelName !== undefined ||
      body.userAgent !== undefined
    ) {
      const secret = await decryptJson<{ apiKey: string }>(encryptedKey);
      await testModelConfig({
        baseUrl,
        modelName,
        apiKey: secret.apiKey,
        userAgent,
      });
    }
    const enabled =
        body.enabled === undefined
          ? Number(current.enabled)
          : Number(body.enabled),
      now = Date.now();
    await d1()
      .prepare(
        `UPDATE site_models SET display_name=?,base_url=?,model_name=?,user_agent=?,encrypted_api_key=?,enabled=?,updated_at=? WHERE id=?`,
      )
      .bind(
        displayName,
        baseUrl.replace(/\/$/, ""),
        modelName,
        userAgent,
        encryptedKey,
        enabled,
        now,
        body.id,
      )
      .run();
    await d1()
      .prepare(
        `INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        null,
        "site_model.update",
        body.id,
        `${displayName} · enabled=${enabled}`,
        "success",
        now,
      )
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "更新预设模型失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await admin(request);
    await ensureSchema();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "缺少模型 ID" }, { status: 400 });
    const now = Date.now();
    await d1().batch([
      d1()
        .prepare(`DELETE FROM user_model_selections WHERE preset_model_id=?`)
        .bind(id),
      d1().prepare(`DELETE FROM site_models WHERE id=?`).bind(id),
    ]);
    await d1()
      .prepare(
        `INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        null,
        "site_model.delete",
        id,
        "Preset deleted; user selections cleared",
        "success",
        now,
      )
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "删除预设模型失败" },
      { status: 400 },
    );
  }
}
