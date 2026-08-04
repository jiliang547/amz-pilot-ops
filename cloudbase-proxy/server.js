import http from "node:http";
import { Readable } from "node:stream";

const upstream = new URL(process.env.UPSTREAM_URL || "https://amz-pilot-ops.powergrace.chatgpt.site");
const port = Number(process.env.PORT || 3000);

function requestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > 15 * 1024 * 1024) {
        reject(new Error("Request body exceeds 15 MB"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const target = new URL(request.url || "/", upstream);
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value && !["host", "content-length", "connection"].includes(name)) {
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
    }
    headers.set("host", upstream.host);
    if (headers.has("origin")) headers.set("origin", upstream.origin);
    if (headers.has("referer")) headers.set("referer", `${upstream.origin}/`);
    headers.set("x-forwarded-host", request.headers.host || "");
    headers.set("x-forwarded-proto", "https");
    headers.set("user-agent", "AMZ-Pilot-CloudBase/1.0");
    if (process.env.SITES_BYPASS_BEARER_TOKEN) {
      headers.set("authorization", `Bearer ${process.env.SITES_BYPASS_BEARER_TOKEN}`);
    }

    const body = await requestBody(request);
    const proxied = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });

    response.statusCode = proxied.status;
    proxied.headers.forEach((value, name) => {
      if (!["content-length", "content-encoding", "transfer-encoding", "set-cookie", "connection"].includes(name)) {
        response.setHeader(name, value);
      }
    });
    const cookies = proxied.headers.getSetCookie?.() || [];
    if (cookies.length) {
      response.setHeader("set-cookie", cookies);
    } else {
      const cookie = proxied.headers.get("set-cookie");
      if (cookie) response.setHeader("set-cookie", cookie);
    }
    const location = proxied.headers.get("location");
    if (location) {
      const rewritten = new URL(location, upstream);
      response.setHeader("location", rewritten.origin === upstream.origin ? rewritten.pathname + rewritten.search + rewritten.hash : location);
    }
    response.setHeader("x-amz-pilot-host", "cloudbase");
    if (!proxied.body || request.method === "HEAD") {
      response.end();
      return;
    }

    Readable.fromWeb(proxied.body).pipe(response);
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null;
    console.error("Gateway request failed", error, cause);
    response.statusCode = 502;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      error: "CloudBase gateway unavailable",
      detail: error instanceof Error ? error.message : "unknown",
      cause: cause?.message || null,
      code: cause && "code" in cause ? cause.code : null,
    }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AMZ Pilot CloudBase gateway listening on ${port}`);
});
