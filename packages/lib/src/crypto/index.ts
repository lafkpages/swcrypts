const encoder = new TextEncoder();

export async function encrypt(
  data: string | BufferSource,
  hashedPassword: string,
) {
  if (typeof data === "string") {
    data = encoder.encode(data);
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));

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

/**
 * Needed for {@link encryptFilePath}.
 */
export async function deriveFilePathsKey(hashedPassword: string) {
  const master = await crypto.subtle.importKey(
    "raw",
    Uint8Array.fromHex(hashedPassword),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: encoder.encode("swcrypts-paths"),
    },
    master,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * @param filePathsKey The key used to encrypt the file path with, derived via {@link deriveFilePathsKey}.
 */
export async function encryptFilePath(
  filePath: string,
  filePathsKey: CryptoKey,
) {
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", filePathsKey, encoder.encode(filePath)),
  ).toHex();
}
