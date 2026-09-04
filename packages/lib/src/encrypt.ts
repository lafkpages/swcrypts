import { encryptData, encryptFilePath } from "./crypto";
import { fileIsEntryPoint } from "./files";
import { buildFilePayload } from "./payloads";

export async function encryptFile(
  file: Blob,
  relativeFilePath: string,
  hashedPassword: string,
  filePathsKey: CryptoKey,
) {
  const payload = buildFilePayload({ mimeType: file.type }, await file.bytes());

  const isEntryPoint = fileIsEntryPoint(relativeFilePath);

  const encryptedData = await encryptData(payload, hashedPassword);
  const encryptedPath = await encryptFilePath(relativeFilePath, filePathsKey);

  return {
    isEntryPoint,
    encryptedData,
    encryptedPath,
  };
}
