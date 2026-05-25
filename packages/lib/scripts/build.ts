/// <reference types="bun" />

import { $, build, write } from "bun";
import { rm } from "node:fs/promises";
import { argv } from "node:process";

import { process } from "htmlnano";

await rm("dist", { recursive: true, force: true });

await $`ln -f ../../README.md`;

const wrapperHtmlBuild = await build({
  entrypoints: ["./wrapper/index.html"],
  compile: true,
  target: "browser",
  minify: true,
  loader: {
    ".html": "html",
  },
});

const wrapperHtmlMinified = await process(
  await wrapperHtmlBuild.outputs[0]!.text(),
  {
    collapseWhitespace: "aggressive",

    // CSS and JS are already minified by Bun
    minifyCss: false,
    minifyJs: false,

    minifySvg: false,
  },
);
await write("./wrapper-dist/index.html", wrapperHtmlMinified.html);

await build({
  entrypoints: ["./wrapper/sw/index.ts"],
  target: "browser",
  minify: true,
  outdir: "wrapper-dist",
});

const libExports = ["index.ts", "files.ts", "hex.ts", "salt.ts", "wrapper.ts"];

await build({
  entrypoints: libExports,
  target: "browser",
  minify: true,
  outdir: "dist",
  format: "esm",
});

const skipTypes = argv.includes("--skip-types");

if (!skipTypes) {
  // Generate bundled type declarations for each entry point
  for (const entry of libExports) {
    const outFile = entry.replace(".ts", ".d.ts");
    await $`bun run -b dts-bundle-generator --no-check -o dist/${outFile} ${entry}`.quiet();
  }
}
