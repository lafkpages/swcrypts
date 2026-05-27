export const serviceWorkerFileName = "__swcrypts_sw.js";

const encoder = new TextEncoder();

export async function encrypt(
  data: BufferSource,
  hashedPassword: string,
  deterministic = false,
) {
  if (typeof data === "string") {
    data = encoder.encode(data);
  }

  const iv = deterministic
    ? new Uint8Array((await crypto.subtle.digest("SHA-256", data)).slice(0, 12))
    : crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      await crypto.subtle.importKey(
        "raw",
        Uint8Array.fromHex(hashedPassword),
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
      Uint8Array.fromHex(hashedPassword),
      "AES-GCM",
      false,
      ["decrypt"],
    ),
    encryptedData.subarray(12),
  );
}

export async function hashPassword(password: string, salt: string) {
  return new Uint8Array(
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
  ).toHex();
}
