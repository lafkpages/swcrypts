import { describe, expect, test } from "bun:test";

import { generateRandomSalt, isValidSalt } from "../salt";

describe("generateRandomSalt", () => {
  test("returns a 32-character lowercase hex string", () => {
    const salt = generateRandomSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  test("returns different values on subsequent calls", () => {
    const salt1 = generateRandomSalt();
    const salt2 = generateRandomSalt();
    expect(salt1).not.toBe(salt2);
  });
});

describe("isValidSalt", () => {
  test("accepts valid 32-character hex strings", () => {
    expect(isValidSalt("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isValidSalt("abcdefABCDEF0123456789abcdef0123")).toBe(true);
    expect(isValidSalt("00000000000000000000000000000000")).toBe(true);
    expect(isValidSalt("ffffffffffffffffffffffffffffffff")).toBe(true);
  });

  test("rejects salts that are too short", () => {
    expect(isValidSalt("0123456789abcdef0123456789abcde")).toBe(false);
    expect(isValidSalt("")).toBe(false);
  });

  test("rejects salts that are too long", () => {
    expect(isValidSalt("0123456789abcdef0123456789abcdef0")).toBe(false);
  });

  test("rejects salts with non-hex characters", () => {
    expect(isValidSalt("gggggggggggggggggggggggggggggggg")).toBe(false);
    expect(isValidSalt("0123456789abcdef0123456789abcdeg")).toBe(false);
    expect(isValidSalt("0123456789abcdef 0123456789abcdef")).toBe(false);
  });
});
