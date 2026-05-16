import { chromium } from "playwright";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";

export async function verifyClone(originalUrl, outputDir) {
  console.log(`Verifying clone against original URL: ${originalUrl}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const originalPage = await context.newPage();
  console.log("Taking screenshot of original...");
  await originalPage.goto(originalUrl, { waitUntil: "networkidle" });
  await originalPage.waitForTimeout(2000); // Give Framer/Webflow a moment for animations
  await originalPage.screenshot({ path: resolve(outputDir, "original.png"), fullPage: true });

  const clonedPage = await context.newPage();
  console.log("Taking screenshot of clone...");

  // We need to serve the output dir or load it directly.
  // For simplicity here, we can use a file:// URL if the paths are absolute,
  // but since we rely on CDN for Tailwind it should work with a local file.
  const indexPath = resolve(outputDir, "index.html");

  try {
    await stat(indexPath);
  } catch (e) {
    console.error(`Error: Cloned index.html not found at ${indexPath}`);
    await browser.close();
    process.exit(1);
  }

  await clonedPage.goto(`file://${indexPath}`, { waitUntil: "networkidle" });
  await clonedPage.waitForTimeout(1000); // Wait for Tailwind CDN and fonts
  await clonedPage.screenshot({ path: resolve(outputDir, "clone.png"), fullPage: true });

  console.log("Screenshots captured. In a real pipeline, we would run pixelmatch here to calculate the diff.");
  console.log(`Original: ${resolve(outputDir, "original.png")}`);
  console.log(`Clone: ${resolve(outputDir, "clone.png")}`);

  await browser.close();
}
