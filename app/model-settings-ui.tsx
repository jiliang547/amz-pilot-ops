"use client";
import { useEffect, useState } from "react";

export type PresetModel = {
  id: string;
  displayName: string;
  baseUrl?: string;
  modelName: string;
  userAgent?: string;
  enabled: boolean;
  updatedAt: number;
};
export type ModelSettingsData = {
  configured: boolean;
  source: "personal" | "preset" | "system" | "none";
  presetId?: string | null;
  settings: {
    baseUrl: string;
    modelName: string;
    userAgent?: string;
    displayName?: string;
  } | null;
  personalSettings?: {
    baseUrl: string;
    modelName: string;
    userAgent?: string;
  } | null;
  presets?: PresetModel[];
};
type CommonProps = {
  onClose: () => void;
  onChanged: () => Promise<void>;
  notify: (title: string, detail: string) => void;
};

export function ModelSelector({ onClose, onChanged, notify }: CommonProps) {
  const [data, setData] = useState<ModelSettingsData | null>(null),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/model-settings");
    const d = await r.json();
    if (r.ok) setData(d);
    else notify("读取失败", d.error || "无法读取模型配置");
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // This modal intentionally loads once when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function selectPreset(id: string) {
    setBusy(true);
    const r = await fetch("/api/model-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "preset", presetId: id }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      notify("切换失败", d.error);
      return;
    }
    await Promise.all([load(), onChanged()]);
    notify("模型已切换", `当前使用 ${d.displayName || d.modelName}`);
  }
  async function selectPersonal() {
    setBusy(true);
    const r = await fetch("/api/model-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "personal" }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      notify("切换失败", d.error);
      return;
    }
    await Promise.all([load(), onChanged()]);
    notify("模型已切换", `当前使用个人模型 ${d.modelName}`);
  }
  async function savePersonal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/model-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseUrl: f.get("baseUrl"),
        modelName: f.get("modelName"),
        apiKey: f.get("apiKey"),
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      notify("模型连接失败", d.error);
      return;
    }
    await Promise.all([load(), onChanged()]);
    notify("个人模型已启用", "连接测试成功，API Key 已加密保存。");
  }
  const activeName =
    data?.settings?.displayName || data?.settings?.modelName || "尚未配置";
  return (
    <div className="modal-backdrop">
      <div className="modal model-selector-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <div className="modal-badge purple">✦</div>
        <p className="eyebrow">
          <span /> ACTIVE MODEL
        </p>
        <h2>选择使用模型</h2>
        <p>可以使用管理员提供的网站预设模型，也可以配置仅自己可用的模型。</p>
        {!data ? (
          <div className="model-loading">正在读取可用模型…</div>
        ) : (
          <>
            <div
              className={`config-status ${data.source === "personal" ? "personal" : "system"}`}
            >
              <b>
                {data.source === "personal"
                  ? "当前使用个人模型"
                  : data.source === "preset"
                    ? "当前使用网站预设"
                    : "当前使用系统模型"}
              </b>
              <span>{activeName}</span>
            </div>
            <div className="model-section-title">
              <div>
                <strong>网站预设模型</strong>
                <small>由管理员统一维护，密钥不会对用户显示</small>
              </div>
            </div>
            <div className="preset-choice-list">
              {data.presets?.length ? (
                data.presets.map((model) => (
                  <button
                    type="button"
                    className={
                      data.source === "preset" && data.presetId === model.id
                        ? "selected"
                        : ""
                    }
                    key={model.id}
                    onClick={() => selectPreset(model.id)}
                    disabled={busy}
                  >
                    <span className="model-choice-icon">✦</span>
                    <span>
                      <strong>{model.displayName}</strong>
                      <small>{model.modelName}</small>
                    </span>
                    <b>
                      {data.source === "preset" && data.presetId === model.id
                        ? "使用中"
                        : "选择"}
                    </b>
                  </button>
                ))
              ) : (
                <div className="model-empty">
                  管理员尚未添加可用的预设模型。
                </div>
              )}
            </div>
            <div className="model-divider">
              <span>个人模型</span>
            </div>
            {data.configured && (
              <button
                type="button"
                className={`personal-model-choice ${data.source === "personal" ? "selected" : ""}`}
                onClick={selectPersonal}
                disabled={busy}
              >
                <span>
                  <strong>{data.personalSettings?.modelName}</strong>
                  <small>{data.personalSettings?.baseUrl}</small>
                </span>
                <b>{data.source === "personal" ? "使用中" : "切换使用"}</b>
              </button>
            )}
            <form className="personal-model-form" onSubmit={savePersonal}>
              <label>
                接口 Base URL
                <input
                  name="baseUrl"
                  type="url"
                  defaultValue={data.personalSettings?.baseUrl || ""}
                  placeholder="https://api.example.com/v1"
                  required
                />
              </label>
              <label>
                模型名称
                <input
                  name="modelName"
                  defaultValue={data.personalSettings?.modelName || ""}
                  placeholder="例如 gpt-4.1"
                  required
                />
              </label>
              <label>
                API Key
                <input
                  name="apiKey"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    data.configured
                      ? "留空则继续使用已保存的 Key"
                      : "请输入模型 API Key"
                  }
                />
              </label>
              <div className="security-note">
                保存前会测试连接；API Key 使用 AES-GCM 加密保存且不会回显。
              </div>
              <button className="primary" type="submit" disabled={busy}>
                {busy
                  ? "正在处理…"
                  : data.configured
                    ? "更新并使用个人模型"
                    : "保存并使用个人模型"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export function AdminModelManager({ onClose, onChanged, notify }: CommonProps) {
  const empty = {
    id: "",
    displayName: "",
    baseUrl: "",
    modelName: "",
    userAgent: "AMZ-Pilot/1.0",
  };
  const [models, setModels] = useState<PresetModel[]>([]),
    [form, setForm] = useState(empty),
    [busy, setBusy] = useState(false),
    [reviewApiConfigured, setReviewApiConfigured] = useState(false),
    [reviewApiUpdatedAt, setReviewApiUpdatedAt] = useState<number | null>(null),
    [reviewApiBusy, setReviewApiBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/admin/models");
    const d = await r.json();
    if (r.ok) setModels(d.models);
    else notify("读取失败", d.error || "无法读取预设模型");
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    void loadReviewApi();
    // This modal intentionally loads both admin settings once when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function loadReviewApi() {
    const r = await fetch("/api/admin/review-api");
    const d = await r.json();
    if (r.ok) {
      setReviewApiConfigured(Boolean(d.configured));
      setReviewApiUpdatedAt(d.updatedAt || null);
    } else {
      notify("读取失败", d.error || "无法读取评论 API 配置");
    }
  }
  async function saveReviewApi(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    setReviewApiBusy(true);
    const formData = new FormData(formElement);
    const r = await fetch("/api/admin/review-api", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: formData.get("reviewApiKey") }),
    });
    const d = await r.json();
    setReviewApiBusy(false);
    if (!r.ok) {
      notify("保存失败", d.error || "评论 API Key 验证失败");
      return;
    }
    formElement.reset();
    await loadReviewApi();
    notify("评论 API 已配置", "连接测试通过，获取评论功能现在可以正常使用。 ");
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const body = {
      id: form.id || undefined,
      displayName: f.get("displayName"),
      baseUrl: f.get("baseUrl"),
      modelName: f.get("modelName"),
      apiKey: f.get("apiKey"),
      userAgent: f.get("userAgent"),
    };
    const r = await fetch("/api/admin/models", {
      method: form.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      notify("保存失败", d.error);
      return;
    }
    setForm(empty);
    await Promise.all([load(), onChanged()]);
    notify(
      form.id ? "预设模型已更新" : "预设模型已添加",
      "连接测试通过，已进入网站可用模型列表。",
    );
  }
  async function toggle(model: PresetModel) {
    setBusy(true);
    const r = await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: model.id, enabled: !model.enabled }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      notify("更新失败", d.error);
      return;
    }
    await Promise.all([load(), onChanged()]);
  }
  async function remove(model: PresetModel) {
    if (
      !window.confirm(
        `确定删除预设模型“${model.displayName}”吗？使用该模型的用户将自动回退到其他可用模型。`,
      )
    )
      return;
    setBusy(true);
    const r = await fetch(
      `/api/admin/models?id=${encodeURIComponent(model.id)}`,
      { method: "DELETE" },
    );
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      notify("删除失败", d.error);
      return;
    }
    if (form.id === model.id) setForm(empty);
    await Promise.all([load(), onChanged()]);
    notify("预设模型已删除", "相关用户会自动回退到其他可用模型。");
  }
  function edit(model: PresetModel) {
    setForm({
      id: model.id,
      displayName: model.displayName,
      baseUrl: model.baseUrl || "",
      modelName: model.modelName,
      userAgent: model.userAgent || "AMZ-Pilot/1.0",
    });
  }
  return (
    <div className="modal-backdrop">
      <div className="modal admin-model-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <div className="modal-badge purple">✦</div>
        <p className="eyebrow">
          <span /> SITE MODEL LIBRARY
        </p>
        <h2>网站预设模型</h2>
        <p>
          为全站维护可选模型。每个模型独立测试并加密保存 API
          Key，普通用户只能看到名称并选择使用。
        </p>
        <form className="review-api-admin-card" onSubmit={saveReviewApi}>
          <div className="review-api-admin-copy">
            <span className="review-api-admin-icon">☰</span>
            <div>
              <strong>评论获取 API</strong>
              <small>
                {reviewApiConfigured
                  ? `已配置${reviewApiUpdatedAt ? ` · ${new Date(reviewApiUpdatedAt).toLocaleString("zh-CN")} 更新` : ""}`
                  : "尚未配置，普通用户暂时无法使用获取评论功能"}
              </small>
            </div>
            <b className={reviewApiConfigured ? "ready" : "missing"}>
              {reviewApiConfigured ? "已配置" : "未配置"}
            </b>
          </div>
          <label>
            API Key
            <input
              name="reviewApiKey"
              type="password"
              autoComplete="new-password"
              placeholder={reviewApiConfigured ? "输入新 Key 以替换当前配置" : "请输入评论获取 API Key"}
              required
            />
          </label>
          <button className="primary" type="submit" disabled={reviewApiBusy}>
            {reviewApiBusy
              ? "正在验证…"
              : reviewApiConfigured
                ? "验证并更换 Key"
                : "验证并保存 Key"}
          </button>
        </form>
        <div className="admin-model-layout">
          <form className="admin-model-form" onSubmit={save}>
            <div className="model-section-title">
              <div>
                <strong>{form.id ? "编辑预设模型" : "新增预设模型"}</strong>
                <small>
                  {form.id
                    ? "API Key 留空时继续使用原密钥"
                    : "保存前会进行连接测试"}
                </small>
              </div>
              {form.id && (
                <button type="button" onClick={() => setForm(empty)}>
                  取消编辑
                </button>
              )}
            </div>
            <label>
              显示名称
              <input
                name="displayName"
                value={form.displayName}
                onChange={(e) =>
                  setForm((v) => ({ ...v, displayName: e.target.value }))
                }
                placeholder="例如 日常运营模型"
                required
              />
            </label>
            <label>
              接口 Base URL
              <input
                name="baseUrl"
                type="url"
                value={form.baseUrl}
                onChange={(e) =>
                  setForm((v) => ({ ...v, baseUrl: e.target.value }))
                }
                placeholder="https://api.example.com/v1"
                required
              />
            </label>
            <label>
              模型名称
              <input
                name="modelName"
                value={form.modelName}
                onChange={(e) =>
                  setForm((v) => ({ ...v, modelName: e.target.value }))
                }
                placeholder="例如 gpt-4.1"
                required
              />
            </label>
            <label>
              API Key
              <input
                name="apiKey"
                type="password"
                autoComplete="new-password"
                placeholder={form.id ? "留空继续使用原 Key" : "请输入 API Key"}
                required={!form.id}
              />
            </label>
            <label>
              User Agent
              <input
                name="userAgent"
                value={form.userAgent}
                onChange={(e) =>
                  setForm((v) => ({ ...v, userAgent: e.target.value }))
                }
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              {busy
                ? "正在测试…"
                : form.id
                  ? "测试并保存修改"
                  : "测试并添加模型"}
            </button>
          </form>
          <section className="admin-model-list">
            <div className="model-section-title">
              <div>
                <strong>已配置模型</strong>
                <small>{models.length} 个预设</small>
              </div>
            </div>
            {models.length ? (
              models.map((model) => (
                <article
                  className={model.enabled ? "" : "disabled"}
                  key={model.id}
                >
                  <div className="model-list-icon">✦</div>
                  <div>
                    <strong>{model.displayName}</strong>
                    <span>{model.modelName}</span>
                    <small>{model.baseUrl}</small>
                  </div>
                  <div className="model-list-actions">
                    <button
                      type="button"
                      onClick={() => edit(model)}
                      disabled={busy}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(model)}
                      disabled={busy}
                    >
                      {model.enabled ? "停用" : "启用"}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => remove(model)}
                      disabled={busy}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="model-empty">还没有网站预设模型。</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
