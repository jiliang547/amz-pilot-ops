"use client";

import { useEffect, useRef, useState } from "react";

type Toast = { title: string; detail: string } | null;
const prompts: Record<string, string> = {
  "预算巡检": "检查当前店铺过去 7 天的广告预算利用率，找出预算浪费和断流风险，并给出调整计划。",
  "搜索词清理": "分析近 30 天搜索词，将高花费无转化词加入否定候选，并先向我展示变更清单。",
  "竞价优化": "按目标 ACOS 28% 优化 Sponsored Products 竞价，单次调整幅度不要超过 15%。",
  "日报生成": "生成昨天的广告日报，突出销售额、ACOS、CTR 变化和需要人工关注的异常。",
};
const response = "已完成近 7 天广告体检。品牌词表现稳定，但 3 个商品广告组在下午 4 点前耗尽预算；另有 12 个搜索词花费超过 ¥80 且未产生订单。\n\n我建议：\n1. 将「SP | 核心款 | 精准」日预算从 ¥600 调整为 ¥720\n2. 下调 8 个高 ACOS 关键词竞价 10%\n3. 将 12 个无转化搜索词加入否定精准\n\n预计每周可减少无效花费约 ¥1,260，同时避免核心广告断流。";

export default function Home() {
  const [accountOpen, setAccountOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [approved, setApproved] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function notify(title: string, detail: string) { setToast({ title, detail }); setTimeout(() => setToast(null), 3600); }
  function runPrompt(prompt?: string) {
    if (!(prompt ?? input).trim() || streaming) return;
    setInput(""); setApproved(false); setStreamText(""); setStreaming(true);
    let index = 0;
    timerRef.current = setInterval(() => {
      index += 2; setStreamText(response.slice(0, index));
      if (index >= response.length) { if (timerRef.current) clearInterval(timerRef.current); setStreaming(false); }
    }, 12);
  }
  function chooseSkill(name: string) { setInput(prompts[name]); setSkillsOpen(false); }
  function saveAccount(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setAccountOpen(false); notify("账号已安全连接", "Amazon Ads MCP 握手成功，密钥仅用于当前个人工作区。"); }
  function createSchedule(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setScheduleOpen(false); notify("定时任务已创建", "每天 09:00 自动执行预算巡检，变更前需要你确认。"); }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><div><strong>AMZ Pilot</strong><span>运营智能中枢</span></div></div>
      <nav className="nav-list" aria-label="主导航">
        {[["智能广告","✦"],["AI 生图","◇"],["Listing 文案","T"],["数据洞察","↗"]].map(([label,icon], i) =>
          <button key={label} className={i === 0 ? "nav-item active" : "nav-item"} onClick={() => i > 0 && notify(`${label} 即将上线`, "产品架构已预留，后续可直接接入对应 Skill 与模型。")}><span className="nav-icon">{icon}</span>{label}{i > 0 && <span className="soon">SOON</span>}</button>)}
      </nav>
      <div className="sidebar-bottom"><button className="text-button"><span>⌘</span> Skill 管理</button><button className="text-button"><span>⚙</span> 团队设置</button><div className="user-card"><div className="avatar">JL</div><div><strong>Jolin</strong><span>广告运营</span></div><span className="more">•••</span></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div className="mobile-brand"><div className="brand-mark">A</div><strong>AMZ Pilot</strong></div><div className="breadcrumb"><span>运营工作台</span><b>/</b><strong>智能广告</strong></div><div className="top-actions"><button className="icon-button" aria-label="通知">♢<i /></button><button className="account-pill" onClick={() => setAccountOpen(true)}><span className="amazon-dot">a</span><span><b>NorthPeak US</b><small>美国站</small></span><em>⌄</em></button></div></header>
      <div className="content">
        <section className="hero-row"><div><p className="eyebrow"><span /> AMAZON ADS COPILOT</p><h1>早上好，Jolin。<br/><span>今天想优化什么？</span></h1><p className="hero-copy">用自然语言分析、调整和自动化你的亚马逊广告。每一步操作都透明、可控、可追溯。</p></div><div className="health-card"><div className="health-head"><span>店铺健康度</span><b>过去 7 天</b></div><div className="score-row"><div className="score-ring"><strong>86</strong><small>/100</small></div><div><strong>运行良好</strong><span><i/> MCP 实时连接</span></div></div><div className="health-metrics"><div><span>广告销售额</span><strong>¥128,460</strong><small>↗ 12.4%</small></div><div><span>ACOS</span><strong>26.8%</strong><small>↘ 2.1%</small></div></div></div></section>

        <section className="copilot-card">
          <div className="copilot-head"><div className="ai-orb">✦</div><div><strong>广告 Copilot</strong><span><i/> 在线 · 可操作 NorthPeak US</span></div><button className="new-chat" onClick={() => { setStreamText(""); setApproved(false); }}>＋ 新对话</button></div>
          {streamText ? <div className="conversation" aria-live="polite"><div className="message-meta"><span className="mini-orb">✦</span><strong>Copilot</strong><small>刚刚</small></div><div className="response-text">{streamText}</div>{!streaming && <div className="plan-card"><div><span className="plan-icon">✓</span><div><strong>变更计划已就绪</strong><small>21 项变更 · 预计 20 秒完成 · 可随时回滚</small></div></div><button onClick={() => { setApproved(true); notify("执行完成", "已通过 MCP 提交 21 项变更，并写入操作日志。"); }} disabled={approved}>{approved ? "已执行" : "批准并执行"}</button></div>}{streaming && <div className="typing"><i/><i/><i/> 正在分析广告数据</div>}</div> :
          <div className="prompt-zone"><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runPrompt(); } }} placeholder="告诉我你想做什么，例如：检查最近 7 天广告表现，找出浪费预算的关键词…" aria-label="向广告 Copilot 输入指令"/><div className="prompt-actions"><div><button onClick={() => setSkillsOpen(!skillsOpen)}>⌘ 调用 Skill <span>⌄</span></button><button onClick={() => setScheduleOpen(true)}>◷ 定时执行</button></div><button className="send" onClick={() => runPrompt()} aria-label="发送">↑</button></div>{skillsOpen && <div className="skill-menu">{Object.keys(prompts).map(skill => <button key={skill} onClick={() => chooseSkill(skill)}><span>✦</span><div><strong>{skill}</strong><small>填入经过验证的标准操作指令</small></div></button>)}</div>}</div>}
          <div className="quick-prompts"><span>快速开始</span>{[["预算巡检","预算巡检"],["清理无效搜索词","搜索词清理"],["优化关键词竞价","竞价优化"],["生成广告日报","日报生成"]].map(([label,key]) => <button key={key} onClick={() => runPrompt(prompts[key])}>{label} <b>→</b></button>)}</div>
        </section>

        <section className="bottom-grid"><div className="section-card"><div className="section-head"><div><span className="section-icon blue">⌘</span><div><strong>常用 Skills</strong><small>团队验证过的标准动作</small></div></div><button onClick={() => setSkillsOpen(true)}>查看全部 →</button></div><div className="skills-grid">{[["预算巡检","每天发现预算断流与浪费","每天 09:00"],["搜索词清理","识别并否定无效流量","按需运行"],["竞价优化","根据目标 ACOS 调整竞价","每周一"]].map(([name,desc,time],i) => <button className="skill-card" key={name} onClick={() => chooseSkill(name)}><span className={`skill-symbol s${i}`}>{["¥","⌕","↗"][i]}</span><strong>{name}</strong><p>{desc}</p><small>◷ {time}</small></button>)}</div></div>
          <div className="section-card activity-card"><div className="section-head"><div><span className="section-icon green">↻</span><div><strong>最近动态</strong><small>所有 AI 操作留痕</small></div></div><button>操作日志 →</button></div><div className="activity-list">{[["预算巡检","发现 3 个断流风险","09:42","warn"],["竞价优化","已调整 18 个关键词","09:18","good"],["广告日报","已发送至运营群","08:30","good"]].map(([name,meta,time,tone]) => <div key={time}><span className={`status ${tone}`}>✓</span><div><strong>{name}</strong><small>{meta}</small></div><time>{time}</time></div>)}</div></div></section>
      </div>
    </section>

    {accountOpen && <div className="modal-backdrop" onMouseDown={e => e.currentTarget === e.target && setAccountOpen(false)}><form className="modal" onSubmit={saveAccount}><button type="button" className="modal-close" onClick={() => setAccountOpen(false)}>×</button><div className="modal-badge">a</div><p className="eyebrow"><span/> PERSONAL CONNECTION</p><h2>连接你的广告账号</h2><p>每位同事使用自己的 Amazon Ads 凭证。密钥会加密保存，并仅用于连接你的 MCP 会话。</p><label>账号名称<input defaultValue="NorthPeak US" required/></label><label>Amazon Ads Key<input type="password" placeholder="粘贴你的加密访问 Key" required/></label><label>站点<select defaultValue="US"><option value="US">美国站 · US</option><option value="UK">英国站 · UK</option><option value="DE">德国站 · DE</option><option value="JP">日本站 · JP</option></select></label><div className="security-note">⌾ 密钥不会出现在对话内容或团队操作日志中</div><button className="primary" type="submit">测试并连接账号</button></form></div>}
    {scheduleOpen && <div className="modal-backdrop" onMouseDown={e => e.currentTarget === e.target && setScheduleOpen(false)}><form className="modal" onSubmit={createSchedule}><button type="button" className="modal-close" onClick={() => setScheduleOpen(false)}>×</button><div className="modal-badge purple">◷</div><p className="eyebrow"><span/> AI AUTOMATION</p><h2>创建定时任务</h2><p>让 AI 在指定时间自动检查或执行动作。涉及预算和竞价的变更可设置人工确认。</p><label>任务名称<input defaultValue="每日预算巡检" required/></label><div className="field-row"><label>运行频率<select defaultValue="daily"><option value="daily">每天</option><option value="weekday">每个工作日</option><option value="weekly">每周</option></select></label><label>执行时间<input type="time" defaultValue="09:00"/></label></div><label className="toggle-row"><span><strong>执行前需要确认</strong><small>AI 先发送变更计划，不直接修改广告</small></span><input type="checkbox" defaultChecked/></label><button className="primary" type="submit">创建定时任务</button></form></div>}
    {toast && <div className="toast"><span>✓</span><div><strong>{toast.title}</strong><small>{toast.detail}</small></div></div>}
  </main>;
}