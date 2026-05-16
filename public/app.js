const state = {
  sourceHtml: "",
  finalUrl: "",
  detectedPlatform: "",
  viewport: { width: 1440, height: 960 },
  output: {
    html: "Generated code will appear here.",
    tailwind: "Tailwind class notes will appear here.",
    js: "// Generated JavaScript will appear here."
  },
  showingGeneratedCode: false
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
  copyDropdown: document.querySelector("#copyDropdown"),
  downloadButton: document.querySelector("#downloadButton"),
  downloadDropdown: document.querySelector("#downloadDropdown"),
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


// ------------------------------------------------------------------
// SEMANTIC EXTRACTION ENGINE (Replacing Absolute Positioning Engine)
// ------------------------------------------------------------------

function extractSemanticNode(el, doc) {
  if (["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "SOURCE", "BR"].includes(el.tagName)) return null;

  const computed = doc.defaultView.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  if (
    computed.display === "none" ||
    computed.visibility === "hidden" ||
    Number(computed.opacity) < 0.01 ||
    (rect.width === 0 && rect.height === 0 && el.tagName !== "IMG")
  ) {
    return null;
  }

  const nodeData = {
    tagName: el.tagName.toLowerCase(),
    text: Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim(),
    style: {
      display: computed.display,
      flexDirection: computed.flexDirection,
      justifyContent: computed.justifyContent,
      alignItems: computed.alignItems,
      padding: computed.padding,
      margin: computed.margin,
      gap: computed.gap,
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      borderRadius: computed.borderRadius,
      borderWidth: computed.borderWidth,
      borderColor: computed.borderColor,
      width: rect.width,
      height: rect.height,
    },
    children: []
  };

  if (el.tagName === "IMG") {
    nodeData.src = absolutizeUrl(el.currentSrc || el.getAttribute("src"));
    nodeData.alt = elementLabel(el);
  }

  for (const child of el.children) {
    const childData = extractSemanticNode(child, doc);
    if (childData) {
      nodeData.children.push(childData);
    }
  }

  return nodeData;
}

function toSemanticTailwindClasses(style) {
  const classes = [];

  if (style.display === "flex") {
    classes.push("flex");
    if (style.flexDirection === "column") classes.push("flex-col");
    if (style.justifyContent && style.justifyContent !== "normal") classes.push(`justify-${style.justifyContent.replace('flex-', '')}`);
    if (style.alignItems && style.alignItems !== "normal") classes.push(`items-${style.alignItems.replace('flex-', '')}`);
    if (style.gap && style.gap !== "normal" && style.gap !== "0px") classes.push(`gap-[${style.gap}]`);
  }

  if (style.padding && style.padding !== "0px") classes.push(`p-[${style.padding}]`);
  if (style.margin && style.margin !== "0px") classes.push(`m-[${style.margin}]`);

  if (style.fontSize && style.fontSize !== "16px") classes.push(`text-[${style.fontSize}]`);
  if (style.fontWeight && parseInt(style.fontWeight) > 400) classes.push(`font-[${style.fontWeight}]`);

  const colorHex = rgbaToHex(style.color);
  if (colorHex && colorHex !== "#000000") classes.push(`text-[${colorHex}]`);

  const bgHex = rgbaToHex(style.backgroundColor);
  if (bgHex) classes.push(`bg-[${bgHex}]`);
  if (style.borderRadius && style.borderRadius !== "0px") classes.push(`rounded-[${style.borderRadius}]`);

  return classes.join(" ");
}

function renderSemanticTree(node, indent = 2) {
  if (!node) return "";

  const spaces = " ".repeat(indent);
  const classes = toSemanticTailwindClasses(node.style);
  const classAttr = classes ? ` class="${classes}"` : "";

  if (node.tagName === "img") {
    return `${spaces}<img src="${attr(node.src || '')}" alt="${attr(node.alt || '')}"${classAttr}>
`;
  }

  let tag = node.tagName === "body" ? "main" : node.tagName;
  if (!["main", "div", "section", "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "a", "button", "nav", "footer", "header"].includes(tag)) {
    tag = "div";
  }

  let html = `${spaces}<${tag}${classAttr}>
`;

  if (node.text) {
    html += `${spaces}  ${escapeHtml(node.text)}
`;
  }

  for (const child of node.children) {
    html += renderSemanticTree(child, indent + 2);
  }


  if (node.text) {
    html += `${spaces}  ${escapeHtml(node.text)}
`;
  }

  for (const child of node.children) {
    html += renderSemanticTree(child, indent + 2);
  }

  html += `${spaces}</${tag}>
`;
  return html;
}

function sampleFrame() {
  const doc = els.sourceFrame.contentDocument;
  if (!doc?.body) {
    throw new Error("The preview frame is not ready yet.");
  }

  const rootNode = extractSemanticNode(doc.body, doc);

  return {
    width: state.viewport.width,
    height: Math.max(state.viewport.height, px(doc.documentElement.scrollHeight || doc.body.scrollHeight)),
    title: doc.title || "Cloned page",
    rootNode
  };
}

function buildCloneOutput(sample) {
  const safeTitle = escapeHtml(sample.title);
  const bodyLayers = renderSemanticTree(sample.rootNode);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
  </head>
  <body class="m-0 bg-white">
${bodyLayers}
    <script src="./clone.js"><\/script>
  </body>
</html>`;

  const tailwind = `/* Tailwind output notes
Generated from computed layout at ${sample.width}px viewport width.
The clone uses Tailwind arbitrary values based on semantic DOM structure.

Recommended production step:
1. Move repeated arbitrary classes into components.
2. Replace remote image URLs with downloaded assets when license permits.
*/`;

  const js = `const cloneRoot = document.querySelector("main");
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
  if (!state.sourceHtml && !state.showingGeneratedCode) return;
  els.emptyPreview.hidden = true;
  if (state.showingGeneratedCode) {
    els.sourceFrame.srcdoc = state.output.html;
  } else {
    els.sourceFrame.srcdoc = state.sourceHtml;
  }
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

    state.showingGeneratedCode = false;
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
  state.showingGeneratedCode = true;
  loadPreview();
  els.copyButton.disabled = false;
  els.downloadButton.disabled = false;
  setStatus("ready", "Clone generated", `Semantic DOM tree successfully captured into clean static output.`);
}


async function downloadFormat(format) {
  if (format === 'zip') {
    if (!window.JSZip) {
      setStatus("error", "Download failed", "JSZip library not loaded.");
      return;
    }
    const zip = new window.JSZip();
    zip.file("index.html", state.output.html);
    zip.file("tailwind.txt", state.output.tailwind);
    zip.file("clone.js", state.output.js);
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clean-clone.zip";
    link.click();
    URL.revokeObjectURL(url);
  } else {
    const ext = format === 'tailwind' ? 'txt' : format;
    const blob = new Blob([state.output[format]], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clean-clone.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  }
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

// Dropdown logic
let activeDropdown = null;

function closeDropdowns() {
  els.copyDropdown.classList.add("hidden");
  els.downloadDropdown.classList.add("hidden");
  activeDropdown = null;
}

els.copyButton.addEventListener("click", (e) => {
  e.stopPropagation();
  if (activeDropdown === els.copyDropdown) {
    closeDropdowns();
  } else {
    closeDropdowns();
    els.copyDropdown.classList.remove("hidden");
    activeDropdown = els.copyDropdown;
  }
});

els.downloadButton.addEventListener("click", (e) => {
  e.stopPropagation();
  if (activeDropdown === els.downloadDropdown) {
    closeDropdowns();
  } else {
    closeDropdowns();
    els.downloadDropdown.classList.remove("hidden");
    activeDropdown = els.downloadDropdown;
  }
});

document.addEventListener("click", () => {
  closeDropdowns();
});

document.querySelectorAll(".dropdown-item").forEach(item => {
  item.addEventListener("click", async (e) => {
    e.stopPropagation();
    const action = e.target.dataset.action;
    const format = e.target.dataset.format;

    closeDropdowns();

    if (action === "copy") {
      await navigator.clipboard.writeText(state.output[format]);
      setStatus("ready", "Copied", `${format.toUpperCase()} output copied to clipboard.`);
    } else if (action === "download") {
      await downloadFormat(format);
      setStatus("ready", "Downloaded", `${format.toUpperCase()} output downloaded.`);
    }
  });
});

document.querySelectorAll(".viewport-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".viewport-option").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    setViewport(Number(button.dataset.width), Number(button.dataset.height));
    if (state.sourceHtml) loadPreview();
  });
});

els.sampleDepth.addEventListener("input", () => {
  els.sampleDepthValue.textContent = `${els.sampleDepth.value} nodes`;
});

setViewport(1440, 960);
window.addEventListener("load", () => {
  if (window.lucide) window.lucide.createIcons();
});
