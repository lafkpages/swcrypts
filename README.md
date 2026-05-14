# SwCrypts

Encrypt static sites.

## Security

Encrypted output must be served over HTTPS. The decryption logic (the wrapper HTML/JS) is shipped alongside the ciphertext, so anyone able to tamper with files in transit can simply replace the wrapper with one that exfiltrates the password — no amount of cipher choice protects against that. HTTPS is what makes the integrity assumption hold.
