const state = {
  sourceHtml: "",
  finalUrl: "",
  detectedPlatform: "",
  viewport: { width: 1440, height: 960 },
  activeTab: "html",
  output: {
    html: "Generated code will appear here.",
    tailwind: "Tailwind class notes will appear here.",
    js: "// Generated JavaScript will appear here."
  }
};

const els = {
  form: document.querySelector("#cloneForm"),
  targetUrl: document.querySelector("#targetUrl"),
  analyzeButton: document.querySelector("#analyzeButton"),
  sourceMessage: document.querySelector("#sourceMessage"),
  detectedPlatform: document.querySelector("#detectedPlatform"),
  previewMeta: document.querySelector("#previewMeta"),
  outputMeta: document.querySelector("#outputMeta"),
  viewportLabel: document.querySelector("#viewportLabel"),
  sourceFrame: document.querySelector("#sourceFrame"),
  emptyPreview: document.querySelector("#emptyPreview"),
  captureButton: document.querySelector("#captureButton"),
  refreshButton: document.querySelector("#refreshButton"),
  copyButton: document.querySelector("#copyButton"),
  downloadButton: document.querySelector("#downloadButton"),
  codeOutput: document.querySelector("#codeOutput"),
  sampleDepth: document.querySelector("#sampleDepth"),
  sampleDepthValue: document.querySelector("#sampleDepthValue"),
  includeBackgrounds: document.querySelector("#includeBackgrounds"),
  includeImages: document.querySelector("#includeImages"),
  statusDot: document.querySelector("#statusDot"),
  statusTitle: document.querySelector("#statusTitle"),
  statusDetail: document.querySelector("#statusDetail")
};

function setStatus(kind, title, detail) {
  els.statusDot.className = `status-dot ${kind}`;
  els.statusTitle.textContent = title;
  els.statusDetail.textContent = detail;
}

function setSourceMessage(kind, detail) {
  els.sourceMessage.className = `source-message ${kind || ""}`.trim();
  els.sourceMessage.textContent = detail;
  els.targetUrl.classList.toggle("field-error", kind === "error");
}

function normalizeSourceUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Paste a Framer or Webflow URL first.");
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("That URL is not valid. Try the full published page URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Use an http:// or https:// URL.");
  }

  return parsed.href;
}

function setAnalyzeBusy(isBusy) {
  els.analyzeButton.disabled = isBusy;
  els.analyzeButton.classList.toggle("loading", isBusy);
  els.analyzeButton.setAttribute("aria-busy", String(isBusy));
  if (window.lucide) {
    els.analyzeButton.innerHTML = `<i data-lucide="${isBusy ? "loader-circle" : "scan-search"}"></i>`;
    window.lucide.createIcons();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function px(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function rgbaToHex(color) {
  if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return "";
  const rgba = color.match(/rgba?\(([^)]+)\)/i);
  if (!rgba) return color;
  const [r, g, b, a = "1"] = rgba[1].split(",").map((part) => part.trim());
  if (Number(a) === 0) return "";
  const toHex = (part) => Math.max(0, Math.min(255, Number.parseInt(part, 10))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCapturedText(value) {
  const collapsed = cleanText(value);
  const tokens = collapsed.split(" ").filter(Boolean);
  const singleLetterTokens = tokens.filter((token) => /^[a-z]$/i.test(token)).length;

  if (tokens.length >= 8 && singleLetterTokens / tokens.length > 0.65) {
    return tokens
      .join("")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Za-z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Za-z])/g, "$1 $2")
      .trim();
  }

  return collapsed;
}

function classListForBox(box, computed, kind) {
  const classes = [
    "absolute",
    `left-[${px(box.left)}px]`,
    `top-[${px(box.top)}px]`,
    `w-[${px(box.width)}px]`,
    `h-[${px(box.height)}px]`
  ];

  const background = rgbaToHex(computed.backgroundColor);
  const color = rgbaToHex(computed.color);
  const borderColor = rgbaToHex(computed.borderTopColor);
  const borderWidth = Number.parseFloat(computed.borderTopWidth);
  const radius = Number.parseFloat(computed.borderTopLeftRadius);

  if (kind === "text") {
    classes.push("overflow-hidden", `text-[${px(Number.parseFloat(computed.fontSize))}px]`);
    classes.push(`leading-[${Math.max(1, Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.2).toFixed(1)}px]`);
    if (Number.parseInt(computed.fontWeight, 10) >= 650) classes.push("font-bold");
    if (computed.textAlign && computed.textAlign !== "start") classes.push(`text-${computed.textAlign}`);
    if (color) classes.push(`text-[${color}]`);
  }

  if (kind === "shape" && background) classes.push(`bg-[${background}]`);
  if (kind === "image") classes.push("object-cover");
  if (borderWidth > 0 && borderColor) classes.push(`border-[${px(borderWidth)}px]`, `border-[${borderColor}]`);
  if (radius > 0) classes.push(`rounded-[${px(radius)}px]`);
  if (computed.boxShadow && computed.boxShadow !== "none") classes.push("shadow-[0_12px_35px_rgba(15,23,42,0.16)]");

  return classes.join(" ");
}

function hasVisibleBox(rect) {
  return rect.width >= 2 && rect.height >= 2;
}

function isElementVisible(element, computed, rect) {
  return (
    hasVisibleBox(rect) &&
    computed.display !== "none" &&
    computed.visibility !== "hidden" &&
    Number(computed.opacity) > 0.01
  );
}

function hasMeaningfulBackground(computed) {
  const background = rgbaToHex(computed.backgroundColor);
  const borderWidth = Number.parseFloat(computed.borderTopWidth);
  const shadow = computed.boxShadow && computed.boxShadow !== "none";
  return Boolean(background) || borderWidth > 0 || shadow;
}

function isTextBlock(element) {
  return (
    /^(H1|H2|H3|H4|H5|H6|P|A|BUTTON|LABEL)$/.test(element.tagName) ||
    element.getAttribute("data-framer-component-type") === "Text"
  );
}

function markDescendantsConsumed(element, consumed) {
  element.querySelectorAll("*").forEach((child) => consumed.add(child));
}

function elementLabel(element) {
  return (
    element.getAttribute("alt") ||
    element.getAttribute("aria-label") ||
    cleanText(element.textContent || "").slice(0, 80) ||
    "Cloned visual layer"
  );
}

function absolutizeUrl(value) {
  if (!value) return "";
  try {
    return new URL(value, state.finalUrl).href;
  } catch {
    return value;
  }
}

function sampleFrame() {
  const doc = els.sourceFrame.contentDocument;
  if (!doc?.body) {
    throw new Error("The preview frame is not ready yet.");
  }

  const maxNodes = Number(els.sampleDepth.value);
  const includeBackgrounds = els.includeBackgrounds.checked;
  const includeImages = els.includeImages.checked;
  const all = Array.from(doc.body.querySelectorAll("*"));
  const consumed = new WeakSet();
  const layers = [];

  for (const element of all) {
    if (layers.length >= maxNodes) break;
    if (consumed.has(element)) continue;
    if (["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "SOURCE", "BR"].includes(element.tagName)) continue;

    const rect = element.getBoundingClientRect();
    const computed = doc.defaultView.getComputedStyle(element);
    if (!isElementVisible(element, computed, rect)) continue;

    const box = {
      left: rect.left + doc.defaultView.scrollX,
      top: rect.top + doc.defaultView.scrollY,
      width: rect.width,
      height: rect.height
    };

    if (includeImages && element.tagName === "IMG") {
      const src = absolutizeUrl(element.currentSrc || element.getAttribute("src"));
      if (src) {
        layers.push({
          type: "image",
          box,
          computed,
          src,
          alt: elementLabel(element)
        });
      }
      continue;
    }

    const blockText = normalizeCapturedText(element.innerText || element.textContent || "");
    if (blockText && isTextBlock(element) && rect.height <= state.viewport.height * 1.5) {
      layers.push({
        type: "text",
        box,
        computed,
        text: blockText
      });
      markDescendantsConsumed(element, consumed);
      continue;
    }

    const directText = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ");
    const text = normalizeCapturedText(directText);
    if (text && rect.height <= state.viewport.height * 1.5) {
      layers.push({
        type: "text",
        box,
        computed,
        text
      });
      continue;
    }

    if (includeBackgrounds && hasMeaningfulBackground(computed)) {
      layers.push({
        type: "shape",
        box,
        computed
      });
    }
  }

  return {
    width: state.viewport.width,
    height: Math.max(state.viewport.height, px(doc.documentElement.scrollHeight || doc.body.scrollHeight)),
    title: doc.title || "Cloned page",
    layers
  };
}

function renderLayer(layer) {
  const className = classListForBox(layer.box, layer.computed, layer.type);

  if (layer.type === "image") {
    return `    <img class="${className}" src="${attr(layer.src)}" alt="${attr(layer.alt)}">`;
  }

  if (layer.type === "text") {
    return `    <div class="${className}">${escapeHtml(layer.text)}</div>`;
  }

  return `    <div class="${className}" aria-hidden="true"></div>`;
}

function buildCloneOutput(sample) {
  const safeTitle = escapeHtml(sample.title);
  const bodyLayers = sample.layers.map(renderLayer).join("\n");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
  </head>
  <body class="m-0 bg-white">
    <main class="relative mx-auto overflow-hidden bg-white w-[${sample.width}px] min-h-[${sample.height}px]" data-clone-source="${attr(state.finalUrl)}">
${bodyLayers}
    </main>
    <script src="./clone.js"><\/script>
  </body>
</html>`;

  const tailwind = `/* Tailwind output notes
Generated from computed layout at ${sample.width}px viewport width.
The clone uses Tailwind arbitrary values for absolute positioning, sizing,
colors, radii, borders, typography, and shadows.

Recommended production step:
1. Move repeated arbitrary classes into components.
2. Replace remote image URLs with downloaded assets when license permits.
3. Re-capture tablet and mobile viewports if the source has responsive layouts.
*/`;

  const js = `const cloneRoot = document.querySelector("[data-clone-source]");
if (cloneRoot) {
  cloneRoot.dataset.renderedAt = new Date().toISOString();
}`;

  return { html, tailwind, js };
}

function updateCodeView() {
  els.codeOutput.textContent = state.output[state.activeTab];
}

function setViewport(width, height) {
  state.viewport = { width, height };
  els.sourceFrame.style.width = `${width}px`;
  els.sourceFrame.style.height = `${height}px`;
  els.viewportLabel.textContent = `${width} x ${height}`;
}

function loadPreview() {
  if (!state.sourceHtml) return;
  els.emptyPreview.hidden = true;
  els.sourceFrame.srcdoc = state.sourceHtml;
}

async function analyzeUrl(url, requestedPlatform) {
  setStatus("busy", "Fetching source", "Downloading HTML and preparing a sandboxed render.");
  setSourceMessage("", "Fetching source page...");
  setAnalyzeBusy(true);
  els.captureButton.disabled = true;
  els.refreshButton.disabled = true;
  els.copyButton.disabled = true;
  els.downloadButton.disabled = true;

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, platform: requestedPlatform })
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to analyze URL.");

    state.sourceHtml = payload.html;
    state.finalUrl = payload.finalUrl;
    state.detectedPlatform = payload.platform;

    els.detectedPlatform.textContent = payload.platform === "unknown" ? "Unknown source" : payload.platform;
    els.previewMeta.textContent = `${payload.meta.title} · ${payload.meta.imageCount} images · ${payload.meta.stylesheetCount} stylesheets`;
    els.outputMeta.textContent = `Fetched ${new Date(payload.fetchedAt).toLocaleTimeString()}`;
    if (payload.resolvedFrom) {
      els.targetUrl.value = payload.finalUrl;
    }
    loadPreview();

    els.captureButton.disabled = false;
    els.refreshButton.disabled = false;
    setSourceMessage(
      "ready",
      payload.resolvedFrom
        ? "Marketplace template detected. Loaded its live preview URL."
        : "Source loaded. Generate the clone when the preview finishes rendering."
    );
    setStatus("ready", "Source ready", "Preview loaded. Generate the clean clone when the page finishes rendering.");
  } finally {
    setAnalyzeBusy(false);
  }
}

async function generateClone() {
  setStatus("busy", "Sampling render", "Reading computed boxes, typography, images, and backgrounds.");
  await new Promise((resolve) => setTimeout(resolve, 600));
  const sample = sampleFrame();
  state.output = buildCloneOutput(sample);
  updateCodeView();
  els.copyButton.disabled = false;
  els.downloadButton.disabled = false;
  setStatus("ready", "Clone generated", `${sample.layers.length} visual layers captured into clean static output.`);
}

function downloadHtml() {
  const blob = new Blob([state.output.html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "clean-clone.html";
  link.click();
  URL.revokeObjectURL(url);
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const requestedPlatform = new FormData(els.form).get("platform");
  try {
    const normalizedUrl = normalizeSourceUrl(els.targetUrl.value);
    els.targetUrl.value = normalizedUrl;
    await analyzeUrl(normalizedUrl, requestedPlatform);
  } catch (error) {
    setSourceMessage("error", error.message);
    setStatus("error", "Analyze failed", error.message);
    setAnalyzeBusy(false);
  }
});

els.captureButton.addEventListener("click", async () => {
  try {
    await generateClone();
  } catch (error) {
    setStatus("error", "Generation failed", error.message);
  }
});

els.refreshButton.addEventListener("click", () => {
  loadPreview();
  setStatus("ready", "Preview reloaded", "The sandboxed source frame was refreshed.");
});

els.copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.output[state.activeTab]);
  setStatus("ready", "Copied", `${state.activeTab.toUpperCase()} output copied to clipboard.`);
});

els.downloadButton.addEventListener("click", downloadHtml);

document.querySelectorAll(".viewport-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".viewport-option").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    setViewport(Number(button.dataset.width), Number(button.dataset.height));
    if (state.sourceHtml) loadPreview();
  });
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    state.activeTab = tab.dataset.tab;
    updateCodeView();
  });
});

els.sampleDepth.addEventListener("input", () => {
  els.sampleDepthValue.textContent = `${els.sampleDepth.value} nodes`;
});

setViewport(1440, 960);
updateCodeView();
window.addEventListener("load", () => {
  if (window.lucide) window.lucide.createIcons();
});
