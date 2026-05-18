# SwCrypts

Encrypt static sites.

## Live demo

Try the encrypted demo site at **[swcrypts.luisafk.dev](https://swcrypts.luisafk.dev/)**.

**Password:** `Hi`

## Security

### Transport integrity

Encrypted output must be served over HTTPS. The decryption logic (the wrapper HTML/JS) is shipped alongside the ciphertext, so anyone able to tamper with files in transit can simply replace the wrapper with one that exfiltrates the password — no amount of cipher choice protects against that. HTTPS is what makes the integrity assumption hold.

### Cryptography

Content is encrypted with **AES‑256‑GCM**. The key is derived from your password with **PBKDF2‑HMAC‑SHA256** (600,000 iterations) over a 16‑byte random salt.

### Post‑quantum ("store now, decrypt later")

SwCrypts uses only symmetric primitives — there is no RSA, ECDH, or other public‑key crypto for Shor's algorithm to break. The only relevant quantum attack is **Grover's algorithm**, which halves the effective security level of symmetric ciphers and hashes:

- AES‑256 → ~128‑bit post‑quantum security (safe).
- SHA‑256 → ~128‑bit post‑quantum preimage resistance (safe).

So the cipher itself is post‑quantum safe. **The real risk is password entropy**, because Grover also speeds up password guessing. To preserve the full ~128‑bit post‑quantum margin, your password must carry at least ~128 bits of entropy _after_ accounting for that speedup (i.e. ~256 bits classical, or simply: a long, fully random password).

### Password recommendations

Pick **one** of the following — all give comfortably more than the post‑quantum target:

| Scheme                                             | Length     | Approx. entropy |
| -------------------------------------------------- | ---------- | --------------- |
| Random alphanumeric (a–z, A–Z, 0–9)                | ≥ 43 chars | ~256 bits       |
| Random alphanumeric + symbols (94 printable ASCII) | ≥ 39 chars | ~256 bits       |
| Diceware passphrase (EFF long list)                | ≥ 20 words | ~259 bits       |

A **64‑character random password from the 94‑printable‑ASCII set** carries ~419 bits of entropy. That is dramatically more than needed and leaves a huge safety margin even against future improvements in cryptanalysis.

Do **not** use:

- Human‑chosen passwords (entropy is typically <40 bits regardless of length).
- Passwords reused from any other site.
- Anything based on words, names, dates, or patterns.

Generate passwords with a password manager's random generator, `openssl rand -hex 32`, or equivalent.
