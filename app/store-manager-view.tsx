"use client";

import { useEffect, useRef, useState } from "react";

type Settings = { configured: boolean; region?: string; marketplaceId?: string; marketplaceName?: string; countryCode?: string };
type Message = { id: string; role: "user" | "assistant"; text: string };
type Row = { sku: string; asin: string; productName: string; inventory: number; sales7: number; sales30: number; dailySales: number; targetInventory: number; recommendedReplenishment: number };
type Snapshot = { generatedAt: string; marketplace: { name: string }; formula: string; totals: { skuCount: number; inventory: number; sales7: number; sales30: number; recommendedReplenishment: number }; rows: Row[] };
type Approval = { id: string; summary: string } | null;

async function consumeSse(response: Response, onEvent: (event: string, data: any) => void) {
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `请求失败 (${response.status})`);
  if (!response.body) throw new Error("服务器未返回数据流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = block.match(/^event:\s*(.+)$/m)?.[1];
      const raw = block.match(/^data:\s*(.+)$/m)?.[1];
      if (event && raw) onEvent(event, JSON.parse(raw));
    }
  }
}

export default function StoreManagerView() {
  const [settings, setSettings] = useState<Settings>({ configured: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [credentials, setCredentials] = useState({ clientId: "", clientSecret: "", refreshToken: "" });
  const [saving, setSaving] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [approval, setApproval] = useState<Approval>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { void loadSettings(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, status]);

  async function loadSettings() {
    const response = await fetch("/api/store/settings");
    if (response.ok) setSettings(await response.json());
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus("正在验证 Amazon 授权并识别 Marketplace");
    try {
      const response = await fetch("/api/store/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentials) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "连接失败");
      setSettings({ configured: true, ...data });
      setCredentials({ clientId: "", clientSecret: "", refreshToken: "" });
      setSettingsOpen(false);
      setStatus(`已连接 ${data.marketplaceName}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "连接失败"); }
    finally { setSaving(false); }
  }

  async function runInventory() {
    if (!settings.configured) { setSettingsOpen(true); return; }
    setBusy(true); setSnapshot(null); setStatus("正在启动库存与补货预估");
    try {
      const response = await fetch("/api/store/inventory", { method: "POST" });
      await consumeSse(response, (event, data) => {
        if (event === "status") setStatus(data.text);
        if (event === "result") { setSnapshot(data); setStatus(`已完成 ${data.totals.skuCount} 个 SKU 的补货预估`); }
        if (event === "error") throw new Error(data.message);
      });
    } catch (error) { setStatus(error instanceof Error ? error.message : "补货预估失败"); }
    finally { setBusy(false); }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!settings.configured) { setSettingsOpen(true); return; }
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text };
    const history = messages;
    setMessages(current => [...current, userMessage]); setInput(""); setBusy(true); setStatus("正在理解店铺运营意图"); setApproval(null);
    try {
      const response = await fetch("/api/store/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, history }) });
      await consumeSse(response, (event, data) => {
        if (event === "status") setStatus(data.text);
        if (event === "answer") setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: data.text }]);
        if (event === "approval") { setApproval({ id: data.id, summary: data.summary }); setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: data.summary }]); }
        if (event === "error") throw new Error(data.message);
      });
      setStatus("店铺 Agent 已完成");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "执行失败";
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: `执行失败：${detail}` }]);
      setStatus(detail);
    } finally { setBusy(false); }
  }

  async function approve() {
    if (!approval || busy) return;
    setBusy(true); setStatus("正在执行已确认的 SP-API 写操作");
    try {
      const response = await fetch(`/api/store/approvals/${approval.id}/execute`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "执行失败");
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: `写操作已执行成功。\n${JSON.stringify(data.result, null, 2).slice(0, 5000)}` }]);
      setApproval(null); setStatus("写操作已执行");
    } catch (error) { setStatus(error instanceof Error ? error.message : "执行失败"); }
    finally { setBusy(false); }
  }

  return (
    <div className="store-view">
      <section className="store-hero">
        <div>
          <p className="eyebrow"><span /> AMAZON SP-API · MCP AGENT</p>
          <h1>店铺管理</h1>
          <p>直接询问库存、订单、Listing、财务与物流问题，Agent 会检索真实 SP-API 端点后执行。</p>
        </div>
        <div className={`store-connection ${settings.configured ? "connected" : ""}`}>
          <b>{settings.configured ? "SP-API 已连接" : "尚未连接 SP-API"}</b>
          <span>{settings.configured ? `${settings.marketplaceName} · ${settings.region}` : "配置三项 Amazon 授权密钥后开始"}</span>
          <button onClick={() => setSettingsOpen(true)}>{settings.configured ? "更新密钥" : "配置密钥"}</button>
        </div>
      </section>

      <section className="store-grid">
        <div className="store-chat-card">
          <div className="store-card-head"><div><strong>店铺 Copilot</strong><span>{busy ? status : settings.configured ? "可以开始提问" : "等待连接"}</span></div></div>
          <div className="store-quick-actions">
            <button disabled={busy} onClick={runInventory}>查看库存与补货建议</button>
            <button disabled={busy} onClick={() => setInput("查询最近 7 天的订单与销量概况")}>近 7 天订单</button>
            <button disabled={busy} onClick={() => setInput("找出当前库存不足、最需要关注的 SKU")}>库存风险</button>
          </div>
          <div className="store-chat-thread">
            {!messages.length && <div className="store-empty"><b>像运营人员一样直接提问</b><span>例如：“当前有哪些 SKU 快断货了？”或“查一下订单 123-1234567-1234567 的状态”</span></div>}
            {messages.map(message => <div key={message.id} className={`store-message ${message.role}`}><span>{message.role === "user" ? "你" : "AI"}</span><pre>{message.text}</pre></div>)}
            {approval && <div className="store-approval"><b>需要人工确认</b><p>{approval.summary}</p><button disabled={busy} onClick={approve}>确认并执行</button></div>}
            <div ref={endRef} />
          </div>
          <div className="store-composer">
            <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="输入店铺运营问题，Enter 发送…" />
            <button disabled={busy || !input.trim()} onClick={send}>{busy ? "执行中" : "发送"}</button>
          </div>
          {status && <div className="store-status">{busy && <i />} {status}</div>}
        </div>

        <aside className="store-side-card">
          <strong>补货模型</strong>
          <p>综合短期与长期销售速度，维持 150 天目标库存。</p>
          <code>日销量 = ((7天销量÷7) + (30天销量÷30)) ÷ 2</code>
          <code>建议补货 = max(0, 日销量×150 - 当前库存)</code>
          {snapshot && <div className="store-totals"><span><b>{snapshot.totals.skuCount}</b>SKU</span><span><b>{snapshot.totals.inventory}</b>当前库存</span><span><b>{snapshot.totals.recommendedReplenishment}</b>建议补货</span></div>}
        </aside>
      </section>

      {snapshot && <section className="store-table-card">
        <div className="store-table-head"><div><strong>库存与补货建议</strong><span>{snapshot.marketplace.name} · {new Date(snapshot.generatedAt).toLocaleString()}</span></div><button onClick={runInventory} disabled={busy}>刷新</button></div>
        <div className="store-table-wrap"><table><thead><tr><th>SKU / ASIN</th><th>库存</th><th>7天销量</th><th>30天销量</th><th>日销量</th><th>150天目标</th><th>建议补货</th></tr></thead><tbody>
          {snapshot.rows.map(row => <tr key={row.sku}><td><b>{row.sku}</b><span>{row.asin}{row.productName ? ` · ${row.productName}` : ""}</span></td><td>{row.inventory}</td><td>{row.sales7}</td><td>{row.sales30}</td><td>{row.dailySales.toFixed(2)}</td><td>{row.targetInventory}</td><td className={row.recommendedReplenishment > 0 ? "needs-stock" : ""}>{row.recommendedReplenishment}</td></tr>)}
        </tbody></table></div>
      </section>}

      {settingsOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><form className="modal-card store-settings" onSubmit={saveSettings}><div className="modal-head"><div><strong>连接 Amazon SP-API</strong><span>密钥在服务端 AES-GCM 加密保存，页面不会回显。</span></div><button type="button" onClick={() => setSettingsOpen(false)}>×</button></div>
        <label>SP_API_CLIENT_ID<input autoComplete="off" value={credentials.clientId} onChange={event => setCredentials(current => ({ ...current, clientId: event.target.value }))} required /></label>
        <label>SP_API_CLIENT_SECRET<input type="password" autoComplete="new-password" value={credentials.clientSecret} onChange={event => setCredentials(current => ({ ...current, clientSecret: event.target.value }))} required /></label>
        <label>SP_API_REFRESH_TOKEN<textarea value={credentials.refreshToken} onChange={event => setCredentials(current => ({ ...current, refreshToken: event.target.value }))} required /></label>
        <div className="modal-actions"><button type="button" className="secondary" onClick={() => setSettingsOpen(false)}>取消</button><button disabled={saving}>{saving ? "验证中…" : "验证并连接"}</button></div>
      </form></div>}
    </div>
  );
}
