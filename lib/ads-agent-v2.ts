import { ADS_CAPABILITIES, type AdsCapability } from "./ads-tool-catalog";
import type { McpTool } from "./amazon-mcp";
import type { ToolCall } from "./model";

export const ADS_V2_PLAN_TOOL = "amazon_ads-v2-submit_plan";
export const ADS_V2_VERDICT_TOOL = "amazon_ads-v2-submit_verdict";

export type AdsTaskOperation = "query" | "analyze" | "write" | "skill";
export type AdsGraphPhase =
  | "received"
  | "context"
  | "plan"
  | "discover"
  | "execute"
  | "verify"
  | "approval"
  | "deliver"
  | "completed"
  | "failed";

export type AdsTaskPlan = {
  operation: AdsTaskOperation;
  goal: string;
  capabilities: AdsCapability[];
  stages: string[];
  successCriteria: string[];
  requiresFreshData: boolean;
  requiresApproval: boolean;
};

export type AdsAnswerVerdict = {
  verdict: "pass" | "retry";
  reason: string;
  missingEvidence: string[];
  nextCapabilities: AdsCapability[];
  instruction: string;
};

export const adsV2PlanTool: McpTool = {
  name: ADS_V2_PLAN_TOOL,
  description: "Submit a structured execution plan for the current Amazon Ads request before using business tools.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["operation", "goal", "capabilities", "stages", "successCriteria", "requiresFreshData", "requiresApproval"],
    properties: {
      operation: { type: "string", enum: ["query", "analyze", "write", "skill"] },
      goal: { type: "string", minLength: 1, maxLength: 600 },
      capabilities: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: [...ADS_CAPABILITIES] } },
      stages: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 240 } },
      successCriteria: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 240 } },
      requiresFreshData: { type: "boolean" },
      requiresApproval: { type: "boolean" },
    },
  },
};

export const adsV2VerdictTool: McpTool = {
  name: ADS_V2_VERDICT_TOOL,
  description: "Verify whether the proposed answer satisfies the structured plan using only evidence returned by tools.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "reason", "missingEvidence", "nextCapabilities", "instruction"],
    properties: {
      verdict: { type: "string", enum: ["pass", "retry"] },
      reason: { type: "string", minLength: 1, maxLength: 600 },
      missingEvidence: { type: "array", maxItems: 12, items: { type: "string", maxLength: 240 } },
      nextCapabilities: { type: "array", uniqueItems: true, items: { type: "string", enum: [...ADS_CAPABILITIES] } },
      instruction: { type: "string", maxLength: 800 },
    },
  },
};

function parseCallArguments(call: ToolCall): Record<string, unknown> {
  const parsed = JSON.parse(call.function.arguments || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Structured Agent output must be an object.");
  return parsed as Record<string, unknown>;
}

function validCapabilities(value: unknown): AdsCapability[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(ADS_CAPABILITIES);
  return [...new Set(value.filter((item): item is AdsCapability => typeof item === "string" && allowed.has(item)))];
}

function stringList(value: unknown, maximum: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, maximum).map(item => item.trim())
    : [];
}

export function parseAdsTaskPlan(call: ToolCall): AdsTaskPlan {
  if (call.function.name !== ADS_V2_PLAN_TOOL) throw new Error(`Expected ${ADS_V2_PLAN_TOOL}.`);
  const value = parseCallArguments(call);
  const operation = value.operation;
  const goal = typeof value.goal === "string" ? value.goal.trim() : "";
  const capabilities = validCapabilities(value.capabilities);
  const stages = stringList(value.stages, 20);
  const successCriteria = stringList(value.successCriteria, 12);
  if (!(["query", "analyze", "write", "skill"] as unknown[]).includes(operation) || !goal || !capabilities.length || !stages.length || !successCriteria.length) {
    throw new Error("The model returned an incomplete Amazon Ads V2 task plan.");
  }
  return {
    operation: operation as AdsTaskOperation,
    goal,
    capabilities,
    stages,
    successCriteria,
    requiresFreshData: value.requiresFreshData === true,
    requiresApproval: operation === "write" || value.requiresApproval === true,
  };
}

export function parseAdsAnswerVerdict(call: ToolCall): AdsAnswerVerdict {
  if (call.function.name !== ADS_V2_VERDICT_TOOL) throw new Error(`Expected ${ADS_V2_VERDICT_TOOL}.`);
  const value = parseCallArguments(call);
  const verdict = value.verdict === "retry" ? "retry" : "pass";
  return {
    verdict,
    reason: typeof value.reason === "string" ? value.reason.trim().slice(0, 600) : "",
    missingEvidence: stringList(value.missingEvidence, 12),
    nextCapabilities: validCapabilities(value.nextCapabilities),
    instruction: typeof value.instruction === "string" ? value.instruction.trim().slice(0, 800) : "",
  };
}

function collectMcpText(value: unknown, texts: string[]): void {
  if (typeof value === "string") {
    texts.push(value);
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length < 2_000_000) {
      try { collectMcpText(JSON.parse(trimmed), texts); } catch { /* ordinary MCP text */ }
    }
    return;
  }
  if (Array.isArray(value)) { for (const item of value) collectMcpText(item, texts); return; }
  if (value && typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) collectMcpText(item, texts);
}

function structuredMcpError(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return structuredMcpError(JSON.parse(trimmed)); } catch { return undefined; }
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) { const found = structuredMcpError(item); if (found) return found; }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  if (object.isError === true) return JSON.stringify(object.content ?? object).slice(0, 1600);
  for (const [key, item] of Object.entries(object)) {
    const normalized = key.replace(/[_-]/g, "").toLowerCase();
    if ((normalized === "error" || normalized === "errors" || normalized === "validationerrors") && (Array.isArray(item) ? item.length > 0 : Boolean(item))) {
      return JSON.stringify(item).slice(0, 1600);
    }
    const found = structuredMcpError(item);
    if (found) return found;
  }
  return undefined;
}

export function mcpResultError(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  const texts: string[] = [];
  collectMcpText(value, texts);
  const structured = structuredMcpError(value);
  const plainFailure = texts.find(text => {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { JSON.parse(trimmed); return false; } catch { /* malformed plain error text */ }
    }
    return /validation failed|validationerror|bad[_ -]?request|invalid request|not authorized|access denied|unsupported|error["']?\s*[:=]/i.test(text);
  });
  if (object.isError !== true && !structured && !plainFailure) return undefined;
  const message = structured ?? plainFailure
    ?? texts.find(Boolean)
    ?? "Amazon Ads MCP returned an error result.";
  return message.slice(0, 1600);
}

export function hasUsableEvidence(value: unknown): boolean {
  if (mcpResultError(value)) return false;
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return String(value).trim().length > 0;
}
