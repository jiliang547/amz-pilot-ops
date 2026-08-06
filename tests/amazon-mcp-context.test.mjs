import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/amazon-mcp.ts", import.meta.url), "utf8");

test("keeps the required empty campaign report query without query fields", () => {
  assert.match(source, /copy\.query=\{\}/);
  assert.doesNotMatch(source, /delete copy\.query/);
});

test("does not append an empty body to bodyless MCP tools", () => {
  assert.match(source, /Object\.keys\(body\)\.length\?\{\.\.\.rest,body\}:rest/);
});

test("limits dynamic account context to campaign queries and reports", () => {
  assert.match(source, /name\.startsWith\("campaign_management-query_"\)/);
  assert.doesNotMatch(source, /name\.includes\("query_"\)/);
});
