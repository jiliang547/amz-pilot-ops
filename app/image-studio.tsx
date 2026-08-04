import { useState } from "react";

type ImageResult = { index: number; size: string; downloadUrl: string };

function downloadBase64(name: string, value: string) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

function downloadText(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ImageStudio() {
  const [links, setLinks] = useState("");
  const [bullets, setBullets] = useState("");
  const [references, setReferences] = useState<File[]>([]);
  const [requirements, setRequirements] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [final, setFinal] = useState("");
  const [xlsxBase64, setXlsxBase64] = useState("");
  const [images, setImages] = useState<ImageResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function makeTable() {
    if (!links.trim() || !bullets.trim()) { setMessage("请填写竞品图片链接和我方产品五点描述"); return; }
    setBusy(true); setMessage("正在按 7 个节点生成图片需求表，请稍候...");
    try {
      const form = new FormData();
      form.append("competitorLinks", links); form.append("productBullets", bullets);
      references.forEach((file) => form.append("referenceFiles", file));
      const response = await fetch("/api/image-requirements", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "需求表生成失败");
      setFinal(data.final || ""); setXlsxBase64(data.xlsxBase64 || ""); setMessage("图片需求表已生成，可以下载 Excel 后进入第二步");
    } catch (error) { setMessage(error instanceof Error ? error.message : "需求表生成失败"); }
    finally { setBusy(false); }
  }

  async function saveConfig() {
    setBusy(true); setMessage("正在测试生图模型 API...");
    try {
      const response = await fetch("/api/image-model", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseUrl, modelName, apiKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "模型配置失败");
      setApiKey(""); setMessage("生图模型已测试并加密保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "模型配置失败"); }
    finally { setBusy(false); }
  }

  async function generate() {
    if (!requirements || !prompt.trim()) { setMessage("请上传图片需求表并填写 Prompt"); return; }
    setBusy(true); setMessage("正在连续生成 7 张图片，请等待全部返回...");
    try {
      const form = new FormData(); form.append("requirements", requirements); form.append("prompt", prompt);
      const response = await fetch("/api/image-generate", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生图失败");
      setImages(data.images || []); setMessage("7 张图片已生成");
    } catch (error) { setMessage(error instanceof Error ? error.message : "生图失败"); }
    finally { setBusy(false); }
  }

  return (
    <section className="image-studio">
      <div className="listing-header"><div><p className="eyebrow"><span /> AI IMAGE STUDIO</p><h1>AI 生图</h1><p>先生成图片需求表，再提交需求表和 Prompt 生成 7 张图片。</p></div><div className="listing-stage"><b>{images.length ? "已生成图片" : "准备开始"}</b><span>{message || "支持亚马逊主图和 A+ 图片尺寸"}</span></div></div>
      <div className="image-step-grid">
        <div className="listing-panel">
          <div className="section-head"><div><span className="section-icon purple">01</span><div><strong>生成图片需求表</strong><small>严格按 7 个 Skill 节点串行执行</small></div></div></div>
          <label>竞品图片链接 / ASIN 图片 URL<textarea value={links} onChange={(e) => setLinks(e.target.value)} placeholder="每行一个图片 URL，或粘贴 ASIN 图片链接" /></label>
          <label>我方产品五点描述<textarea value={bullets} onChange={(e) => setBullets(e.target.value)} placeholder="粘贴产品五点描述" /></label>
          <label className="skill-upload"><span>↑</span><div><strong>上传初始资料</strong><small>可补充竞品图片清单、产品资料等文件</small></div><input type="file" multiple accept=".txt,.md,.csv,.json,.xlsx,.xls" onChange={(e) => setReferences(Array.from(e.target.files || []))} /></label>
          <button className="primary" onClick={makeTable} disabled={busy}>生成图片需求表</button>
          {final && <><button className="secondary" onClick={() => xlsxBase64 ? downloadBase64("亚马逊产品图设计需求表.xlsx", xlsxBase64) : downloadText("image-requirements-table.txt", final)}>下载 Excel 需求表</button><pre className="listing-json image-requirement-preview">{final}</pre></>}
        </div>
        <div className="listing-panel">
          <div className="section-head"><div><span className="section-icon blue">02</span><div><strong>提交生图</strong><small>一次连续生成 7 张图片</small></div></div></div>
          <label>生图模型 Base URL<input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" /></label>
          <label>生图模型名称<input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="例如 gpt-image-1" /></label>
          <label>生图 API Key<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="配置后仅加密保存在服务器" /></label>
          <button className="secondary" onClick={saveConfig} disabled={busy}>测试并保存生图模型</button>
          <label>上传图片需求表<input type="file" accept=".txt,.md,.json,.csv,.xlsx,.xls" onChange={(e) => setRequirements(e.target.files?.[0] || null)} /><small>{requirements?.name || "选择第一步下载的需求表"}</small></label>
          <label>生图 Prompt<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="例如：Create polished Amazon listing images following the uploaded requirements..." /></label>
          <button className="primary" onClick={generate} disabled={busy}>开始生图</button>
        </div>
      </div>
      {images.length > 0 && <div className="listing-panel image-results"><div className="section-head"><div><span className="section-icon green">✓</span><div><strong>生成结果</strong><small>主图 1600×1600；A+ 电脑版 1464×600；手机版 600×450</small></div></div></div><div className="image-result-grid">{images.map((image) => <div className="image-result" key={image.index}><img src={image.downloadUrl} alt={"生成图片 " + image.index} /><div><b>图片 {image.index}</b><small>{image.size}</small><a href={image.downloadUrl}>下载</a></div></div>)}</div></div>}
    </section>
  );
}
