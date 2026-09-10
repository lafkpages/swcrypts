use std::{
    fs::{self, read_to_string},
    path::{Path, PathBuf},
};

use serde::Deserialize;

#[derive(Debug, Default, Deserialize)]
pub struct Config {
    pub base_path: Option<String>,

    pub password: Option<String>,
    pub salt: Option<String>,

    pub custom_styles: Option<String>,
}

#[derive(Debug)]
pub enum ConfigError {
    ReadDir {
        path: PathBuf,
        source: std::io::Error,
    },
    Read {
        path: PathBuf,
        source: std::io::Error,
    },
    Parse {
        path: PathBuf,
        source: json5::Error,
    },
    MultipleConfigFiles,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::ReadDir { path, .. } => {
                write!(f, "failed to read directory {}", path.display())
            }
            ConfigError::Read { path, .. } => {
                write!(f, "failed to read config file {}", path.display())
            }
            ConfigError::Parse { path, .. } => {
                write!(f, "failed to parse config file {}", path.display())
            }
            ConfigError::MultipleConfigFiles => write!(
                f,
                "multiple config files found. Please ensure only one SwCrypts config file is present (.swcrypts.json, .swcrypts.json5, or .swcrypts.jsonc)."
            ),
        }
    }
}

impl std::error::Error for ConfigError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ConfigError::ReadDir { source, .. } | ConfigError::Read { source, .. } => Some(source),
            ConfigError::Parse { source, .. } => Some(source),
            ConfigError::MultipleConfigFiles => None,
        }
    }
}

const CONFIG_FILE_NAMES: [&str; 3] = [".swcrypts.json", ".swcrypts.jsonc", ".swcrypts.json5"];

pub fn find_config_file(indir: Option<&Path>) -> Result<Option<PathBuf>, ConfigError> {
    let mut dirs: Vec<&Path> = vec![Path::new(".")];
    if let Some(indir) = indir {
        dirs.push(indir);
    }

    let mut found: Option<PathBuf> = None;
    for dir in dirs {
        let entries = fs::read_dir(dir).map_err(|source| ConfigError::ReadDir {
            path: dir.to_path_buf(),
            source,
        })?;

        for entry in entries {
            let entry = entry.map_err(|source| ConfigError::ReadDir {
                path: dir.to_path_buf(),
                source,
            })?;

            // Exact-name match replaces the TS regex — same set of files
            if CONFIG_FILE_NAMES.contains(&entry.file_name().to_str().unwrap_or_default()) {
                if found.is_some() {
                    return Err(ConfigError::MultipleConfigFiles);
                }
                found = Some(entry.path());
            }
        }
    }

    Ok(found)
}

pub fn load_config(
    config_path: Option<PathBuf>,
    indir: Option<&Path>,
) -> Result<Config, ConfigError> {
    let config_path = match config_path {
        Some(config_path) => config_path,
        None => match find_config_file(indir)? {
            Some(config_path) => config_path,
            None => return Ok(Config::default()),
        },
    };

    let content = read_to_string(&config_path).map_err(|source| ConfigError::Read {
        path: config_path.clone(),
        source,
    })?;

    json5::from_str(&content).map_err(|source| ConfigError::Parse {
        path: config_path.clone(),
        source,
    })
}
