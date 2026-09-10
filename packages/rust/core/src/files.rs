use std::path::{Path, PathBuf};

/// Drops system junk files, hidden files, and anything under a hidden
/// directory. Input should be paths relative to the input directory.
pub fn filter_ignored_files(files: Vec<PathBuf>) -> Vec<PathBuf> {
    files.into_iter().filter(|file| !is_ignored(file)).collect()
}

fn is_ignored(path: &Path) -> bool {
    path.components().any(|component| {
        let segment = component.as_os_str().to_string_lossy();

        // Ignore system files
        if segment == ".DS_Store" || segment == "Thumbs.db" {
            return true;
        }

        // Ignore hidden files and directories
        segment.starts_with('.')
    })
}

/// For now, treat all HTML files as entry points.
pub fn file_is_entry_point(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext == "html")
}
