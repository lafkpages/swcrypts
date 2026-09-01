function generateNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * If the CSP would block an inline `<script>`, generates a fresh nonce,
 * returns it along with a patched CSP that whitelists it. Returns `null`
 * when no patching is needed (no effective script-src/default-src, or it
 * already allows inline via 'unsafe-inline' without nonces/hashes that
 * would suppress it).
 */
export function patchCspForInlineScript(
  csp: string,
): { nonce: string; csp: string } | null {
  const directives = csp
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const parts = d.split(/\s+/);
      return { name: parts[0]!.toLowerCase(), values: parts.slice(1) };
    });

  const scriptSrc = directives.find((d) => d.name === "script-src");
  const defaultSrc = directives.find((d) => d.name === "default-src");
  const effective = scriptSrc ?? defaultSrc;
  if (!effective) return null;

  const hasUnsafeInline = effective.values.includes("'unsafe-inline'");
  const hasNonceOrHash = effective.values.some(
    (v) =>
      v.startsWith("'nonce-") ||
      v.startsWith("'sha256-") ||
      v.startsWith("'sha384-") ||
      v.startsWith("'sha512-"),
  );
  // 'unsafe-inline' is honored only if no nonces/hashes are present.
  if (hasUnsafeInline && !hasNonceOrHash) return null;

  const nonce = generateNonce();
  const nonceTok = `'nonce-${nonce}'`;
  if (scriptSrc) {
    scriptSrc.values.push(nonceTok);
  } else {
    // Materialize script-src from default-src so the nonce doesn't
    // accidentally widen what script-src would otherwise allow.
    directives.push({
      name: "script-src",
      values: [...(defaultSrc?.values ?? []), nonceTok],
    });
  }
  return {
    nonce,
    csp: directives.map((d) => `${d.name} ${d.values.join(" ")}`).join("; "),
  };
}
