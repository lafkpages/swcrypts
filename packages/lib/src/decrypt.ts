import type { PayloadVersion } from "./payloads";

import { decryptData } from "./crypto";

export async function decryptFile(
  encryptedData: Uint8Array<ArrayBuffer>,
  hashedPassword: string,
) {
  const payload = await decryptData(encryptedData, hashedPassword);

  if (payload.byteLength < 2) {
    throw new Error("Decrypted payload is too short");
  }

  const payloadView = new DataView(payload);

  const payloadVersion: PayloadVersion = {
    major: payloadView.getUint8(0),
    minor: payloadView.getUint8(1),
  };

  return { payloadVersion, payloadView };
}
