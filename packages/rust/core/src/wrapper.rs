use std::fmt;
use std::sync::LazyLock;

use base64::Engine as _;
use regex::Regex;

use crate::crypto::keys::HashedPassword;
use crate::crypto::{CryptoError, encrypt_data};

/// Minified wrapper page, built by the TS lib build script
/// (`packages/lib/scripts/build.ts` → `packages/lib/dist-wrapper/`) and
/// embedded at compile time. If this file is missing, run the TS lib build
/// first: `bun run --cwd packages/lib build`.
pub const WRAPPER_HTML: &str = include_str!("../../../lib/dist-wrapper/wrapper.html");

/// Minified service worker, built the same way. The TS source can't be
/// embedded directly — it must be bundled before browsers can run it.
pub const SERVICE_WORKER_JS: &str = include_str!("../../../lib/dist-wrapper/sw.js");

const DEFAULT_TITLE: &str = "This page is encrypted!";
const DEFAULT_MESSAGE: &str = "Please enter the password to view the content.";

static ASIDE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<aside>.+?</aside>").expect("valid static regex"));

#[derive(Debug)]
pub enum WrapperError {
    BasePathNotAbsolute,
    BasePathDoubleSlash,
}

impl fmt::Display for WrapperError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BasePathNotAbsolute => write!(f, "basePath must start with a forward slash"),
            Self::BasePathDoubleSlash => {
                write!(f, "basePath must not start with a double forward slash")
            }
        }
    }
}

pub struct WrapperOptions<'a> {
    pub base_path: &'a str,
    pub crypto_check: &'a [u8],
    pub salt: &'a [u8],
    /// Injected verbatim before the closing `</style>` tag. NOT sanitised.
    pub custom_styles: Option<&'a str>,
    /// Injected verbatim. NOT sanitised or escaped.
    pub title: Option<&'a str>,
    /// Injected verbatim. NOT sanitised or escaped.
    pub message: Option<&'a str>,
    pub include_attribution: bool,
}

pub fn get_wrapper_html(options: &WrapperOptions) -> Result<String, WrapperError> {
    if !options.base_path.starts_with('/') {
        return Err(WrapperError::BasePathNotAbsolute);
    }

    if options.base_path.len() > 1 && options.base_path.as_bytes()[1] == b'/' {
        return Err(WrapperError::BasePathDoubleSlash);
    }

    let base_path = if options.base_path.ends_with('/') {
        options.base_path.to_string()
    } else {
        format!("{}/", options.base_path)
    };

    let mut html = WRAPPER_HTML.to_string();

    if let Some(custom_styles) = options.custom_styles {
        // TS `String.replace` swaps only the first occurrence.
        html = html.replacen("</style>", &format!("{custom_styles}</style>"), 1);
    }

    if !options.include_attribution {
        html = ASIDE_REGEX.replace(&html, "").into_owned();
    }

    // TS uses JSON.stringify(...) — serde_json produces identical quoting.
    let json =
        |value: &str| serde_json::to_string(value).expect("string serialization is infallible");

    html = html
        .replace(r#""{{BASEPATH}}""#, &json(&base_path))
        .replace(
            r#""{{CRYPTOCHECK}}""#,
            &json(&base64::engine::general_purpose::STANDARD.encode(options.crypto_check)),
        )
        .replace(
            r#""{{SALT}}""#,
            &json(&base64::engine::general_purpose::STANDARD.encode(options.salt)),
        )
        .replace("{{TITLE}}", options.title.unwrap_or(DEFAULT_TITLE))
        .replace("{{MESSAGE}}", options.message.unwrap_or(DEFAULT_MESSAGE));

    Ok(html)
}

pub fn get_service_worker_js() -> &'static str {
    SERVICE_WORKER_JS
}

pub fn generate_crypto_check(hashed_password: &HashedPassword) -> Result<Vec<u8>, CryptoError> {
    let mut check = [0u8; 64];
    rand::fill(&mut check);

    encrypt_data(&check, &hashed_password.cipher()?)
}
