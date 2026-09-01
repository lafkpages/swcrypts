import { $, build, JSON5, write } from "bun";
import { rm } from "node:fs/promises";
import { argv } from "node:process";

import { process } from "htmlnano";

import { exports } from "../package.json";

// Start clean
await rm("dist", { recursive: true, force: true });
await rm("dist-wrapper", { recursive: true, force: true });

await $`ln -f ../../README.md`;

// Build the wrapper page
const wrapperHtmlBuild = await build({
  entrypoints: ["./src/wrapper/index.html"],
  compile: true,
  target: "browser",
  minify: true,
  loader: {
    ".html": "html",
  },
});

// Minify the wrapper page's HTML and write it out
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
await write(
  "./dist-wrapper/html.ts",
  `export default ${JSON5.stringify(wrapperHtmlMinified.html)};`,
);

// Build the service worker and write it out
const swBuild = await build({
  entrypoints: ["./src/wrapper/sw/index.ts"],
  target: "browser",
  minify: true,
});
await write(
  "./dist-wrapper/sw.ts",
  `export default ${JSON5.stringify(await swBuild.outputs[0]!.text())};`,
);

// Build the library and write it out
const libExports = Object.keys(exports).map((s) =>
  s === "." ? "src/index.ts" : `src/${s.slice(2)}.ts`,
);
await build({
  entrypoints: libExports,
  target: "browser",
  minify: true,
  outdir: "dist",
  format: "esm",
});

// Check if types should be generated or not
const skipTypes = argv.includes("--skip-types");

if (!skipTypes) {
  // Generate bundled type declarations for each entry point
  for (const entry of libExports) {
    await $`bun run -b tsc --ignoreConfig --lib esnext,dom --module preserve --declaration --emitDeclarationOnly ${entry} --outDir dist`.quiet();
  }

  // Remove unneeded types (TODO: how do we avoid generating them in the first place?)
  await rm("dist/src", { recursive: true, force: true });
  await rm("dist/dist-wrapper", { recursive: true, force: true });
}
