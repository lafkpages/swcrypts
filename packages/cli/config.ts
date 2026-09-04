import type { WrapperOptions } from "@swcrypts/core/wrapper";

import { JSON5, JSONC } from "bun";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface SwCryptsConfig extends Omit<
  WrapperOptions,
  "basePath" | "cryptoCheck" | "salt"
> {
  $schema?: string;

  basePath?: string;

  password?: string;
  salt?: string;

  /**
   * Path to a CSS file to override the default styling of SwCrypts' password
   * prompt page. Note that the contents of this file are **NOT sanitised**
   * and are injected directly into the wrapper HTML.
   *
   * To see what can be styled, refer to the [wrapper HTML template](
   * https://github.com/lafkpages/swcrypts/blob/main/packages/lib/wrapper/index.html).
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
    if (/(?:^|\/)\.swcrypts\.json[c5]?$/.test(file)) {
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

export const defaultConfig = {
  basePath: "/",
};
export type ResolvedConfig = SwCryptsConfig &
  Required<Pick<SwCryptsConfig, keyof typeof defaultConfig>>;

// TODO: use Valibot or Zod to actually validate config

export async function loadConfig(
  configPath?: string | null,
  indir?: string,
): Promise<[ResolvedConfig, string | null]> {
  if (!configPath) {
    configPath = await findConfigFile(indir);
  }

  if (!configPath) {
    return [defaultConfig, null];
  }

  const configFile = Bun.file(configPath);
  const configFileType = configPath[configPath.length - 1]!;

  let config: ResolvedConfig = defaultConfig;

  try {
    switch (configFileType) {
      case "5":
        // @ts-expect-error
        config = { ...config, ...JSON5.parse(await configFile.text()) };
        break;
      case "c":
        // @ts-expect-error
        config = { ...config, ...JSONC.parse(await configFile.text()) };
        break;
      default:
        config = { ...config, ...(await configFile.json()) };
        break;
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

  return [config, configPath];
}
