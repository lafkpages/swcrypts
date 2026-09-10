import { $, build } from "bun";
import assert from "node:assert";
import { rm } from "node:fs/promises";
import { argv } from "node:process";

import { process } from "htmlnano";

import { exports } from "../package.json";

// Check flags
const shouldGenerateTypes = !argv.includes("--skip-types");
const shouldWriteWrapper = !argv.includes("--skip-wrapper");

// Start clean
await rm("dist", { recursive: true, force: true });

await $`ln -f ../../README.md`;

// Build the wrapper page
const wrapperHtmlBuild = await build({
  entrypoints: ["./src/wrapper/index.html"],
  compile: true,
  minify: true,
});
assert(
  wrapperHtmlBuild.outputs.length === 1,
  "Expected exactly one build output for the wrapper page",
);
const wrapperHtmlOutput = wrapperHtmlBuild.outputs[0]!;

// Minify the wrapper page's HTML
const { html: wrapperHtmlMinified } = await process(await wrapperHtmlOutput.text(), {
  collapseWhitespace: "aggressive",

  // CSS and JS are already minified by Bun
  minifyCss: false,
  minifyJs: false,

  // SVGs are not used in the wrapper page
  minifySvg: false,
});

// Write the wrapper HTML to disk
if (shouldWriteWrapper) {
  await Bun.write("./dist-wrapper/wrapper.html", wrapperHtmlMinified);
}

// Build the service worker
const swJsBuild = await build({
  entrypoints: ["./src/wrapper/sw/index.ts"],
  target: "browser",
  minify: true,
});
assert(swJsBuild.outputs.length === 1, "Expected exactly one build output for the service worker");
const swJsOutput = swJsBuild.outputs[0]!;

// Write the service worker to disk
if (shouldWriteWrapper) {
  await Bun.write("./dist-wrapper/sw.js", swJsOutput);
}

// Build the library and write it out
await build({
  entrypoints: Object.entries(exports).map(([, entrypoint]) =>
    entrypoint.default.replace(/^\.\/dist\//, "./src/").replace(/\.js$/, ".ts"),
  ),
  target: "browser",
  minify: true,
  outdir: "dist",
  format: "esm",
  files: {
    "./wrapper/index.html?raw": wrapperHtmlMinified,
    "./wrapper/sw/index.ts?raw": swJsOutput,
  },
  loader: {
    ".html?raw": "text",
    ".ts?raw": "text",
  },
});

if (shouldGenerateTypes) {
  // Generate type declarations for each entry point
  await $`bun run -b tsc`;
}
