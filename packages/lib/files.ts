export function filterIgnoredFiles(files: string[]) {
  return files.filter((file) => {
    const segments = file.split(/[\\/]/);

    return segments.every((segment) => {
      // Ignore system files
      if (segment === ".DS_Store" || segment === "Thumbs.db") {
        return false;
      }

      // Ignore hidden files and directories
      if (segment.startsWith(".")) {
        return false;
      }

      return true;
    });
  });
}

export function fileIsEntryPoint(filePath: string) {
  // For now, treat all HTML files as entry points
  return filePath.endsWith(".html");
}
