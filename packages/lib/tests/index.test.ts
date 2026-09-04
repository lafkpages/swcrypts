/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import {
  decryptData,
  deriveFilePathsKey,
  encryptData,
  encryptFilePath,
  hashPassword,
} from "../dist/crypto";

describe("hashPassword", () => {
  test("is deterministic for the same password and salt", async () => {
    const hash1 = await hashPassword("my-password", "a".repeat(32));
    const hash2 = await hashPassword("my-password", "a".repeat(32));
    expect(hash1).toBe(hash2);
  });

  test("produces different hashes for different passwords", async () => {
    const hash1 = await hashPassword("password1", "a".repeat(32));
    const hash2 = await hashPassword("password2", "a".repeat(32));
    expect(hash1).not.toBe(hash2);
  });

  test("produces different hashes for different salts", async () => {
    const hash1 = await hashPassword("my-password", "a".repeat(32));
    const hash2 = await hashPassword("my-password", "b".repeat(32));
    expect(hash1).not.toBe(hash2);
  });

  test("returns a 64-character hex string", async () => {
    const hash = await hashPassword("pw", "salt".padEnd(32, "0"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("encryptData", () => {
  test("prepends a 12-byte IV to the ciphertext", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const data = new TextEncoder().encode("hello");
    const encrypted = await encryptData(data, key);

    // IV (12 bytes) + ciphertext (at least something)
    expect(encrypted.length).toBeGreaterThan(12);
  });

  test("produces different output for identical input", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const data = new TextEncoder().encode("random content");

    const enc1 = await encryptData(data, key);
    const enc2 = await encryptData(data, key);

    expect(enc1).not.toEqual(enc2);
  });

  test("accepts string input by encoding it", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const encrypted = await encryptData("string input", key);
    expect(encrypted.length).toBeGreaterThan(12);
  });
});

describe("encryptFilePath", () => {
  test("returns a 64-character lowercase hex string", async () => {
    const key = await deriveFilePathsKey(
      await hashPassword("pw", "s".repeat(32)),
    );
    const encryptedPath = await encryptFilePath("index.html", key);

    expect(encryptedPath).toMatch(/^[0-9a-f]{64}\.swcrypts\.enc$/);
  });

  test("is deterministic for the same path and key", async () => {
    const key = await deriveFilePathsKey(
      await hashPassword("pw", "s".repeat(32)),
    );

    const path1 = await encryptFilePath("assets/logo.png", key);
    const path2 = await encryptFilePath("assets/logo.png", key);

    expect(path1).toBe(path2);
  });

  test("produces different paths for different inputs", async () => {
    const key1 = await deriveFilePathsKey(
      await hashPassword("pw", "s".repeat(32)),
    );
    const key2 = await deriveFilePathsKey(
      await hashPassword("other", "s".repeat(32)),
    );

    const path1 = await encryptFilePath("index.html", key1);
    const path2 = await encryptFilePath("about.html", key1);
    const path3 = await encryptFilePath("index.html", key2);

    expect(path1).not.toBe(path2);
    expect(path1).not.toBe(path3);
  });
});

describe("decryptData", () => {
  test("round-trips data encrypted with the same key", async () => {
    const key = await hashPassword("secret", "saltsaltsaltsaltsaltsaltsalt12");
    const plaintext = new TextEncoder().encode("hello world 🌍");

    const encrypted = await encryptData(plaintext, key);
    const decrypted = await decryptData(encrypted, key);

    expect(new TextDecoder().decode(decrypted)).toBe("hello world 🌍");
  });

  test("fails when decrypting with a wrong key", async () => {
    const correctKey = await hashPassword("correct", "s".repeat(32));
    const wrongKey = await hashPassword("wrong", "s".repeat(32));
    const plaintext = new TextEncoder().encode("secret");

    const encrypted = await encryptData(plaintext, correctKey);

    expect(decryptData(encrypted, wrongKey)).rejects.toThrow();
  });

  test("fails with corrupted ciphertext", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const plaintext = new TextEncoder().encode("data");

    const encrypted = new Uint8Array(await encryptData(plaintext, key));
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 0xff; // flip last byte

    expect(decryptData(encrypted, key)).rejects.toThrow();
  });

  test("fails with truncated data", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const encrypted = new Uint8Array(
      await encryptData(new TextEncoder().encode("x"), key),
    );

    expect(decryptData(encrypted.subarray(0, 5), key)).rejects.toThrow();
  });
});

describe("encrypt / decrypt integration", () => {
  test("handles empty data", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const data = new Uint8Array(0);

    const encrypted = await encryptData(data, key);
    const decrypted = await decryptData(encrypted, key);

    expect(new Uint8Array(decrypted)).toEqual(data);
  });

  test("handles large binary data", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const data = crypto.getRandomValues(new Uint8Array(1024 * 1024)); // 1 MB

    const encrypted = await encryptData(data, key);
    const decrypted = await decryptData(encrypted, key);

    expect(new Uint8Array(decrypted)).toEqual(data);
  });
});
