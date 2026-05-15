await Bun.build({
  entrypoints: ["src/cli/wrapper/index.html"],
  compile: true,
  target: "browser",
  minify: true,
  outdir: "dist/wrapper",
  loader: {
    ".html": "html",
  },
});

await Bun.build({
  entrypoints: ["src/cli/wrapper/sw.ts"],
  target: "browser",
  minify: true,
  outdir: "dist/wrapper",
});
