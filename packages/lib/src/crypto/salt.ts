export function generateRandomSalt() {
  return crypto.getRandomValues(new Uint8Array(16)).toHex();
}

export function isValidSalt(salt: string) {
  return /^[0-9a-fA-F]{32}$/.test(salt);
}
