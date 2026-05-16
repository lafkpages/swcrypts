import { JSON5, JSONC, type BunFile } from "bun";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface SwCryptsConfig {
  password?: string;
  salt?: string;
}

async function findConfigFile(indir?: string) {
  let configFile: BunFile | null = null;

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

      configFile = Bun.file(file);
    }
  }

  return configFile;
}

export async function loadConfig(
  configPath?: string,
  indir?: string,
): Promise<SwCryptsConfig> {
  const configFile = configPath
    ? Bun.file(configPath)
    : await findConfigFile(indir);

  if (!configFile) {
    return {};
  }

  const type = configFile.name![configFile.name!.length - 1];

  try {
    switch (type) {
      case "5":
        // @ts-expect-error
        return JSON5.parse(await configFile.text());
      case "c":
        // @ts-expect-error
        return JSONC.parse(await configFile.text());
      default:
        return await configFile.json();
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
