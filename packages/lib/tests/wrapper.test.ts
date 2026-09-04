/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import { decryptData, hashPassword } from "../dist/crypto";
import {
  generateCryptoCheck,
  getServiceWorkerJs,
  getWrapperHtml,
} from "../dist/wrapper";

describe("getWrapperHtml", () => {
  const baseOptions = {
    cryptoCheck: new Uint8Array([1, 2, 3, 4, 5]),
    salt: "a".repeat(32),
  };

  test("includes the salt in the output", () => {
    const html = getWrapperHtml(baseOptions);
    expect(html).toInclude(baseOptions.salt);
  });

  test("includes the cryptoCheck as base64", () => {
    const html = getWrapperHtml(baseOptions);
    expect(html).toInclude(
      Buffer.from(baseOptions.cryptoCheck).toString("base64"),
    );
  });

  test("applies custom title and message", () => {
    const html = getWrapperHtml({
      ...baseOptions,
      title: "Custom Title",
      message: "Custom message here",
    });
    expect(html).toInclude("Custom Title");
    expect(html).toInclude("Custom message here");
  });

  test("injects custom styles when provided", () => {
    const html = getWrapperHtml({
      ...baseOptions,
      customStyles: "body { color: red; }",
    });
    expect(html).toInclude("body { color: red; }");
  });

  test("keeps attribution by default", () => {
    const html = getWrapperHtml(baseOptions);
    expect(html).toInclude("Powered by");
  });

  test("removes attribution when includeAttribution is false", () => {
    const html = getWrapperHtml({
      ...baseOptions,
      includeAttribution: false,
    });
    expect(html).not.toInclude("Powered by");
  });

  test("uses default title and message when not overridden", () => {
    const html = getWrapperHtml(baseOptions);
    expect(html).toInclude("This page is encrypted!");
    expect(html).toInclude("Please enter the password to view the content.");
  });
});

describe("getServiceWorkerJs", () => {
  test("returns a non-empty string", () => {
    const js = getServiceWorkerJs();
    expect(typeof js).toBe("string");
    expect(js.length).toBeGreaterThan(0);
  });
});

describe("generateCryptoCheck", () => {
  test("produces data decryptable with the same hashed password", async () => {
    const key = await hashPassword("test-password", "s".repeat(32));
    const check = await generateCryptoCheck(key);

    // Should not throw — valid ciphertext for this key
    const decrypted = await decryptData(check, key);
    expect(decrypted).toBeDefined();
  });

  test("fails to decrypt with a different key", async () => {
    const key1 = await hashPassword("password1", "s".repeat(32));
    const key2 = await hashPassword("password2", "s".repeat(32));
    const check = await generateCryptoCheck(key1);

    expect(decryptData(check, key2)).rejects.toThrow();
  });
});
