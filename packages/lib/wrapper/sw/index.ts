/// <reference no-default-lib="true" />
/// <reference lib="webworker" />

import { safeParse } from "valibot";

import { decrypt, encrypt, serviceWorkerFileName } from "../..";
import { FileMetadata } from "../../metadata";
import { getPasswordFromCache } from "../cache";
import { patchCspForInlineScript } from "./csp";

declare const self: ServiceWorkerGlobalScope;

const swCryptsTypeHeader = "X-SwCrypts-Type";

let hashedPassword: string | null = null;

const decoder = new TextDecoder();

self.addEventListener("install", (e) => {
  console.debug("SwCrypts service worker installing");
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (url.origin === location.origin) {
    console.debug(
      "SwCrypts service worker intercepting fetch for",
      e.request.url,
      e.request,
    );

    if (e.request.mode === "navigate") {
      e.respondWith(fetchEntryPoint(url, e.request));
      return;
    } else if (!url.pathname.endsWith(`/${serviceWorkerFileName}`)) {
      e.respondWith(fetchAsset(url, e.request));
      return;
    }
  }

  e.respondWith(
    fetch(e.request).then((resp) => cloneResponseInjectHeaders(resp, "none")),
  );
});

async function fetchAsset(url: URL, request: Request) {
  console.debug(
    "SwCrypts service worker intercepting fetch for asset",
    url.pathname,
  );

  if (!hashedPassword) {
    hashedPassword = await getPasswordFromCache();
  }

  if (!hashedPassword) {
    return new Response("Unauthorized SwCrypts", {
      status: 401,
      headers: {
        [swCryptsTypeHeader]: "asset; unauthed",
      },
    });
  }

  const [, resp, decryptedMetadata, decryptedData] =
    await fetchAndDecrypt(request);

  if (!resp.ok || !decryptedMetadata) {
    return cloneResponseInjectHeaders(resp, "asset");
  }

  const headers = new Headers(resp.headers);
  headers.set("Content-Type", decryptedMetadata.mimeType);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(swCryptsTypeHeader, "asset");

  return new Response(decryptedData, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

async function fetchEntryPoint(url: URL, request: Request) {
  console.debug(
    "SwCrypts service worker intercepting fetch for entrypoint",
    url.pathname,
  );

  if (!hashedPassword) {
    hashedPassword = await getPasswordFromCache();
  }

  if (!hashedPassword) {
    return cloneResponseInjectHeaders(
      await fetch(request),
      "entrypoint; unauthed",
    );
  }

  const [, resp, decryptedMetadata, decryptedPage] =
    await fetchAndDecrypt(request);

  if (!resp.ok || !decryptedMetadata) {
    return cloneResponseInjectHeaders(resp, "entrypoint; error");
  }

  const decodedPage = decoder.decode(decryptedPage);

  const headers = new Headers(resp.headers);
  headers.set("Content-Type", decryptedMetadata.mimeType);
  headers.set(swCryptsTypeHeader, "entrypoint");

  const upstreamCsp = headers.get("Content-Security-Policy");
  let nonceAttr = "";
  if (upstreamCsp) {
    const patched = patchCspForInlineScript(upstreamCsp);
    if (patched !== null) {
      nonceAttr = ` nonce="${patched.nonce}"`;
      headers.set("Content-Security-Policy", patched.csp);
    }
  }

  return new Response(
    `${decodedPage}<script${nonceAttr}>navigator.serviceWorker.register("/${serviceWorkerFileName}",{scope:"/"})</script>`,
    {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    },
  );
}

async function fetchAndDecrypt(
  request: Request,
): Promise<
  [URL, Response, FileMetadata, ArrayBuffer] | [URL, Response, null, null]
> {
  if (!hashedPassword) {
    throw new Error();
  }

  const url = new URL(request.url);

  url.pathname = `/${(
    await encrypt(
      url.pathname.slice(1) + (url.pathname.endsWith("/") ? "index.html" : ""),
      hashedPassword,
      true,
    )
  ).toHex()}.swcrypts.enc`;

  // Cannot reuse the original request as it has mode: "navigate" and navigation
  // requests cannot be constructed via JS (only by the browser). Either way, we
  // are fetching a different URL anyway, so we construct a new request.
  const req = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    mode: "cors",
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  });

  const resp = await fetch(req);

  if (!resp.ok) {
    return [url, resp, null, null];
  }

  const encryptedData = await resp.bytes();
  const decryptedData = await decrypt(encryptedData, hashedPassword);

  const decryptedView = new DataView(decryptedData);

  const metaVersion = decryptedView.getUint8(0);

  if (metaVersion !== 1) {
    return [url, resp, null, null];
  }

  const metadataLength = decryptedView.getUint32(1);
  const metadata = decryptedData.slice(5, 5 + metadataLength);

  let decodedMetadata: unknown;
  try {
    decodedMetadata = JSON.parse(decoder.decode(metadata));
  } catch {
    return [url, resp, null, null];
  }

  const parsedMetadata = safeParse(FileMetadata, decodedMetadata);

  if (!parsedMetadata.success) {
    return [url, resp, null, null];
  }

  const content = decryptedData.slice(5 + metadataLength);

  return [url, resp, parsedMetadata.output, content];
}

function cloneResponseInjectHeaders(resp: Response, swCryptsType: string) {
  if (resp.type === "opaque") {
    return resp;
  }

  const headers = new Headers(resp.headers);
  headers.set(swCryptsTypeHeader, swCryptsType);
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}
