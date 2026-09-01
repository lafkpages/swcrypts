import type { InferOutput } from "valibot";

import { nonEmpty, object, pipe, string } from "valibot";

export const FileMetadata = object({
  mimeType: pipe(string(), nonEmpty()),
});
export type FileMetadata = InferOutput<typeof FileMetadata>;
