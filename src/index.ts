import { bytesToHexString, hexStringToBytes } from "./hex";

const encoder = new TextEncoder();

export async function encrypt(
  data: Uint8Array<ArrayBuffer>,
  hashedPassword: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      await crypto.subtle.importKey(
        "raw",
        hexStringToBytes(hashedPassword),
        "AES-GCM",
        false,
        ["encrypt"],
      ),
      data,
    ),
  );

  const result = new Uint8Array(iv.length + ciphertext.length);
  result.set(iv, 0);
  result.set(ciphertext, iv.length);
  return result;
}

export async function decrypt(
  encryptedData: Uint8Array<ArrayBuffer>,
  hashedPassword: string,
) {
  return await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: encryptedData.subarray(0, 12),
    },
    await crypto.subtle.importKey(
      "raw",
      hexStringToBytes(hashedPassword),
      "AES-GCM",
      false,
      ["decrypt"],
    ),
    encryptedData.subarray(12),
  );
}

export async function hashPassword(password: string, salt: string) {
  return bytesToHexString(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          iterations: 600_000,
          salt: encoder.encode(salt),
        },
        await crypto.subtle.importKey(
          "raw",
          encoder.encode(password),
          "PBKDF2",
          false,
          ["deriveBits"],
        ),
        256,
      ),
    ),
  );
}

export function generateRandomSalt() {
  return bytesToHexString(crypto.getRandomValues(new Uint8Array(16)));
}
