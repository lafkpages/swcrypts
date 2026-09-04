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
  with `zod`). `commands/build.ts` is the encrypt command; `config.ts` loads the
  user config (`.swcrypts.json` / `.json5` / `.jsonc`).
- `site/` — SwCrypts' own static site; `site-enc/` is gitignored build output.

## Tooling

- **Runtime & package manager: Bun.** If `bun` is not on PATH, try `~/.bun/bin/bun`.
  Do not add npm/pnpm/yarn lockfiles.
- **TypeScript** (peer `typescript@^7`), strict mode, bundler resolution,
  `verbatimModuleSyntax`, `noUncheckedIndexedAccess`.
- **Prettier** with `@ianvs/prettier-plugin-sort-imports` (import order is
  enforced — run the formatter, don't hand-sort).
- **Valibot** for runtime schema validation in the lib; **Zod** for CLI option
  validation. Match whichever the surrounding package already uses.

## Commands

Install first: `bun install`

> [!IMPORTANT]
> The `@swcrypts/core` package exports resolve to `packages/lib/dist/*`, and the
> lib tests import from `../dist/...`. **You must build the lib before running
> either test suite or the CLI.** This is the most common cause of confusing
> failures.

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

# Run the CLI against SwCrypts' own static site
bun run build:site
```

CI (`.github/workflows/test.yml`) runs exactly: build lib → test lib → build CLI
→ test CLI. Mirror that ordering locally when reproducing CI.

If you change the CLI config shape in `packages/cli/config.ts`, regenerate the
JSON schema: `bun run --cwd packages/cli build:schema`. This resolves
`WrapperOptions` from `@swcrypts/core/wrapper` (i.e. `packages/lib/dist/*.d.ts`),
so the lib must have been built **with types** first — a `--skip-types` build is
not enough.

## Build details worth knowing

- `packages/lib/scripts/build.ts` bundles `src/wrapper/index.html` and
  `src/wrapper/sw/index.ts` with `Bun.build` (minified), inlines them as raw
  text into the library bundle, then runs `tsc` to emit declarations.
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
  bytes 6..      UTF-8 JSON metadata      ({ "mimeType": string })
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
  validation library already used there (Valibot in lib, Zod in CLI).
- Don't hand-format imports; Prettier's import-order plugin owns that.
- Error handling in the service worker degrades gracefully to a controlled error
  response (with `X-SwCrypts-*` debug headers) rather than rejecting the fetch —
  preserve that behavior.

## Gotchas

- Build the lib before testing or running the CLI (see Commands).
- Touching `src/wrapper/**`? Typecheck it with the wrapper tsconfig; the main
  build won't catch its errors.
- Changing the payload layout, the crypto parameters, or the `.swcrypts.enc`
  naming affects already-deployed sites and cached service workers — treat as
  breaking and preserve forward/backward compatibility per the versioning
  contract.
- `site-enc/` and `packages/lib/README.md` are generated/gitignored — don't
  commit them.
