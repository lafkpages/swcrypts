use std::{
    env,
    fs::{File, create_dir_all, remove_dir_all},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

mod config;

use crate::config::{Config, load_config};
use clap::{Parser, Subcommand};
use rpassword::prompt_password;
use swcrypts_core::{
    constants::SERVICE_WORKER_FILE_NAME,
    crypto::{
        keys::{derive_file_paths_key, hash_password},
        salt::{Salt, generate_random_salt, is_valid_salt},
    },
    encrypt::encrypt_file,
    files::filter_ignored_files,
    wrapper::{WrapperOptions, generate_crypto_check, get_service_worker_js, get_wrapper_html},
};
use walkdir::WalkDir;

#[derive(Parser)]
#[command(name = "swcrypts", about = "Encrypt static sites.")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Build and encrypt assets for deployment.
    Build {
        #[arg(short, long)]
        indir: PathBuf,
        #[arg(short, long)]
        outdir: PathBuf,
        #[arg(short, long)]
        config: Option<PathBuf>,
    },
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Build {
            indir,
            outdir,
            config,
        } => {
            let Config {
                base_path,
                password,
                salt,
                custom_styles: custom_styles_path,
            } = match load_config(config, Some(&indir)) {
                Ok(config) => config,
                Err(error) => {
                    eprintln!("error: {error}");
                    std::process::exit(1);
                }
            };

            let files = match collect_input_files(&indir) {
                Ok(files) => files,
                Err(error) => {
                    eprintln!("error: {error}");
                    std::process::exit(1);
                }
            };

            let files = filter_ignored_files(files);

            if files.is_empty() {
                eprintln!("No files found in the input directory.");
                std::process::exit(1);
            }

            eprintln!("Found {} files to encrypt.", files.len());

            let password = password
                .or_else(|| env::var("SWCRYPTS_PASSWORD").ok())
                .unwrap_or_else(|| {
                    prompt_password("Enter password: ").expect("failed to read password")
                });

            if password.is_empty() {
                eprintln!("Password is required for encryption.");
                std::process::exit(1);
            }

            let mut salt_hex = salt
                .or_else(|| env::var("SWCRYPTS_SALT").ok())
                .unwrap_or_else(|| {
                    prompt_password("Enter salt (or leave empty for random): ")
                        .expect("failed to read salt")
                });
            let salt: Salt;

            if salt_hex.is_empty() {
                salt = generate_random_salt();
                salt_hex = hex::encode(&salt);

                assert!(is_valid_salt(&salt));
                println!("Using random salt: {salt_hex}");

                // TODO: write config file with salt
            } else {
                salt = *hex::decode(&salt_hex)
                    .unwrap_or_else(|_| {
                        eprintln!("Salt must be a valid hex string.");
                        std::process::exit(1);
                    })
                    .as_array()
                    .unwrap_or_else(|| {
                        eprintln!("Salt must be 16 bytes (32 hex characters).");
                        std::process::exit(1);
                    });

                assert!(is_valid_salt(&salt));
            }

            let hashed_password = hash_password(&password, &salt);
            let cipher = hashed_password.cipher().expect("valid key length");
            let file_paths_key = derive_file_paths_key(&hashed_password).expect("valid key length");

            let mut custom_styles = String::new();
            if let Some(custom_styles_path) = custom_styles_path {
                File::open(&custom_styles_path)
                    .unwrap_or_else(|err| {
                        println!(
                            "Error opening custom styles file {custom_styles_path:?}: {err:?}"
                        );
                        std::process::exit(1);
                    })
                    .read_to_string(&mut custom_styles)
                    .unwrap();
            }
            let custom_styles = if custom_styles.is_empty() {
                None
            } else {
                Some(custom_styles.as_str())
            };

            if let Err(error) = remove_dir_all(&outdir) {
                if error.kind() != io::ErrorKind::NotFound {
                    eprintln!("error: failed to remove outdir: {error:?}");
                    std::process::exit(1);
                }
            }

            create_dir_all(&outdir).expect("failed to create outdir");

            let crypto_check =
                generate_crypto_check(&hashed_password).expect("failed to generate cryptocheck");

            let wrapper_html = get_wrapper_html(&WrapperOptions {
                base_path: base_path.as_deref().unwrap_or("/"),
                crypto_check: &crypto_check,
                salt: &salt,
                custom_styles,
                title: None,
                message: None,
                include_attribution: true,
            })
            .unwrap_or_else(|err| {
                eprintln!("error: failed to get wrapper HTML: {err:?}");
                std::process::exit(1);
            });

            for file in files {
                if file
                    .components()
                    .any(|c| c.as_os_str() == SERVICE_WORKER_FILE_NAME)
                {
                    eprintln!("Skipping {file:?} because it is internally reserved.");
                    continue;
                }

                let file_path = indir.join(&file);

                let (is_entrypoint, encrypted_data, encrypted_path) =
                    encrypt_file(file_path, &cipher, &file_paths_key).unwrap_or_else(|err| {
                        eprintln!("Failed to encrypt {file:?}: {err:?}");
                        std::process::exit(1);
                    });

                if is_entrypoint {
                    let out_path = outdir.join(file);

                    create_dir_all(out_path.parent().unwrap())
                        .expect("failed to create child directory in outdir");

                    File::create(out_path)
                        .unwrap()
                        .write_all(wrapper_html.as_bytes())
                        .unwrap();
                }

                File::create(outdir.join(encrypted_path))
                    .unwrap()
                    .write_all(&encrypted_data)
                    .unwrap();
            }

            File::create(outdir.join(SERVICE_WORKER_FILE_NAME))
                .unwrap()
                .write_all(get_service_worker_js().as_bytes())
                .unwrap();
        }
    }
}

/// Recursively lists files under `indir` as paths relative to it.
fn collect_input_files(indir: &Path) -> Result<Vec<PathBuf>, walkdir::Error> {
    Ok(WalkDir::new(indir)
        // readdir order is arbitrary; sort for deterministic output.
        .sort_by_file_name()
        .into_iter()
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| {
            entry
                .path()
                .strip_prefix(indir)
                // walkdir only yields paths under the root, so this holds.
                .expect("walkdir yields paths under the root")
                .to_path_buf()
        })
        .collect::<Vec<PathBuf>>())
}
