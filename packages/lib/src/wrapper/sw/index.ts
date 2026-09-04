/// <reference no-default-lib="true" />
/// <reference lib="webworker" />

import type { FileMetadata, PayloadVersion } from "../../payloads";

import { serviceWorkerFileName } from "../../constants";
import { deriveFilePathsKey, encryptFilePath } from "../../crypto";
import { decryptFile } from "../../decrypt";
import { decodeFilePayload } from "../../payloads";
import { getPasswordFromCache } from "../cache";
import { patchCspForInlineScript } from "./csp";

declare const self: ServiceWorkerGlobalScope;

// Debugging headers
const swCryptsFileTypeHeader = "X-SwCrypts-Type";
const swCryptsPayloadVersionHeader = "X-SwCrypts-Payload-Version";

const enum FileTypeDirective {
  None = "none",
  Asset = "asset",
  AssetUnauthed = "asset; unauthed",
  AssetError = "asset; error",
  Entrypoint = "entrypoint",
  EntrypointUnauthed = "entrypoint; unauthed",
  EntrypointError = "entrypoint; error",
}

const CURRENT_PAYLOAD_VERSION: PayloadVersion = { major: 1, minor: 0 };

const currentScope = new URL(self.registration.scope);
const currentServiceWorkerUrlJson = JSON.stringify(
  new URL(serviceWorkerFileName, self.registration.scope).pathname,
);

let hashedPassword: string | null = null;
let filePathsKey: CryptoKey | null = null;

let updateRequested = false;

const decoder = new TextDecoder();

self.addEventListener("install", (e) => {
  console.debug("SwCrypts service worker installing");
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  console.debug("SwCrypts service worker activating");
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (
    url.origin === currentScope.origin &&
    url.pathname.startsWith(currentScope.pathname)
  ) {
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
    fetch(e.request).then((resp) =>
      cloneResponseInjectHeaders(resp, FileTypeDirective.None, null),
    ),
  );
});

async function getAndDeriveKeys() {
  if (!hashedPassword) {
    hashedPassword = await getPasswordFromCache(currentScope.pathname);
  }

  if (!hashedPassword) {
    return false;
  }

  if (!filePathsKey) {
    filePathsKey = await deriveFilePathsKey(hashedPassword);
  }

  return true;
}

function requestServiceWorkerUpdate(newPayloadVersion: PayloadVersion) {
  if (updateRequested) {
    return;
  }

  updateRequested = true;
  self.registration.update().catch((err) => {
    console.error(
      `SwCrypts failed to update service worker for new major payload version ${newPayloadVersion.major}:`,
      err,
    );
    updateRequested = false;
  });
}

async function fetchAsset(url: URL, request: Request) {
  console.debug(
    "SwCrypts service worker intercepting fetch for asset",
    url.pathname,
  );

  if (!(await getAndDeriveKeys())) {
    return new Response("Unauthorized SwCrypts", {
      status: 401,
      headers: {
        [swCryptsFileTypeHeader]: FileTypeDirective.AssetUnauthed,
      },
    });
  }

  const [, resp, payloadVersion, decryptedMetadata, decryptedData] =
    await fetchAndDecrypt(request);

  if (!resp.ok || !decryptedMetadata) {
    return cloneResponseInjectHeaders(
      resp,
      FileTypeDirective.AssetError,
      payloadVersion,
    );
  }

  const headers = new Headers(resp.headers);
  headers.set("Content-Type", decryptedMetadata.mimeType);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(swCryptsFileTypeHeader, FileTypeDirective.Asset);
  headers.set(
    swCryptsPayloadVersionHeader,
    payloadVersionToDebugString(payloadVersion),
  );

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

  if (!(await getAndDeriveKeys())) {
    return cloneResponseInjectHeaders(
      await fetch(request),
      FileTypeDirective.EntrypointUnauthed,
      null,
    );
  }

  const [, resp, payloadVersion, decryptedMetadata, decryptedPage] =
    await fetchAndDecrypt(request);

  if (!resp.ok || !decryptedMetadata) {
    return cloneResponseInjectHeaders(
      resp,
      FileTypeDirective.EntrypointError,
      payloadVersion,
    );
  }

  const decodedPage = decoder.decode(decryptedPage);

  const headers = new Headers(resp.headers);
  headers.set("Content-Type", decryptedMetadata.mimeType);
  headers.set(swCryptsFileTypeHeader, FileTypeDirective.Entrypoint);
  headers.set(
    swCryptsPayloadVersionHeader,
    payloadVersionToDebugString(payloadVersion),
  );

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
    `${decodedPage}<script${nonceAttr}>navigator.serviceWorker.register(${currentServiceWorkerUrlJson})</script>`,
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
  | [URL, Response, PayloadVersion, FileMetadata, ArrayBuffer]
  | [URL, Response, PayloadVersion | null, null, null]
> {
  if (!hashedPassword || !filePathsKey) {
    throw new Error();
  }

  const url = new URL(request.url);
  const relativePath = url.pathname.slice(currentScope.pathname.length);

  url.pathname =
    currentScope.pathname +
    (await encryptFilePath(
      relativePath + (url.pathname.endsWith("/") ? "index.html" : ""),
      filePathsKey,
    ));

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
    return [url, resp, null, null, null];
  }

  const encryptedData = await resp.bytes();
  const decryptedFile = await decryptFile(encryptedData, hashedPassword).catch(
    (err) => {
      console.error("Error decrypting file:", err);
      return null;
    },
  );

  if (!decryptedFile) {
    return [url, resp, null, null, null];
  }
  const { payloadVersion, payloadView } = decryptedFile;

  if (payloadVersion.major !== CURRENT_PAYLOAD_VERSION.major) {
    if (payloadVersion.major > CURRENT_PAYLOAD_VERSION.major) {
      requestServiceWorkerUpdate(payloadVersion);
    }

    return [url, resp, payloadVersion, null, null];
  } else if (payloadVersion.minor > CURRENT_PAYLOAD_VERSION.minor) {
    requestServiceWorkerUpdate(payloadVersion);
  }

  try {
    const { metadata, content } = decodeFilePayload(payloadView);
    return [url, resp, payloadVersion, metadata, content];
  } catch (err) {
    console.error(
      `Error decoding file payload (payload v${payloadVersionToDebugString(payloadVersion)}):`,
      err,
    );
    return [url, resp, payloadVersion, null, null];
  }
}

function cloneResponseInjectHeaders(
  resp: Response,
  fileType: FileTypeDirective,
  payloadVersion: PayloadVersion | null,
) {
  if (resp.type === "opaque") {
    return resp;
  }
  const headers = new Headers(resp.headers);

  headers.set(swCryptsFileTypeHeader, fileType);
  if (payloadVersion !== null) {
    headers.set(
      swCryptsPayloadVersionHeader,
      payloadVersionToDebugString(payloadVersion),
    );
  }

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

function payloadVersionToDebugString(payloadVersion: PayloadVersion) {
  return `${payloadVersion.major}.${payloadVersion.minor}`;
}
