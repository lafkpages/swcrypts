import { describe, expect, test } from "bun:test";

import { fileIsEntryPoint, filterIgnoredFiles } from "../src/files";

describe("filterIgnoredFiles", () => {
  test("preserves normal static assets", () => {
    const input = ["index.html", "style.css", "app.js", "image.png"];
    expect(filterIgnoredFiles(input)).toEqual(input);
  });

  test("filters hidden files and directories", () => {
    expect(filterIgnoredFiles([".env", ".git/config", "file.txt"])).toEqual([
      "file.txt",
    ]);
    expect(filterIgnoredFiles(["assets/.hidden", "assets/normal.css"])).toEqual(
      ["assets/normal.css"],
    );
  });

  test("filters system files", () => {
    expect(filterIgnoredFiles([".DS_Store", "Thumbs.db", "photo.jpg"])).toEqual(
      ["photo.jpg"],
    );
  });

  test("filters nested system and hidden files", () => {
    const input = [
      "public/index.html",
      "public/.DS_Store",
      "public/images/Thumbs.db",
      "public/.gitignore",
      "public/favicon.ico",
    ];
    expect(filterIgnoredFiles(input)).toEqual([
      "public/index.html",
      "public/favicon.ico",
    ]);
  });

  test("handles Windows-style paths", () => {
    expect(
      filterIgnoredFiles(["public\\.DS_Store", "public\\index.html"]),
    ).toEqual(["public\\index.html"]);
  });
});

describe("fileIsEntryPoint", () => {
  test("returns true for HTML files", () => {
    expect(fileIsEntryPoint("index.html")).toBe(true);
    expect(fileIsEntryPoint("pages/about.html")).toBe(true);
    expect(fileIsEntryPoint("nested/deep/path.html")).toBe(true);
  });

  test("returns false for non-HTML files", () => {
    expect(fileIsEntryPoint("style.css")).toBe(false);
    expect(fileIsEntryPoint("app.js")).toBe(false);
    expect(fileIsEntryPoint("image.png")).toBe(false);
    expect(fileIsEntryPoint("data.json")).toBe(false);
  });
});
