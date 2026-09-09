export function generateRandomSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function isValidSalt(salt: Uint8Array<ArrayBuffer>) {
  return salt.byteLength === 16;
}
