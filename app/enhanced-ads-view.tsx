"use client";

import { useEffect, useRef, useState } from "react";

type Account = { id: string; name: string; profileId: string; marketplace?: string; timezone?: string; currency?: string };
type Message = { id: string; role: "user" | "assistant"; text: string; runId?: string };
type AgentEvent = { id: string; eventType: string; round?: number; toolName?: string; status: string; createdAt: number };
type Approval = { toolName: string; summary: string; args: unknown };
type Run = {
  id: string;
  conversationId: string;
  status: "queued" | "running" | "waiting_approval" | "completed" | "failed";
  stage: string;
  round: number;
  toolCount: number;
  answer?: string;
  error?: string;
  approval?: Approval | null;
  events: AgentEvent[];
};

const stageText: Record<string, string> = {
  queued: "任务已进入持久执行队列",
  langgraph_starting: "正在启动 Cloudflare LangGraph 容器",
  langgraph_reasoning: "LangGraph 正在调用模型与 Amazon Ads MCP",
  langgraph_executing_write: "正在执行已批准的广告操作",
  tools_ready: "已发现完整 MCP 工具集",
  reasoning: "模型正在判断下一步工具",
  executing_tool: "正在调用 Amazon Ads MCP",
  processing_report: "Amazon 报表处理中，页面可安全关闭",
  waiting_approval: "写操作等待确认",
  approval_received: "已收到确认，继续执行",
  completed: "执行完成",
  failed: "执行失败",
};

const quickPrompts = [
  "查看最近7天花费最高的5个广告活动，并说明优化优先级",
  "找出最近30天有花费但没有订单的广告活动",
];

export default function EnhancedAdsView({ account, onOpenAccount }: { account?: Account; onOpenAccount: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState("");
  const [oauthOpen, setOauthOpen] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState("");
  const [oauthCallbackUrl, setOauthCallbackUrl] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef<number | null>(null);
  const activeRunRef = useRef("");
  const retryCountRef = useRef(0);

  useEffect(() => () => { if (pollingRef.current) window.clearTimeout(pollingRef.current); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, run?.stage]);
  useEffect(() => { setOauthCallbackUrl(`${window.location.origin}/api/enhanced-ads/oauth/callback`); }, []);

  async function beginOAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOauthBusy(true);
    setOauthError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/enhanced-ads/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: form.get("clientId"), clientSecret: form.get("clientSecret"), region: form.get("region") }),
      });
      const data = await response.json() as { authUrl?: string; error?: string };
      if (!response.ok || !data.authUrl) throw new Error(data.error || "无法启动 Amazon OAuth");
      window.location.assign(data.authUrl);
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : "无法启动 Amazon OAuth");
      setOauthBusy(false);
    }
  }

  useEffect(() => {
    if (!account?.id) return;
    const accountId = account.id;
    let cancelled = false;
    async function restoreConversation() {
      try {
        const response = await fetch(`/api/enhanced-ads/runs?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
        const data = await response.json() as { conversationId: string | null; messages: Message[]; run: Run | null; error?: string };
        if (!response.ok) throw new Error(data.error || "读取历史会话失败");
        if (cancelled) return;
        setConversationId(data.conversationId || "");
        setMessages(data.messages || []);
        setRun(data.run || null);
        setConnectionNotice("");
        if (data.run && ["queued", "running", "waiting_approval"].includes(data.run.status)) {
          activeRunRef.current = data.run.id;
          retryCountRef.current = 0;
          setBusy(true);
          void pollResilient(data.run.id);
        }
      } catch (error) {
        if (!cancelled) setConnectionNotice(`历史会话暂时无法读取：${error instanceof Error ? error.message : "请稍后重试"}`);
      }
    }
    void restoreConversation();
    return () => { cancelled = true; };
  }, [account?.id]);

  async function pollResilient(runId: string) {
    if (activeRunRef.current && activeRunRef.current !== runId) return;
    try {
      const response = await fetch(`/api/enhanced-ads/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
      const data = await response.json() as Run & { error?: string };
      if (!response.ok) throw new Error(data.error || "读取 Agent 状态失败");
      retryCountRef.current = 0;
      setConnectionNotice("");
      setRun(data);
      if (data.status === "completed") {
        setMessages((current) => current.some((message) => message.runId === runId && message.role === "assistant")
          ? current
          : [...current, { id: `assistant-${runId}`, runId, role: "assistant", text: data.answer || "任务已完成。" }]);
        setBusy(false);
        activeRunRef.current = "";
        return;
      }
      if (data.status === "failed") {
        setMessages((current) => current.some((message) => message.runId === runId && message.role === "assistant")
          ? current
          : [...current, { id: `assistant-${runId}`, runId, role: "assistant", text: `执行失败：${data.error || "未知错误"}` }]);
        setBusy(false);
        activeRunRef.current = "";
        return;
      }
      setBusy(true);
      pollingRef.current = window.setTimeout(() => { void pollResilient(runId); }, 2500);
    } catch (error) {
      // A transient browser/edge failure must not terminate the long-running job.
      retryCountRef.current += 1;
      const attempt = retryCountRef.current;
      const delay = Math.min(30_000, Math.round(2_500 * Math.pow(1.5, Math.min(attempt - 1, 8))));
      setBusy(true);
      setConnectionNotice(`状态连接暂时中断，${Math.ceil(delay / 1000)} 秒后自动重试（第 ${attempt} 次）`);
      pollingRef.current = window.setTimeout(() => { void pollResilient(runId); }, delay);
    }
  }

  async function poll(runId: string) {
    const response = await fetch(`/api/enhanced-ads/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
    const data = await response.json() as Run & { error?: string };
    if (!response.ok) throw new Error(data.error || "读取 Agent 状态失败");
    setRun(data);
    if (data.status === "completed") {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: data.answer || "任务已完成。" }]);
      setBusy(false);
      return;
    }
    if (data.status === "failed") {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `执行失败：${data.error || "未知错误"}` }]);
      setBusy(false);
      return;
    }
    pollingRef.current = window.setTimeout(() => { void poll(runId).catch(handlePollError); }, 2500);
  }

  function handlePollError(error: unknown) {
    setBusy(false);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `状态连接暂时中断：${error instanceof Error ? error.message : "未知错误"}。任务仍在后台运行，可稍后刷新状态。` }]);
  }

  async function submit(value?: string) {
    const message = (value ?? input).trim();
    if (!message || busy) return;
    if (!account) { onOpenAccount(); return; }
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: message }]);
    setInput("");
    setBusy(true);
    setRun(null);
    activeRunRef.current = "";
    retryCountRef.current = 0;
    setConnectionNotice("");
    try {
      const response = await fetch("/api/enhanced-ads/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: account.id, conversationId: conversationId || undefined, message }),
      });
      const data = await response.json() as { runId?: string; conversationId?: string; error?: string };
      if (!response.ok || !data.runId) throw new Error(data.error || "启动任务失败");
      setConversationId(data.conversationId || "");
      activeRunRef.current = data.runId;
      await pollResilient(data.runId);
    } catch (error) {
      setBusy(false);
      activeRunRef.current = "";
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `启动失败：${error instanceof Error ? error.message : "未知错误"}` }]);
    }
  }

  async function approve(approved: boolean) {
    if (!run) return;
    const response = await fetch(`/api/enhanced-ads/runs/${encodeURIComponent(run.id)}/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `审批提交失败：${data.error || "未知错误"}` }]);
      return;
    }
    setRun((current) => current ? { ...current, status: "running", stage: "approval_received", approval: null } : current);
  }

  function newConversation() {
    if (pollingRef.current) window.clearTimeout(pollingRef.current);
    setConversationId("");
    setMessages([]);
    setRun(null);
    setBusy(false);
    activeRunRef.current = "";
    retryCountRef.current = 0;
    setConnectionNotice("");
    setInput(quickPrompts[0]);
  }

  const recentTools = (run?.events ?? []).filter((event) => event.eventType === "tool.call" || event.eventType === "tool.result").slice(-8);
  return (
    <div className="enhanced-ads-view">
      <section className="enhanced-hero">
        <div>
          <p className="eyebrow"><span /> AMAZON ADS AGENT · DURABLE</p>
          <h1>增强型智能广告</h1>
          <p>Python LangGraph Agent 运行在 Cloudflare Container 中，动态发现 Amazon Ads MCP 工具。持久工作流负责断线恢复、审批与结果交付。</p>
        </div>
        <div className={`enhanced-account ${account ? "connected" : ""}`}>
          <div><span>当前执行账户</span><b>{account ? "READY" : "NOT CONNECTED"}</b></div>
          <strong><i />{account?.name ?? "尚未连接 Amazon Ads"}</strong>
          <small>{account ? `${account.marketplace || "站点待识别"} · Profile ${account.profileId.slice(-6)} · ${account.timezone || "时区待识别"}` : "复用网站现有的店铺密钥配置"}</small>
          <div className="enhanced-account-actions">
            <button onClick={() => setOauthOpen(true)}>Amazon 跳转授权<em>↗</em></button>
            <button onClick={onOpenAccount}>{account ? "手动配置 / 管理" : "手动配置"}<em>→</em></button>
          </div>
        </div>
      </section>

      <section className="enhanced-grid">
        <div className="enhanced-chat-card">
          <header>
            <div className="enhanced-agent-title"><span>✦</span><div><strong>Ads Agent</strong><small>官方 MCP 编排模式 · 写操作人工确认</small></div></div>
            <button onClick={newConversation}>＋ 新对话</button>
          </header>
          <div className="enhanced-thread">
            {connectionNotice && <div className="enhanced-connection-notice">{connectionNotice}</div>}
            {!messages.length && !run ? (
              <div className="enhanced-empty"><span>✦</span><strong>直接描述运营目标</strong><small>模型会选择工具、等待报表、处理完整 CSV，再交付结果。</small></div>
            ) : messages.map((message) => (
              <article className={message.role} key={message.id}>
                <span>{message.role === "assistant" ? "✦" : "你"}</span>
                <pre>{message.text}</pre>
              </article>
            ))}
            {busy && run?.status !== "waiting_approval" && (
              <div className="enhanced-running"><i /><div><strong>{stageText[run?.stage || "queued"] || run?.stage || "正在启动"}</strong><small>{run ? `第 ${run.round} 轮 · 已发现 ${run.toolCount} 个 MCP 工具` : "正在创建持久任务"}</small></div></div>
            )}
            {run?.status === "waiting_approval" && run.approval && (
              <div className="enhanced-approval">
                <div><b>写操作等待确认</b><span>{run.approval.summary}</span><code>{run.approval.toolName}</code></div>
                <div><button className="secondary" onClick={() => void approve(false)}>拒绝</button><button onClick={() => void approve(true)}>确认并执行</button></div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="enhanced-composer">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="输入广告运营问题，Enter 发送…" />
            <button onClick={() => void submit()} disabled={busy || !input.trim()}><span>↑</span>发送</button>
          </div>
          <div className="enhanced-quick"><span>快速测试</span>{quickPrompts.map((prompt) => <button key={prompt} disabled={busy} onClick={() => { setInput(prompt); void submit(prompt); }}>{prompt}</button>)}</div>
        </div>

        <aside className="enhanced-side">
          <div className="enhanced-runtime-card">
            <span className="enhanced-side-label">运行时架构</span>
            <div className="enhanced-pipeline"><b>大模型</b><i>→</i><b>LangGraph</b><i>→</i><b>MCP</b></div>
            <ul><li><i />运行时完整 tools/list</li><li><i />实时 inputSchema 校验</li><li><i />Workflow 自动恢复</li><li><i />完整 CSV 服务端聚合</li></ul>
          </div>
          <div className="enhanced-trace-card">
            <div><span className="enhanced-side-label">本次调用链</span><b>{run?.status === "completed" ? "完成" : run ? "实时" : "等待"}</b></div>
            {!recentTools.length ? <p>开始提问后，这里会显示模型实际选择的工具和执行状态。</p> : recentTools.map((event) => <div className="enhanced-trace" key={event.id}><span className={event.eventType === "tool.result" ? "done" : ""}>{event.eventType === "tool.result" ? "✓" : "→"}</span><div><strong>{event.toolName}</strong><small>Round {event.round} · {event.eventType === "tool.result" ? "已返回" : "调用中"}</small></div></div>)}
          </div>
        </aside>
      </section>
      {oauthOpen && (
        <div className="modal-backdrop enhanced-oauth-backdrop">
          <form className="modal enhanced-oauth-modal" onSubmit={beginOAuth}>
            <button type="button" className="modal-close" onClick={() => setOauthOpen(false)}>×</button>
            <div className="modal-badge">a</div>
            <p className="eyebrow"><span /> AMAZON ADS MCP · OAUTH 2.1</p>
            <h2>跳转 Amazon 授权</h2>
            <p>无需手动填写 Refresh Token 和 Profile ID。Amazon 授权完成后，系统会自动发现广告店铺并加密保存长期授权。</p>
            <label>Client ID<input name="clientId" autoComplete="off" required /></label>
            <label>Client Secret<input name="clientSecret" type="password" autoComplete="new-password" required /></label>
            <label>API 区域<select name="region" defaultValue="na"><option value="na">北美 · NA</option><option value="eu">欧洲 · EU</option><option value="fe">远东 · FE</option></select></label>
            <label>Allowed Return URL<input value={oauthCallbackUrl} readOnly /><small>请先把此地址加入 Login with Amazon Security Profile 的 Allowed Return URLs。</small></label>
            <div className="security-note">使用 OAuth 2.1 Authorization Code + PKCE。Client Secret、Refresh Token 和授权状态只在服务端加密保存。</div>
            {oauthError && <div className="form-error">{oauthError}</div>}
            <button className="primary" type="submit" disabled={oauthBusy}>{oauthBusy ? "正在跳转 Amazon…" : "继续前往 Amazon 授权"}</button>
            <button className="enhanced-oauth-manual" type="button" onClick={() => { setOauthOpen(false); onOpenAccount(); }}>改用手动配置</button>
          </form>
        </div>
      )}
    </div>
  );
}
