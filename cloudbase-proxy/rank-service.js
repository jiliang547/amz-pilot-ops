import http from "node:http";
import { chromium } from "playwright";

const port = Number(process.env.PORT || 3000);
const key = process.env.RANK_SERVICE_KEY || process.env.CRON_SECRET || "";
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const bodyOf = req => new Promise((resolve, reject) => {
  let body = "";
  req.on("data", chunk => { body += chunk; if (body.length > 2e6) reject(new Error("body too large")); });
  req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("invalid JSON")); } });
  req.on("error", reject);
});

function proxiesOf(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("No proxies configured");
  return value.map(proxy => ({ host: String(proxy.host), port: Number(proxy.port), username: String(proxy.username), password: String(proxy.password) }));
}

function proxyOptions(proxy) {
  return { server: `http://${proxy.host}:${proxy.port}`, username: proxy.username, password: proxy.password };
}

function isCaptcha(text) {
  return /captcha|robot check|enter the characters you see below|sorry, we just need to make sure you're not a robot/i.test(text);
}

async function openAmazonPage(page, url) {
  console.log(JSON.stringify({ event: "amazon.navigate.start", url }));
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  const text = await page.locator("body").innerText().catch(() => "");
  if (!response || !response.ok()) throw new Error(`Amazon HTTP ${response?.status() || "unknown"}`);
  if (isCaptcha(text)) throw new Error("Amazon 返回了验证码页面");
  console.log(JSON.stringify({ event: "amazon.navigate.ok", url, status: response.status() }));
}

// Keep this parser aligned with the reference skill: these JSON blocks include
// variants that are not represented by currently selectable DOM options.
async function extractVariants(page, asin) {
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) { window.scrollBy(0, 500); await new Promise(resolve => setTimeout(resolve, 500)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(3000);
  await page.waitForTimeout(3000);
  return page.evaluate(parentAsin => {
    const asins = new Set();
    const centerCol = document.getElementById("centerCol");
    const scopes = [];
    if (centerCol) scopes.push(centerCol.innerHTML); else scopes.push(document.body.innerHTML);
    document.querySelectorAll("script[data-a-state]").forEach(script => {
      const text = script.textContent || "";
      if (text.includes("dimensionValuesDisplayData") || text.includes("colorToAsin")) scopes.push(text);
    });
    for (const scope of scopes) {
      const dimensionMatch = scope.match(/"dimensionValuesDisplayData"\s*:\s*(\{[\s\S]+?\})\s*[,}]/);
      if (dimensionMatch) {
        try {
          const object = JSON.parse(dimensionMatch[1].replace(/'/g, '"').replace(/,(\s*[\]}])/g, "$1"));
          for (const candidate of Object.keys(object)) if (/^[A-Z0-9]{10}$/.test(candidate)) asins.add(candidate);
        } catch { /* malformed block; continue with other scopes */ }
      }
      const colorMatch = scope.match(/"colorToAsin"\s*:\s*(\{[\s\S]+?\})\s*[,}]/);
      if (colorMatch && colorMatch[1].includes("asin")) {
        for (const match of colorMatch[1].matchAll(/"asin"\s*:\s*"([A-Z0-9]{10})"/g)) asins.add(match[1]);
      }
    }
    asins.add(parentAsin);
    return [...asins];
  }, asin);
}

async function findRank(page, asins) {
  const cards = page.locator("[data-component-type='s-search-result']");
  const count = await cards.count();
  let sponsored = 0;
  for (let index = 0; index < count; index++) {
    const card = cards.nth(index);
    const cardAsin = await card.getAttribute("data-asin");
    const cardText = await card.innerText().catch(() => "");
    const sponsoredLabel = await card.locator(".s-label-popover-default, [aria-label*='Sponsored'], [data-component-type='s-sponsored-label']").count();
    if (sponsoredLabel || /\bSponsored\b/i.test(cardText)) { sponsored++; continue; }
    if (asins.includes(cardAsin)) return { found: true, variant_asin: cardAsin, position: index + 1, sponsored_count: sponsored, rank: index + 1 - sponsored };
  }
  return { found: false, sponsored_count: sponsored };
}

async function outboundIp(context) {
  console.log(JSON.stringify({ event: "proxy.ip.start" }));
  const page = await context.newPage();
  try {
    for (const endpoint of ["https://api.ipify.org?format=json", "https://api64.ipify.org?format=json"]) {
      try {
        const response = await page.goto(endpoint, { waitUntil: "domcontentloaded", timeout: 15000 });
        const data = JSON.parse(await response.text());
        if (typeof data.ip === "string") {
          console.log(JSON.stringify({ event: "proxy.ip.ok", ip: data.ip }));
          return data.ip;
        }
      } catch { /* try the alternate endpoint */ }
    }
    console.log(JSON.stringify({ event: "proxy.ip.unavailable" }));
    return null;
  } catch { return null; } finally { await page.close().catch(() => {}); }
}

async function rank({ asin, keyword, maxPages, proxies }) {
  const proxy = proxies[0];
  console.log(JSON.stringify({ event: "rank.start", asin, keyword, maxPages, proxy: `${proxy.host}:${proxy.port}` }));
  const browser = await withTimeout(chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] }), 30000, "浏览器启动超时");
  try {
    const localContext = await browser.newContext({ userAgent, locale: "en-US", timezoneId: "America/Los_Angeles", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });
    try {
      const localPage = await localContext.newPage();
      await openAmazonPage(localPage, `https://www.amazon.com/dp/${asin}`);
      console.log(JSON.stringify({ event: "variants.extract.start", asin }));
      var variants = await extractVariants(localPage, asin);
      console.log(JSON.stringify({ event: "variants.extract.ok", asin, count: variants.length }));
    } finally { await localContext.close().catch(() => {}); }

    const proxyContext = await browser.newContext({ proxy: proxyOptions(proxy), userAgent, locale: "en-US", timezoneId: "America/Los_Angeles", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });
    try {
      const actualIp = await outboundIp(proxyContext);
      const page = await proxyContext.newPage();
      for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
        console.log(JSON.stringify({ event: "rank.search.start", page: pageNumber }));
        const url = `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}${pageNumber > 1 ? `&page=${pageNumber}` : ""}`;
        await openAmazonPage(page, url);
        const hit = await findRank(page, variants);
        if (hit.found) return { ...hit, status: "found", page: pageNumber, variant_asins: variants, proxy_host: `${proxy.host}:${proxy.port}`, actual_ip: actualIp };
        if (pageNumber < maxPages) await new Promise(resolve => setTimeout(resolve, 1500));
      }
      return { status: "not_found", found: false, variant_asins: variants, proxy_host: `${proxy.host}:${proxy.port}`, actual_ip: actualIp };
    } finally {
      await proxyContext.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== "POST" || request.url !== "/rank") throw Object.assign(new Error("Not found"), { status: 404 });
    if (key && request.headers["x-rank-service-key"] !== key) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    const body = await bodyOf(request);
    const asin = String(body.asin || "").trim().toUpperCase();
    const keyword = String(body.keyword || "").trim();
    const maxPages = Math.max(1, Math.min(5, Number(body.maxPages) || 5));
    if (!/^[A-Z0-9]{10}$/.test(asin) || !keyword) throw new Error("Invalid ASIN or keyword");
    const result = await withTimeout(rank({ asin, keyword, maxPages, proxies: proxiesOf(body.proxies) }), 300000, "排名查询超时：Amazon 或代理没有在 5 分钟内返回");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(error.status || 400, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "error", error: error instanceof Error ? error.message : "Rank service failed" }));
  }
});
server.listen(port, "0.0.0.0");
