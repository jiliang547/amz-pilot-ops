import {
  modelConfigForUser,
  modelEndpoint,
  modelHeaders,
} from "./model-config";
import { recordTokenUsage, type ProviderUsage } from "./token-usage";

const PROMPTS = [
  `You are an Amazon product-image analysis expert. Analyze only the competitor image URLs supplied by the user, image by image. Do not judge quality, invent our product needs, copy brands or logos, or write our product copy. For every image identify: ASIN/competitor, image number, original URL, image type (Main/Selling Point/Scene/Parameter/Size/Accessory/A+/Other), theme, visible English copy (or partially unreadable), copy structure, visual expression, background/scene, layout, and one reusable structural conclusion. Preserve every original URL exactly.`,
  `You are an Amazon competitor-image strategy analyst. Using node 1, group images by image type and selling-point theme. Summarize frequency, purpose, common copy structure, visual expression and layout. For every important group choose one representative URL copied exactly from node 1; never invent or rewrite URLs. Include competitor layout patterns, recommended image-type sequence, and copy-expression patterns. Do not create our product copy.`,
  `You are an Amazon product-image copy strategist. Using competitor grouping (node 2) and our five-point description, plan only selling points explicitly supported by our product. Do not import competitor-only features, parameters or scenes. For each recommended image provide image number, type, theme, support yes/no, product evidence, competitor expression pattern, competitor-style reference copy, optimized conversion copy in English, recommended copy, copy structure, exact structural reference URL from node 2, URL source and notes. Mark unsupported items not recommended.`,
  `You are an Amazon image-structure analyst. Analyze the reference URLs and image strategy from node 3 without copying brands, logos, exact artwork or competitor copy. For each image return in English: image type, core selling point, Background Scene, Product Placement, Visual Elements, Copy Layout, Overall Style, Must Include, Avoid, and a reusable prompt fragment. Extract structure and style only.`,
  `You are an Amazon image-requirement editor. Condense node 4 into a compact, AI-image-ready record for every image. Keep selling-point direction, main scene structure, core visual symbols, copy layout, overall style and necessary restrictions. Remove repetition, over-specific ratios and excessive constraints. Output in English with exactly: Image Type, Core Selling Point, Image Structure (Background Scene/Product Placement/Visual Elements/Copy Layout), Overall Style, Must Include Elements (3-6), Avoid (2-4).`,
  `You are an Amazon image-design requirement-table integrator. Merge node 3 (copy strategy) and node 5 (condensed structure) by image number. Do not rewrite copy or invent features. Exclude items marked not recommended. Output a formal Markdown table with exactly these columns: Image No., Image Type, Size, Selling Point, Image Copy (English), Copy Handling Rule, Image Structure, Overall Style, Must Include Elements, Avoid, Image Structure Reference URL, Product Evidence, Notes. Default size is 1600x1600. Preserve reference URLs exactly. Add exclusion notes and a short integration checklist after the table.`,
  `You are the final Amazon image-requirement table editor. Condense node 6 into a clean Markdown Excel-ready table. Keep only: Image No., Image Type, Size, Selling Point, Image Copy (English), Image Structure, Overall Style, Image Structure Reference URL. Keep URLs exactly, do not add unsupported features, and do not output analysis. Return one Markdown table only.`,
];

function rowCount(markdown: string): number {
  return (
    markdown
      .split(/\r?\n/)
      .filter((line) => /^\s*\|/.test(line) && !/^\s*\|\s*:?-{3,}/.test(line))
      .length - 1
  );
}
function reduceNode6(markdown: string): string {
  const lines = markdown.split(/\r?\n/).filter((line) => /^\s*\|/.test(line));
  if (lines.length < 3) return markdown;
  const header = lines[0];
  const separator = lines[1];
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((value) => value.trim());
  const source = cells(header);
  const wanted = [
    "Image No.",
    "Image Type",
    "Size",
    "Selling Point",
    "Image Copy (English)",
    "Image Structure",
    "Overall Style",
    "Image Structure Reference URL",
  ];
  const indexes = wanted.map((name) =>
    source.findIndex((value) => value.toLowerCase() === name.toLowerCase()),
  );
  if (indexes.some((index) => index < 0)) return markdown;
  const output = [
    "| " + wanted.join(" | ") + " |",
    "| " + wanted.map(() => ":---").join(" | ") + " |",
  ];
  for (const line of lines.slice(2)) {
    const cellsForRow = cells(line);
    output.push(
      "| " +
        indexes.map((index) => cellsForRow[index] ?? "").join(" | ") +
        " |",
    );
  }
  return output.join("\n");
}

async function ask(
  userId: string,
  node: number,
  system: string,
  input: string,
  timeoutMs = node === 1 ? 300_000 : 120_000,
): Promise<string> {
  const config = await modelConfigForUser(userId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestBody = {
      model: config.modelName,
      messages: [
        { role: "system", content: system },
        { role: "user", content: input },
      ],
      temperature: 0.1,
      max_tokens: 16_000,
    };
    const response = await fetch(modelEndpoint(config), {
      method: "POST",
      headers: modelHeaders(config),
      signal: controller.signal,
      body: JSON.stringify(requestBody),
    });
    if (!response.ok)
      throw new Error(`图片需求节点 ${node} 请求失败 (${response.status})`);
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: ProviderUsage;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error(`图片需求节点 ${node} 没有返回内容`);
    await recordTokenUsage({
      userId,
      modelName: config.modelName,
      modelSource: config.source,
      operation: `image_requirements.node_${node}`,
      usage: data.usage,
      request: requestBody,
      response: content,
    });
    return content;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error(
        `图片需求节点 ${node} 超时（${Math.round(timeoutMs / 1000)} 秒）`,
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function runImageRequirementWorkflow(
  userId: string,
  links: string,
  bullets: string,
) {
  const chunks = links
    .split(/(?=^##\s+B[A-Z0-9]+\b)/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const n1Parts = await Promise.all(
    (chunks.length > 1 ? chunks : [links]).map((chunk) =>
      ask(userId, 1, PROMPTS[0], chunk, 45_000),
    ),
  );
  const n1 = n1Parts.join("\n\n--- Competitor group ---\n\n");
  const n2 = await ask(userId, 2, PROMPTS[1], n1);
  const n3 = await ask(
    userId,
    3,
    PROMPTS[2],
    JSON.stringify({ competitor_summary: n2, product_bullets: bullets }),
  );
  const n4 = await ask(userId, 4, PROMPTS[3], n3);
  const n5 = await ask(userId, 5, PROMPTS[4], n4);
  const n6 = await ask(
    userId,
    6,
    PROMPTS[5],
    JSON.stringify({ copy_strategy: n3, condensed_structure: n5 }),
  );
  const n7 = await ask(userId, 7, PROMPTS[6], n6);
  const final =
    rowCount(n7) >= Math.max(1, rowCount(n6)) ? n7 : reduceNode6(n6);
  return {
    nodes: { "1": n1, "2": n2, "3": n3, "4": n4, "5": n5, "6": n6, "7": n7 },
    final,
  };
}

export function fallbackImageRequirements(links: string, bullets: string) {
  const urls = [...new Set(links.match(/https?:\/\/[^\s|)]+/g) ?? [])].slice(
    0,
    7,
  );
  const themes = [
    "Product Overview",
    "Power & Bass",
    "TWS Stereo",
    "EQ & Playback",
    "RGB Light Modes",
    "Battery Life & Bluetooth 5.3",
    "Multi-Scene Use",
  ];
  const rows = urls.map(
    (url, index) =>
      `| ${index + 1} | ${index === 0 ? "Main Image" : "Selling Point Image"} | 1600x1600 | ${themes[index] ?? "Product Feature"} | ${index === 0 ? "No copy" : "Clear English headline and concise supporting benefit based only on verified product facts"} | Background Scene: clean Amazon-ready background; Product Placement: product clearly visible and primary; Visual Elements: product, one relevant feature cue, restrained icons; Copy Layout: clear headline with short supporting line | Clean, premium, product-focused Amazon style | ${url} |`,
  );
  const header =
    "| Image No. | Image Type | Size | Selling Point | Image Copy (English) | Image Structure | Overall Style | Image Structure Reference URL |";
  const separator = "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |";
  return `${header}\n${separator}\n${rows.join("\n")}\n\n> Fallback generated after model timeout; verify copy and feature claims against product bullets before publishing.\n> Product evidence: ${bullets.slice(0, 500).replace(/\r?\n/g, " ")}`;
}
