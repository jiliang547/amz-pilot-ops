type Schema = Record<string, unknown>;

function resolveRef(root: Schema, schema: Schema): Schema {
  const ref = typeof schema.$ref === "string" ? schema.$ref : "";
  if (!ref.startsWith("#/")) return schema;
  let current: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    if (!current || typeof current !== "object") return schema;
    current = (current as Schema)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return current && typeof current === "object" ? current as Schema : schema;
}

function branchScore(value: unknown, branch: Schema): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const keys = new Set(Object.keys(value as Schema));
  const properties = branch.properties && typeof branch.properties === "object" ? Object.keys(branch.properties as Schema) : [];
  const required = Array.isArray(branch.required) ? branch.required.filter((item): item is string => typeof item === "string") : [];
  return properties.filter(key => keys.has(key)).length * 2 + required.filter(key => keys.has(key)).length;
}

function normalize(value: unknown, sourceSchema: Schema, root: Schema): unknown {
  let schema = resolveRef(root, sourceSchema);
  const branches = (Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : null) as Schema[] | null;
  if (branches?.length) schema = resolveRef(root, [...branches].sort((a, b) => branchScore(value, b) - branchScore(value, a))[0]);
  if (Array.isArray(value)) {
    const itemSchema = schema.items && typeof schema.items === "object" ? schema.items as Schema : null;
    return itemSchema ? value.map(item => normalize(item, itemSchema, root)) : value;
  }
  if (!value || typeof value !== "object") return value;
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties as Record<string, Schema> : null;
  if (!properties) return value;
  const output: Schema = {};
  for (const [key, item] of Object.entries(value as Schema)) {
    const propertySchema = properties[key];
    if (propertySchema) output[key] = normalize(item, propertySchema, root);
    else if (schema.additionalProperties !== false) output[key] = item;
  }
  return output;
}

// Remove only fields explicitly forbidden by the live tool schema. Unknown or
// permissive schema branches are preserved rather than guessed.
export function normalizeToolArguments(args: Record<string, unknown>, inputSchema: Record<string, unknown>): Record<string, unknown> {
  return normalize(args, inputSchema, inputSchema) as Record<string, unknown>;
}

export function normalizeAmazonToolArguments(name: string, args: Record<string, unknown>, inputSchema: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeToolArguments(args, inputSchema);
  if (name === "campaign_management-update_campaign") {
    const body = normalized.body && typeof normalized.body === "object" ? normalized.body as Schema : null;
    if (body && Array.isArray(body.campaigns)) {
      body.campaigns = body.campaigns.map(campaign => {
        if (!campaign || typeof campaign !== "object") return campaign;
        const copy = { ...(campaign as Schema) };
        delete copy.adProduct;
        return copy;
      });
    }
  }
  return normalized;
}
