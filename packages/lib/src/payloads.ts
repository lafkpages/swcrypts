import type { InferOutput } from "valibot";

import { nonEmpty, object, pipe, safeParse, string } from "valibot";

export interface PayloadVersion {
  major: number;
  minor: number;
}

export const FileMetadata = object({
  mimeType: pipe(string(), nonEmpty()),
});
export type FileMetadata = InferOutput<typeof FileMetadata>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function buildFilePayload(
  fileMetadata: FileMetadata,
  fileData: Uint8Array,
) {
  const encodedMetadata = encoder.encode(JSON.stringify(fileMetadata));

  const payload = new DataView(
    new ArrayBuffer(6 + encodedMetadata.length + fileData.length),
  );
  payload.setUint8(0, 1);
  payload.setUint8(1, 0);
  payload.setUint32(2, encodedMetadata.length);
  const payloadBytes = new Uint8Array(payload.buffer);
  payloadBytes.set(encodedMetadata, 6);
  payloadBytes.set(fileData, 6 + encodedMetadata.length);

  return payload.buffer;
}

export function decodeFilePayload(payloadView: DataView<ArrayBuffer>) {
  const payloadStart = payloadView.byteOffset + 6;
  const payloadEnd = payloadView.byteOffset + payloadView.byteLength;

  const metadataLength = payloadView.getUint32(2);
  const contentStart = payloadStart + metadataLength;
  const encodedMetadata = payloadView.buffer.slice(payloadStart, contentStart);

  let unvalidatedMetadata: unknown;
  try {
    unvalidatedMetadata = JSON.parse(decoder.decode(encodedMetadata));
  } catch {
    // The error must come from JSON.parse, as decoder.decode does not throw
    // at all since it is not in fatal mode. See:
    // https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/TextDecoder#fatal
    // https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/decode#exceptions
    throw new Error("Invalid JSON in metadata");
  }

  const parsedMetadata = safeParse(FileMetadata, unvalidatedMetadata);

  if (!parsedMetadata.success) {
    throw new Error("Invalid metadata", { cause: parsedMetadata.issues });
  }

  const metadata = parsedMetadata.output;
  const content = payloadView.buffer.slice(contentStart, payloadEnd);

  return { metadata, content };
}
