import { bytesToHexString } from "./hex";

export function generateRandomSalt() {
  return bytesToHexString(crypto.getRandomValues(new Uint8Array(16)));
}

export function isValidSalt(salt: string) {
  return /^[0-9a-fA-F]{32}$/.test(salt);
}
