import type { WrapperOptions } from "@swcrypts/core/wrapper";
import type { BunFile } from "bun";

import { JSON5, JSONC } from "bun";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface SwCryptsConfig {
  password?: string;
  salt?: string;

  /**
   * @see {@link WrapperOptions["customStyles"]}
   */
  customStyles?: string;
}

async function findConfigFile(indir?: string) {
  let configFile: string | null = null;

  const files = await readdir(".");

  if (indir) {
    files.push(...(await readdir(indir)).map((file) => join(indir, file)));
  }

  for (const file of files) {
    if (/(?:^|\/)\.swcrypts.json[c5]?$/.test(file)) {
      if (configFile) {
        console.error(
          "Multiple config files found. Please ensure only one SwCrypts config file is present (.swcrypts.json, .swcrypts.json5, or .swcrypts.jsonc).",
        );
        process.exit(1);
      }

      configFile = file;
    }
  }

  return configFile;
}

export async function loadConfig(
  configPath?: string | null,
  indir?: string,
): Promise<[SwCryptsConfig, string | null]> {
  if (!configPath) {
    configPath = await findConfigFile(indir);
  }

  if (!configPath) {
    return [{}, null];
  }

  const configFile = Bun.file(configPath);
  const configFileType = configPath[configPath.length - 1]!;

  try {
    switch (configFileType) {
      case "5":
        // @ts-expect-error
        return [JSON5.parse(await configFile.text()), configPath];
      case "c":
        // @ts-expect-error
        return [JSONC.parse(await configFile.text()), configPath];
      default:
        return [await configFile.json(), configPath];
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      console.error(`Config file not found: ${configFile.name}`);
      process.exit(1);
    }

    console.error(`Error parsing config file ${configFile.name}:`, error);
    process.exit(1);
  }
}
