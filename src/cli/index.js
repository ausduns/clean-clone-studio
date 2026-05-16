#!/usr/bin/env node

import { Command } from "commander";
import { runExtraction } from "../core/extractor.js";
import { generateOutput } from "../emitters/html-tailwind.js";
import { verifyClone } from "../verification/index.js";

const program = new Command();

program
  .name("clean-clone")
  .description("Convert a Framer or Webflow URL to pure HTML/Tailwind")
  .version("1.0.0");

program
  .argument("<url>", "The URL to clone")
  .option("-o, --output <dir>", "Output directory", "./output")
  .action(async (url, options) => {
    try {
      console.log(`Starting clean clone of: ${url}`);
      console.log(`Output directory: ${options.output}`);

      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Only http:// and https:// URLs are supported.");
      }

      const extractionData = await runExtraction(parsedUrl.href);
      await generateOutput(extractionData, options.output);

      // Verification Gate
      await verifyClone(parsedUrl.href, options.output);

      console.log("Clone complete!");
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
