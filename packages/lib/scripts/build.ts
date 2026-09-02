import { $, build } from "bun";
import { rm } from "node:fs/promises";
import { argv } from "node:process";

import { process } from "htmlnano";

import { exports } from "../package.json";

// Start clean
await rm("dist", { recursive: true, force: true });

await $`ln -f ../../README.md`;

// Build the wrapper page
const wrapperHtmlBuild = await build({
  entrypoints: ["./src/wrapper/index.html"],
  compile: true,
  minify: true,
});

// Minify the wrapper page's HTML
const wrapperHtmlMinified = await process(
  await wrapperHtmlBuild.outputs[0]!.text(),
  {
    collapseWhitespace: "aggressive",

    // CSS and JS are already minified by Bun
    minifyCss: false,
    minifyJs: false,

    // SVGs are not used in the wrapper page
    minifySvg: false,
  },
);

// Build the service worker
const swBuild = await build({
  entrypoints: ["./src/wrapper/sw/index.ts"],
  target: "browser",
  minify: true,
});

// Build the library and write it out
await build({
  entrypoints: Object.keys(exports).map((s) =>
    s === "." ? "./src/index.ts" : `./src/${s.slice(2)}.ts`,
  ),
  target: "browser",
  minify: true,
  outdir: "dist",
  format: "esm",
  files: {
    "./wrapper/index.html?raw": wrapperHtmlMinified.html,
    "./wrapper/sw/index.ts?raw": swBuild.outputs[0]!,
  },
  loader: {
    ".html?raw": "text",
    ".ts?raw": "text",
  },
});

// Check if types should be generated or not
const skipTypes = argv.includes("--skip-types");

if (!skipTypes) {
  // Generate type declarations for each entry point
  await $`bun run -b tsc`;
}
