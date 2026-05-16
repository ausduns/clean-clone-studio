import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 5188);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = join(process.cwd(), "public");
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function validateTargetUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid URL, including https://.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  if (isPrivateHostname(url.hostname)) {
    throw new Error("Local and private-network URLs are blocked by this server.");
  }

  return url;
}

function detectPlatform(url, html) {
  const source = `${url.hostname}\n${html}`.toLowerCase();
  if (source.includes("framerusercontent.com") || source.includes("framer.com/m/") || source.includes("__framer")) {
    return "framer";
  }
  if (source.includes("webflow.io") || source.includes("webflow.js") || source.includes("data-wf-page")) {
    return "webflow";
  }
  return "unknown";
}

function isFramerMarketplaceTemplate(url) {
  const host = url.hostname.toLowerCase();
  return (host === "framer.com" || host === "www.framer.com") && url.pathname.includes("/marketplace/templates/");
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x2F;", "/")
    .replaceAll("\\/", "/");
}

function extractFramerPreviewUrl(html) {
  const decoded = decodeHtmlEntities(html);
  const directMatch = decoded.match(/https?:\/\/[a-z0-9-]+\.framer\.website\/?[^"'<\s)]*/i);
  if (directMatch) return directMatch[0];

  const previewLinkMatch = decoded.match(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*Preview\s*<\/a>/i);
  if (previewLinkMatch) {
    try {
      const previewUrl = new URL(previewLinkMatch[1], "https://www.framer.com/");
      if (previewUrl.hostname.endsWith(".framer.website")) return previewUrl.href;
    } catch {
      return "";
    }
  }

  return "";
}

function extractPageMeta(html) {
  const pick = (pattern) => {
    const match = html.match(pattern);
    return match?.[1]?.replace(/\s+/g, " ").trim() || "";
  };

  return {
    title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i) || "Untitled page",
    description: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i),
    imageCount: (html.match(/<img\b/gi) || []).length,
    stylesheetCount: (html.match(/<link[^>]+rel=["']stylesheet["']/gi) || []).length,
    scriptCount: (html.match(/<script\b/gi) || []).length
  };
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > 64 * 1024) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function injectBase(html, finalUrl) {
  const base = `<base href="${finalUrl}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
  }
  return `<!doctype html><html><head>${base}</head><body>${html}</body></html>`;
}

function stripExecutableContent(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<script\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
}

async function fetchTarget(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) CleanCloneStudio/1.0 Safari/537.36"
      }
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      throw new Error(`The target returned HTTP ${response.status}.`);
    }
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("The target did not return an HTML page.");
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_SOURCE_BYTES) {
        throw new Error("The page HTML is larger than the current 8 MB limit.");
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      html: new TextDecoder("utf-8").decode(bytes),
      finalUrl: response.url
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleAnalyze(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const requestedUrl = validateTargetUrl(body.url);
    const source = await fetchTarget(requestedUrl);
    let html = source.html;
    let finalUrl = source.finalUrl;
    let resolvedFrom = "";

    if (isFramerMarketplaceTemplate(new URL(finalUrl))) {
      const previewUrl = extractFramerPreviewUrl(html);
      if (!previewUrl) {
        sendJson(res, 422, {
          error: "That Framer Marketplace listing did not expose a live Preview URL. Open the template listing, click Preview, then paste the *.framer.website URL here."
        });
        return;
      }

      const preview = await fetchTarget(validateTargetUrl(previewUrl));
      resolvedFrom = finalUrl;
      html = preview.html;
      finalUrl = preview.finalUrl;
    }

    const preparedHtml = injectBase(stripExecutableContent(html), finalUrl);

    sendJson(res, 200, {
      html: preparedHtml,
      finalUrl,
      resolvedFrom,
      platform: detectPlatform(new URL(finalUrl), html),
      meta: extractPageMeta(html),
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Unable to analyze this URL." });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const contents = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream"
    });
    res.end(contents);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/analyze") {
    handleAnalyze(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { allow: "GET, POST" });
  res.end("Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Clean Clone Studio running at http://${HOST}:${PORT}`);
});
