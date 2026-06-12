import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

let baseDir: string;
let inputDir: string;
let outputDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "swcrypts-test-"));
  inputDir = join(baseDir, "in");
  outputDir = join(baseDir, "out");

  mkdirSync(inputDir, { recursive: true });

  writeFileSync(join(inputDir, "index.html"), "<h1>Hello</h1>");
  writeFileSync(join(inputDir, "style.css"), "body { color: red; }");
  writeFileSync(join(inputDir, "app.js"), "console.log('hi');");
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe("build command", () => {
  test("encrypts a static site and produces expected outputs", async () => {
    const result = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "index.ts",
        "build",
        "-i",
        inputDir,
        "-o",
        outputDir,
        "-p",
        "test-password",
        "-s",
        "0123456789abcdef0123456789abcdef",
      ],
      cwd: join(import.meta.dir, ".."),
    });

    if (result.exitCode !== 0) {
      console.error("CLI stderr:", result.stderr.toString());
    }

    expect(result.exitCode).toBe(0);

    // Entry point should be the wrapper HTML, not the original content
    const indexHtml = await Bun.file(join(outputDir, "index.html")).text();
    expect(indexHtml).toInclude("This page is encrypted!");
    expect(indexHtml).not.toInclude("<h1>Hello</h1>");

    // Service worker should exist
    expect(await Bun.file(join(outputDir, "__swcrypts_sw.js")).exists()).toBe(
      true,
    );

    // Every input file should have a corresponding .swcrypts.enc file
    const allFiles = readdirSync(outputDir);
    const encFiles = allFiles.filter((f) => f.endsWith(".swcrypts.enc"));
    expect(encFiles.length).toBe(3);
  });

  test("refuses to proceed with an invalid salt", () => {
    const badOutput = join(baseDir, "out-bad");

    const result = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "index.ts",
        "build",
        "-i",
        inputDir,
        "-o",
        badOutput,
        "-p",
        "pw",
        "-s",
        "not-a-valid-salt",
      ],
      cwd: join(import.meta.dir, ".."),
    });

    expect(result.exitCode).not.toBe(0);
  });
});
