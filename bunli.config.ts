import { defineConfig } from "@bunli/core";

import { description, version } from "./package.json";

export default defineConfig({
  name: "swcrypts",
  version,
  description,
  commands: {
    entry: "./src/cli/index.ts",
    directory: "./src/cli/commands",
  },
});
