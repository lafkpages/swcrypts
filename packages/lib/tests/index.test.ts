/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import {
  decryptData,
  deriveFilePathsKey,
  encryptData,
  encryptFilePath,
  hashPassword,
} from "../dist/crypto";

const SALT = Uint8Array.fromHex("ab".repeat(16));
const SALT_A = Uint8Array.fromHex("aa".repeat(16));
const SALT_B = Uint8Array.fromHex("bb".repeat(16));

describe("hashPassword", () => {
  test("is deterministic for the same password and salt", async () => {
    const hash1 = await hashPassword("my-password", SALT_A);
    const hash2 = await hashPassword("my-password", SALT_A);
    expect(hash1).toEqual(hash2);
  });

  test("produces different hashes for different passwords", async () => {
    const hash1 = await hashPassword("password1", SALT_A);
    const hash2 = await hashPassword("password2", SALT_A);
    expect(hash1).not.toEqual(hash2);
  });

  test("produces different hashes for different salts", async () => {
    const hash1 = await hashPassword("my-password", SALT_A);
    const hash2 = await hashPassword("my-password", SALT_B);
    expect(hash1).not.toEqual(hash2);
  });

  test("returns 32 bytes of key material", async () => {
    const hash = await hashPassword("pw", SALT);
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash).toHaveLength(32);
  });
});

describe("encryptData", () => {
  test("prepends a 12-byte IV to the ciphertext", async () => {
    const key = await hashPassword("pw", SALT);
    const data = new TextEncoder().encode("hello");
    const encrypted = await encryptData(data, key);

    // IV (12 bytes) + ciphertext (at least something)
    expect(encrypted.length).toBeGreaterThan(12);
  });

  test("produces different output for identical input", async () => {
    const key = await hashPassword("pw", SALT);
    const data = new TextEncoder().encode("random content");

    const enc1 = await encryptData(data, key);
    const enc2 = await encryptData(data, key);

    expect(enc1).not.toEqual(enc2);
  });

  test("accepts string input by encoding it", async () => {
    const key = await hashPassword("pw", SALT);
    const encrypted = await encryptData("string input", key);
    expect(encrypted.length).toBeGreaterThan(12);
  });
});

describe("encryptFilePath", () => {
  test("returns a 64-character lowercase hex string", async () => {
    const key = await deriveFilePathsKey(await hashPassword("pw", SALT));
    const encryptedPath = await encryptFilePath("index.html", key);

    expect(encryptedPath).toMatch(/^[0-9a-f]{64}\.swcrypts\.enc$/);
  });

  test("is deterministic for the same path and key", async () => {
    const key = await deriveFilePathsKey(await hashPassword("pw", SALT));

    const path1 = await encryptFilePath("assets/logo.png", key);
    const path2 = await encryptFilePath("assets/logo.png", key);

    expect(path1).toBe(path2);
  });

  test("produces different paths for different inputs", async () => {
    const key1 = await deriveFilePathsKey(await hashPassword("pw", SALT));
    const key2 = await deriveFilePathsKey(await hashPassword("other", SALT));

    const path1 = await encryptFilePath("index.html", key1);
    const path2 = await encryptFilePath("about.html", key1);
    const path3 = await encryptFilePath("index.html", key2);

    expect(path1).not.toBe(path2);
    expect(path1).not.toBe(path3);
  });
});

describe("decryptData", () => {
  test("round-trips data encrypted with the same key", async () => {
    const key = await hashPassword("secret", SALT);
    const plaintext = new TextEncoder().encode("hello world 🌍");

    const encrypted = await encryptData(plaintext, key);
    const decrypted = await decryptData(encrypted, key);

    expect(new TextDecoder().decode(decrypted)).toBe("hello world 🌍");
  });

  test("fails when decrypting with a wrong key", async () => {
    const correctKey = await hashPassword("correct", SALT);
    const wrongKey = await hashPassword("wrong", SALT);
    const plaintext = new TextEncoder().encode("secret");

    const encrypted = await encryptData(plaintext, correctKey);

    expect(decryptData(encrypted, wrongKey)).rejects.toThrow();
  });

  test("fails with corrupted ciphertext", async () => {
    const key = await hashPassword("pw", SALT);
    const plaintext = new TextEncoder().encode("data");

    const encrypted = new Uint8Array(await encryptData(plaintext, key));
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 0xff; // flip last byte

    expect(decryptData(encrypted, key)).rejects.toThrow();
  });

  test("fails with truncated data", async () => {
    const key = await hashPassword("pw", SALT);
    const encrypted = new Uint8Array(await encryptData(new TextEncoder().encode("x"), key));

    expect(decryptData(encrypted.subarray(0, 5), key)).rejects.toThrow();
  });
});

describe("encrypt / decrypt integration", () => {
  test("handles empty data", async () => {
    const key = await hashPassword("pw", SALT);
    const data = new Uint8Array(0);

    const encrypted = await encryptData(data, key);
    const decrypted = await decryptData(encrypted, key);

    expect(new Uint8Array(decrypted)).toEqual(data);
  });

  test("handles large binary data", async () => {
    const key = await hashPassword("pw", SALT);
    const data = crypto.getRandomValues(new Uint8Array(1024 * 1024)); // 1 MB

    const encrypted = await encryptData(data, key);
    const decrypted = await decryptData(encrypted, key);

    expect(new Uint8Array(decrypted)).toEqual(data);
  });
});
