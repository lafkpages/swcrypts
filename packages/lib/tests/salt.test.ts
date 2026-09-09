/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import { generateRandomSalt, isValidSalt } from "../dist/crypto/salt";

describe("generateRandomSalt", () => {
  test("returns a 16-byte salt", () => {
    const salt = generateRandomSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt).toHaveLength(16);
  });

  test("returns different values on subsequent calls", () => {
    const salt1 = generateRandomSalt();
    const salt2 = generateRandomSalt();
    expect(salt1).not.toEqual(salt2);
  });
});

describe("isValidSalt", () => {
  test("accepts valid 32-character hex strings", () => {
    expect(isValidSalt(Uint8Array.fromHex("0123456789abcdef0123456789abcdef"))).toBe(true);
    expect(isValidSalt(Uint8Array.fromHex("abcdefABCDEF0123456789abcdef0123"))).toBe(true);
    expect(isValidSalt(Uint8Array.fromHex("00000000000000000000000000000000"))).toBe(true);
    expect(isValidSalt(Uint8Array.fromHex("ffffffffffffffffffffffffffffffff"))).toBe(true);
  });

  test("rejects salts that are too short", () => {
    expect(isValidSalt(Uint8Array.fromHex("0123456789abcdef0123456789abcd"))).toBe(false);
    expect(isValidSalt(Uint8Array.fromHex(""))).toBe(false);
  });

  test("rejects salts that are too long", () => {
    expect(isValidSalt(Uint8Array.fromHex("0123456789abcdef0123456789abcdef01"))).toBe(false);
  });
});
