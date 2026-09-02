import { describe, expect, test } from "bun:test";

import { decrypt, encrypt, hashPassword } from "../dist";

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

describe("encrypt", () => {
  test("prepends a 12-byte IV to the ciphertext", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const data = new TextEncoder().encode("hello");
    const encrypted = await encrypt(data, key);

    // IV (12 bytes) + ciphertext (at least something)
    expect(encrypted.length).toBeGreaterThan(12);
  });

  test("deterministic mode produces identical output for identical input", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const data = new TextEncoder().encode("deterministic content");

    const enc1 = await encrypt(data, key, true);
    const enc2 = await encrypt(data, key, true);

    expect(enc1).toEqual(enc2);
  });

  test("non-deterministic mode produces different output for identical input", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const data = new TextEncoder().encode("random content");

    const enc1 = await encrypt(data, key, false);
    const enc2 = await encrypt(data, key, false);

    expect(enc1).not.toEqual(enc2);
  });

  test("accepts string input by encoding it", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const encrypted = await encrypt("string input", key);
    expect(encrypted.length).toBeGreaterThan(12);
  });
});

describe("decrypt", () => {
  test("round-trips data encrypted with the same key", async () => {
    const key = await hashPassword("secret", "saltsaltsaltsaltsaltsaltsalt12");
    const plaintext = new TextEncoder().encode("hello world 🌍");

    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);

    expect(new TextDecoder().decode(decrypted)).toBe("hello world 🌍");
  });

  test("fails when decrypting with a wrong key", async () => {
    const correctKey = await hashPassword("correct", "s".repeat(32));
    const wrongKey = await hashPassword("wrong", "s".repeat(32));
    const plaintext = new TextEncoder().encode("secret");

    const encrypted = await encrypt(plaintext, correctKey);

    expect(decrypt(encrypted, wrongKey)).rejects.toThrow();
  });

  test("fails with corrupted ciphertext", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const plaintext = new TextEncoder().encode("data");

    const encrypted = new Uint8Array(await encrypt(plaintext, key));
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 0xff; // flip last byte

    expect(decrypt(encrypted, key)).rejects.toThrow();
  });

  test("fails with truncated data", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const encrypted = new Uint8Array(
      await encrypt(new TextEncoder().encode("x"), key),
    );

    expect(decrypt(encrypted.subarray(0, 5), key)).rejects.toThrow();
  });
});

describe("encrypt / decrypt integration", () => {
  test("handles empty data", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const data = new Uint8Array(0);

    const encrypted = await encrypt(data, key);
    const decrypted = await decrypt(encrypted, key);

    expect(new Uint8Array(decrypted)).toEqual(data);
  });

  test("handles large binary data", async () => {
    const key = await hashPassword("pw", "s".repeat(32));
    const data = crypto.getRandomValues(new Uint8Array(1024 * 1024)); // 1 MB

    const encrypted = await encrypt(data, key);
    const decrypted = await decrypt(encrypted, key);

    expect(new Uint8Array(decrypted)).toEqual(data);
  });
});
