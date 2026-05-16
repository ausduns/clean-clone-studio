import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function rgbToHex(rgbStr) {
  if (!rgbStr || rgbStr === "rgba(0, 0, 0, 0)" || rgbStr === "transparent") return "";
  const rgba = rgbStr.match(/rgba?\(([^)]+)\)/i);
  if (!rgba) return rgbStr;
  const [r, g, b, a = "1"] = rgba[1].split(",").map(s => s.trim());
  if (Number(a) === 0) return "";
  const toHex = (n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Translates computed styles into Tailwind classes.
 */
function toTailwindClasses(style) {
  const classes = [];

  // Layout & Flexbox
  if (style.display === "flex") {
    classes.push("flex");
    if (style.flexDirection === "column") classes.push("flex-col");
    if (style.justifyContent && style.justifyContent !== "normal") classes.push(`justify-${style.justifyContent.replace('flex-', '')}`);
    if (style.alignItems && style.alignItems !== "normal") classes.push(`items-${style.alignItems.replace('flex-', '')}`);
    if (style.gap && style.gap !== "normal" && style.gap !== "0px") classes.push(`gap-[${style.gap}]`);
  }

  // Spacing (Simplified)
  if (style.padding && style.padding !== "0px") classes.push(`p-[${style.padding}]`);
  if (style.margin && style.margin !== "0px") classes.push(`m-[${style.margin}]`);

  // Typography
  if (style.fontSize && style.fontSize !== "16px") classes.push(`text-[${style.fontSize}]`);
  if (style.fontWeight && parseInt(style.fontWeight) > 400) classes.push(`font-[${style.fontWeight}]`);

  const colorHex = rgbToHex(style.color);
  if (colorHex && colorHex !== "#000000") classes.push(`text-[${colorHex}]`);

  // Appearance
  const bgHex = rgbToHex(style.backgroundColor);
  if (bgHex) classes.push(`bg-[${bgHex}]`);
  if (style.borderRadius && style.borderRadius !== "0px") classes.push(`rounded-[${style.borderRadius}]`);

  // Basic dimensions for images or specific blocks if needed, but flex handles most.
  // We avoid outputting rigid widths/heights for generic divs to allow flowing text.

  return classes.join(" ");
}

/**
 * Renders the structural tree into HTML.
 */
function renderTree(node, indent = 2) {
  if (!node) return "";

  const spaces = " ".repeat(indent);
  const classes = toTailwindClasses(node.style);
  const classAttr = classes ? ` class="${classes}"` : "";

  if (node.tagName === "img") {
    return `${spaces}<img src="${node.src || ''}" alt="${node.alt || ''}"${classAttr}>\n`;
  }

  // Use semantic tags based on class or structure in the future
  let tag = node.tagName === "body" ? "main" : node.tagName;

  let html = `${spaces}<${tag}${classAttr}>\n`;

  if (node.text) {
    html += `${spaces}  ${node.text}\n`;
  }

  for (const child of node.children) {
    html += renderTree(child, indent + 2);
  }

  html += `${spaces}</${tag}>\n`;
  return html;
}

export async function generateOutput(data, outputDir) {
  console.log("Generating HTML and Tailwind Config...");

  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, "assets"), { recursive: true });

  const bodyContent = renderTree(data);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Clean Clone</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {}
      }
    }
  </script>
</head>
<body class="m-0 bg-white">
${bodyContent}
  <script src="https://cdn.jsdelivr.net/npm/motion@11.11.13/dist/motion.js"></script>
  <script src="./script.js"></script>
</body>
</html>`;

  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {},
  },
  plugins: [],
}
`;

  const scriptJs = `// Initialize Motion One animations here\n// import { animate } from "motion";\n`;

  const stylesCss = `/* Custom CSS for patterns Tailwind can't express easily */\n`;

  await writeFile(join(outputDir, "index.html"), html, "utf-8");
  await writeFile(join(outputDir, "tailwind.config.js"), tailwindConfig, "utf-8");
  await writeFile(join(outputDir, "script.js"), scriptJs, "utf-8");
  await writeFile(join(outputDir, "styles.css"), stylesCss, "utf-8");

  console.log(`Generated ${outputDir}/index.html`);
  console.log(`Generated ${outputDir}/tailwind.config.js`);
  console.log(`Generated ${outputDir}/script.js`);
  console.log(`Generated ${outputDir}/styles.css`);
}
