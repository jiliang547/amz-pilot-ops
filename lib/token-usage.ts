import { d1, ensureSchema } from "./db";

export type ProviderUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

export type ResolvedTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  providerReported: boolean;
};

export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const other = text.length - cjk;
  return Math.max(1, cjk + Math.ceil(other / 4));
}

export function resolveTokenUsage(
  usage: ProviderUsage | null | undefined,
  input: unknown,
  output: unknown,
): ResolvedTokenUsage {
  const inputTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens);
  const outputTokens = Number(usage?.completion_tokens ?? usage?.output_tokens);
  const providerReported =
    Number.isFinite(inputTokens) || Number.isFinite(outputTokens);
  return {
    inputTokens: Number.isFinite(inputTokens)
      ? Math.max(0, Math.round(inputTokens))
      : estimateTokens(input),
    outputTokens: Number.isFinite(outputTokens)
      ? Math.max(0, Math.round(outputTokens))
      : estimateTokens(output),
    providerReported,
  };
}

export async function recordTokenUsage(input: {
  userId: string;
  modelName: string;
  modelSource: string;
  operation: string;
  usage?: ProviderUsage | null;
  request: unknown;
  response: unknown;
}): Promise<void> {
  try {
    await ensureSchema();
    const resolved = resolveTokenUsage(
      input.usage,
      input.request,
      input.response,
    );
    await d1()
      .prepare(
        `INSERT INTO model_token_usage(id,user_id,model_name,model_source,operation,input_tokens,output_tokens,provider_reported,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.userId,
        input.modelName,
        input.modelSource,
        input.operation,
        resolved.inputTokens,
        resolved.outputTokens,
        Number(resolved.providerReported),
        Date.now(),
      )
      .run();
  } catch (error) {
    console.warn(
      "model_token_usage_record_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}
