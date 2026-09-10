# AGENTS.md

Guidance for AI coding agents working in this repository. Keep this file in
sync with the code when conventions or commands change.

## Project overview

SwCrypts encrypts **static sites** so they can be hosted on any dumb static
host (over HTTPS) while remaining unreadable without a password. A build step
encrypts every file; the decryption happens entirely client-side via an
injected wrapper page and a service worker.

- Content is encrypted with **AES-256-GCM**.
- The key is derived from the password with **PBKDF2-HMAC-SHA256** (600,000
  iterations) over a random 16-byte salt.
- File **paths** are blinded with **HMAC-SHA256** (key derived via HKDF), so the
  directory structure isn't leaked. Encrypted files are named `<hmac-hex>.swcrypts.enc`.

Security-sensitive project: be conservative around the crypto, the payload
format, and the wrapper/service-worker code. See "Gotchas" below.

## Repository layout

Bun workspace monorepo (`packages/*`):

- `packages/lib` — the `@swcrypts/core` library. Crypto, payload format, and the
  wrapper/service-worker source that gets bundled into the output.
  - `src/crypto/` — `encryptData`/`decryptData`, `hashPassword`,
    `deriveFilePathsKey`, `encryptFilePath`, and `crypto/salt.ts`.
  - `src/encrypt.ts` / `src/decrypt.ts` — file-level `encryptFile` / `decryptFile`.
  - `src/payloads.ts` — the on-disk payload format: `buildFilePayload`,
    `decodeFilePayload`, `FileMetadata`, `PayloadVersion`.
  - `src/files.ts` — `filterIgnoredFiles`, `fileIsEntryPoint`.
  - `src/constants.ts` — shared constants (e.g. the service worker filename).
  - `src/wrapper/` — the password-prompt page (`index.html`, `index.css`,
    `index.ts`, `cache.ts`) and the service worker (`sw/index.ts`, `sw/csp.ts`).
    These are bundled to raw strings and re-exported from `src/wrapper.ts`.
  - `scripts/build.ts` — the library build (see below).
- `packages/cli` — the `swcrypts` CLI (built on `@bunli/core`, options validated
  with `valibot`). `commands/build.ts` is the encrypt command; `config.ts` loads the
  user config (`.swcrypts.json` / `.json5` / `.jsonc`).
- `packages/rust` — a Cargo workspace (not a Bun workspace member; no
  `package.json`) with a work-in-progress Rust port of the toolchain:
  - `core/` — the `swcrypts-core` crate mirroring `@swcrypts/core` (crypto,
    payload format, wrapper/SW generation). It embeds the TS-built wrapper page
    and service worker from `packages/lib/dist-wrapper/` via `include_str!`, so
    **the TS lib build must run before `cargo build`** (see Build details).
  - `cli/` — a clap-based `swcrypts` CLI (`build` command; `config.rs` loads the
    same `.swcrypts.json(c|5)` config).

  The port is not yet at full parity with the TS CLI (known gaps are left as
  code TODOs) — don't assume behavior matches without checking.

- `packages/site` — SwCrypts' own static site, built with **Astro**. It is
  intentionally **public/unencrypted**; only `src/pages` content referenced by
  the deploy workflow's demo path is encrypted (see "Demo encryption" below).
  `packages/site/dist/` is gitignored build output.

## Tooling

- **Runtime & package manager: Bun.** If `bun` is not on PATH, try `~/.bun/bin/bun`.
  Do not add npm/pnpm/yarn lockfiles.
- **TypeScript** (peer `typescript@^7`), strict mode, bundler resolution,
  `verbatimModuleSyntax`, `noUncheckedIndexedAccess`.
- **Prettier** with `@ianvs/prettier-plugin-sort-imports` and
  `prettier-plugin-astro` (import order is enforced — run the formatter, don't
  hand-sort).
- **Valibot** for runtime schema validation in both the lib and the CLI (Bunli
  accepts any Standard Schema-compatible validator). Match the surrounding
  package if it ever differs.
- **Rust** for `packages/rust`: edition 2024. Note the CLI uses
  `slice::as_array`, which needs Rust ≥ 1.93; there is no `rust-toolchain.toml`
  yet, so CI relies on the runner's preinstalled stable toolchain.

## Commands

Install first: `bun install`

> [!IMPORTANT]
> The `@swcrypts/core` package exports resolve to `packages/lib/dist/*`, and the
> lib tests import from `../dist/...`. **You must build the lib before running
> either test suite, the TS CLI, or the Rust workspace.** This is the most
> common cause of confusing failures.

```sh
# Format everything (also fixes import order)
bun run -b format

# Build the library (bundles wrapper + SW, emits .d.ts via tsc)
bun run --cwd packages/lib build

# Lib tests (require the build above)
bun test --cwd packages/lib

# Build + test the CLI (also needs the lib built)
bun run --cwd packages/cli build
bun test --cwd packages/cli

# Site (Astro): dev server / production build to packages/site/dist
bun run --cwd packages/site dev
bun run --cwd packages/site build

# Build the Rust workspace (needs the lib build above: dist-wrapper artifacts)
cargo build --release --manifest-path packages/rust/Cargo.toml
```

CI (`.github/workflows/test.yml`) runs exactly: build lib → test lib → build CLI
→ test CLI. Mirror that ordering locally when reproducing CI.

`.github/workflows/build-rust.yml` additionally builds the Rust workspace on
pushes to `main` and PRs. Because the crate embeds `packages/lib/dist-wrapper/`
at compile time, this job runs the TS lib build first (setup-bun →
`bun install` → lib build → `cargo build --release`).

Deployment (`.github/workflows/deploy.yml`) builds the site, encrypts the demo
section with the CLI, and deploys to GitHub Pages.

## Demo encryption

The marketing site is public; only the `demo` section is encrypted. The deploy
workflow does this inline: it builds the Astro site, runs the CLI over
`packages/site/dist/demo` into a temp dir, swaps the plain `demo` directory for
the encrypted one, and uploads `packages/site/dist` as the Pages artifact.
`packages/site/public/demo/.swcrypts.jsonc` holds the demo config (demo
password + salt). It deliberately lives under `public/demo/` so Astro copies it
into `dist/demo/`, where the CLI's config search (upward from the input dir)
finds it; the CLI filters dotfiles, so it is never deployed. Mixed
public/encrypted deployments are a known rough edge — the CLI currently
encrypts a whole input directory, and the wrapper/service worker assume one
deployment root.

If you change the CLI config shape in `packages/cli/config.ts`, regenerate the
JSON schema: `bun run --cwd packages/cli build:schema`. This resolves
`WrapperOptions` from `@swcrypts/core/wrapper` (i.e. `packages/lib/dist/*.d.ts`),
so the lib must have been built **with types** first — a `--skip-types` build is
not enough.

## Build details worth knowing

- `packages/lib/scripts/build.ts` bundles `src/wrapper/index.html` and
  `src/wrapper/sw/index.ts` with `Bun.build` (minified), inlines them as raw
  text into the library bundle, then runs `tsc` to emit declarations.
- The same build script also writes the minified wrapper page and service
  worker to `packages/lib/dist-wrapper/` (gitignored via `dist-*`). The Rust
  crate embeds these files at compile time (`include_str!`), so they must exist
  before `cargo build`. `--skip-wrapper` skips writing them — the lib bundle
  still gets the fresh inlined strings, but `dist-wrapper/` is then stale, so
  run a full build before building or releasing the Rust CLI.
- The build script asserts exactly one build output for the wrapper page and
  the service worker, failing fast instead of silently embedding `outputs[0]`
  of an unexpected multi-output build.
- Type generation needs a working `tsc` (Node-based). Pass `--skip-types` to the
  build script to skip declaration emit when you only need the JS bundles.
- The main lib `tsconfig.json` **excludes** `src/wrapper/**` (it targets the DOM
  and webworker libs, which conflict with the library's config). The wrapper/SW
  is typechecked separately via `packages/lib/src/wrapper/tsconfig.json` — that
  config is not wired into any script, so run it explicitly if you touch wrapper
  or service-worker code:
  `tsc -p packages/lib/src/wrapper/tsconfig.json`.

## Encrypted file format

Each source file becomes an encrypted `.swcrypts.enc` blob:

```
on-disk .enc file = 12-byte AES-GCM IV || AES-256-GCM ciphertext(payload)

payload (plaintext, before encryption):
  byte  0        payload major version   (currently 1)
  byte  1        payload minor version   (currently 0)
  bytes 2..5     uint32 metadata length
  bytes 6..      UTF-8 JSON metadata     ({ "mimeType": string })
  then           raw file content
```

Producer: `buildFilePayload` (`payloads.ts`). Consumer: `decodeFilePayload`
(`payloads.ts`), called by the service worker after `decryptFile` verifies the
version bytes.

Versioning contract (do not regress): the two version bytes are the **stable**
prefix. Always read and check the version **before** interpreting the rest of the
payload. In the service worker, a mismatched **major** version bails out and
requests a SW update; a newer **minor** still serves the file and updates in the
background. `CURRENT_PAYLOAD_VERSION` lives in `sw/index.ts`; the writer in
`buildFilePayload` currently hardcodes the same version (known duplication).

Any change to this layout is a **breaking change**: bump the version bytes and
update both the writer and reader, since already-deployed sites and cached
service workers must keep working or self-heal.

## How it runs in the browser

1. HTML files ("entry points", per `fileIsEntryPoint`) are written to their
   original path but replaced with the wrapper page; every file is also written
   as its encrypted `.swcrypts.enc` blob at the HMAC'd path.
2. The wrapper prompts for the password, derives the key, validates it against a
   `cryptoCheck` blob, caches it, and registers the service worker.
3. The service worker (`__swcrypts_sw.js`) intercepts same-origin requests, maps
   the path to its HMAC'd `.enc` name, fetches, decrypts, and serves with the
   correct `Content-Type` from the payload metadata.

## Conventions

- **Commit messages: Conventional Commits** (`feat:`, `fix:`, `refactor:`,
  `test(lib):`, `build:`, …). Use `!` and a `BREAKING CHANGE:` trailer for
  changes to package exports, the payload format, or debug response headers.
- Keep changes minimal and consistent with the surrounding package. Reuse the
  validation library already used there (Valibot in lib and CLI).
- Don't hand-format imports; Prettier's import-order plugin owns that.
- Error handling in the service worker degrades gracefully to a controlled error
  response (with `X-SwCrypts-*` debug headers) rather than rejecting the fetch —
  preserve that behavior.

## Gotchas

- Build the lib before testing or running the CLI (see Commands).
- Building `packages/rust` requires `packages/lib/dist-wrapper/` to exist — run
  the TS lib build first (without `--skip-wrapper`), or `include_str!` fails to
  compile.
- Touching `src/wrapper/**`? Typecheck it with the wrapper tsconfig; the main
  build won't catch its errors.
- Changing the payload layout, the crypto parameters, or the `.swcrypts.enc`
  naming affects already-deployed sites and cached service workers — treat as
  breaking and preserve forward/backward compatibility per the versioning
  contract.
- `packages/site/dist/`, `packages/lib/README.md`, and
  `packages/lib/dist-wrapper/` are generated/gitignored — don't commit them.
