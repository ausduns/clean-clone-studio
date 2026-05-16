import { chromium } from "playwright";

/**
 * Extracts the computed layout, styles, and text from the live page.
 * This will eventually hook into designlang's core extraction logic.
 */
export async function runExtraction(url) {
  console.log("Launching headless browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to URL...");
  await page.goto(url, { waitUntil: "networkidle" });

  console.log("Extracting DOM and computed styles...");

  // This is a simplified scaffold of the extraction engine.
  // We extract basic elements and text, looking at their display/flex properties
  // rather than just absolute bounds.
  const data = await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const computed = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        computed.display !== "none" &&
        computed.visibility !== "hidden" &&
        computed.opacity !== "0"
      );
    };

    const extractNode = (el) => {
      if (!isVisible(el)) return null;

      const computed = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      const nodeData = {
        tagName: el.tagName.toLowerCase(),
        text: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.textContent.trim() : "",
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
        nodeData.src = el.src;
        nodeData.alt = el.alt;
      }

      for (const child of el.children) {
        const childData = extractNode(child);
        if (childData) {
          nodeData.children.push(childData);
        }
      }

      return nodeData;
    };

    // We start from body but ideally would skip some wrapper divs if they are pure bloat
    return extractNode(document.body);
  });

  await browser.close();
  return data;
}
