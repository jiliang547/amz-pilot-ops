import { readFile, writeFile } from "node:fs/promises";

const source = process.argv[2];
const destination = process.argv[3] ?? "lib/sp-api-catalog.generated.ts";
if (!source) throw new Error("Usage: node scripts/generate-sp-api-catalog.mjs <catalog.md> [output.ts]");

const markdown = await readFile(source, "utf8");
let category = "Other";
const endpoints = [];
for (const line of markdown.split(/\r?\n/)) {
  const heading = line.match(/^##\s+\d+\.\s+(.+?)\s+\(\d+\)\s*$/);
  if (heading) category = heading[1];
  const row = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|/);
  if (row) endpoints.push({ id: row[1], name: row[2].trim(), method: row[3], path: row[4], category });
}
if (endpoints.length < 300) throw new Error(`Only parsed ${endpoints.length} endpoints`);

const output = `// Generated from SP-API_EndPoints_Catalog.md. Do not edit manually.\n` +
  `export type SpApiEndpoint = { id: string; name: string; method: string; path: string; category: string };\n` +
  `export const SP_API_ENDPOINTS: SpApiEndpoint[] = ${JSON.stringify(endpoints, null, 2)};\n`;
await writeFile(destination, output, "utf8");
console.log(`Generated ${endpoints.length} endpoints in ${destination}`);
