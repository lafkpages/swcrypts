/// <reference no-default-lib="true" />
/// <reference lib="webworker" />

import { safeParse } from "valibot";

import { serviceWorkerFileName } from "../../constants";
import { decrypt, deriveFilePathsKey, encryptFilePath } from "../../crypto";
import { FileMetadata } from "../../metadata";
import { getPasswordFromCache } from "../cache";
import { patchCspForInlineScript } from "./csp";

declare const self: ServiceWorkerGlobalScope;

// Debugging headers
const swCryptsFileTypeHeader = "X-SwCrypts-Type";
const swCryptsFileVersionHeader = "X-SwCrypts-File-Version";

const enum FileTypeDirective {
  None = "none",
  Asset = "asset",
  AssetUnauthed = "asset; unauthed",
  AssetError = "asset; error",
  Entrypoint = "entrypoint",
  EntrypointUnauthed = "entrypoint; unauthed",
  EntrypointError = "entrypoint; error",
}

interface FileVersion {
  major: number;
  minor: number;
}

const CURRENT_FILE_VERSION: FileVersion = { major: 1, minor: 0 };

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
    fetch(e.request).then((resp) =>
      cloneResponseInjectHeaders(resp, FileTypeDirective.None, null),
    ),
  );
});

async function getAndDeriveKeys() {
  if (!hashedPassword) {
    hashedPassword = await getPasswordFromCache();
  }

  if (!hashedPassword) {
    return false;
  }

  if (!filePathsKey) {
    filePathsKey = await deriveFilePathsKey(hashedPassword);
  }

  return true;
}

function requestServiceWorkerUpdate(newFileVersion: FileVersion) {
  if (updateRequested) {
    return;
  }

  updateRequested = true;
  self.registration.update().catch((err) => {
    console.error(
      `SwCrypts failed to update service worker for new major file version ${newFileVersion.major}:`,
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

  const [, resp, fileVersion, decryptedMetadata, decryptedData] =
    await fetchAndDecrypt(request);

  if (!resp.ok || !decryptedMetadata) {
    return cloneResponseInjectHeaders(
      resp,
      FileTypeDirective.AssetError,
      fileVersion,
    );
  }

  const headers = new Headers(resp.headers);
  headers.set("Content-Type", decryptedMetadata.mimeType);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(swCryptsFileTypeHeader, FileTypeDirective.Asset);
  headers.set(swCryptsFileVersionHeader, fileVersionToDebugString(fileVersion));

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

  const [, resp, fileVersion, decryptedMetadata, decryptedPage] =
    await fetchAndDecrypt(request);

  if (!resp.ok || !decryptedMetadata) {
    return cloneResponseInjectHeaders(
      resp,
      FileTypeDirective.EntrypointError,
      fileVersion,
    );
  }

  const decodedPage = decoder.decode(decryptedPage);

  const headers = new Headers(resp.headers);
  headers.set("Content-Type", decryptedMetadata.mimeType);
  headers.set(swCryptsFileTypeHeader, FileTypeDirective.Entrypoint);
  headers.set(swCryptsFileVersionHeader, fileVersionToDebugString(fileVersion));

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
  | [URL, Response, FileVersion, FileMetadata, ArrayBuffer]
  | [URL, Response, FileVersion | null, null, null]
> {
  if (!hashedPassword || !filePathsKey) {
    throw new Error();
  }

  const url = new URL(request.url);

  url.pathname = `/${await encryptFilePath(
    url.pathname.slice(1) + (url.pathname.endsWith("/") ? "index.html" : ""),
    filePathsKey,
  )}.swcrypts.enc`;

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
  const decryptedData = await decrypt(encryptedData, hashedPassword);

  const decryptedView = new DataView(decryptedData);

  const fileVersion: FileVersion = {
    major: decryptedView.getUint8(0),
    minor: decryptedView.getUint8(1),
  };

  if (fileVersion.major !== CURRENT_FILE_VERSION.major) {
    if (fileVersion.major > CURRENT_FILE_VERSION.major) {
      requestServiceWorkerUpdate(fileVersion);
    }

    return [url, resp, fileVersion, null, null];
  } else if (fileVersion.minor > CURRENT_FILE_VERSION.minor) {
    requestServiceWorkerUpdate(fileVersion);
  }

  const metadataLength = decryptedView.getUint32(2);
  const metadata = decryptedData.slice(6, 6 + metadataLength);

  let decodedMetadata: unknown;
  try {
    decodedMetadata = JSON.parse(decoder.decode(metadata));
  } catch {
    return [url, resp, fileVersion, null, null];
  }

  const parsedMetadata = safeParse(FileMetadata, decodedMetadata);

  if (!parsedMetadata.success) {
    return [url, resp, fileVersion, null, null];
  }

  const content = decryptedData.slice(6 + metadataLength);

  return [url, resp, fileVersion, parsedMetadata.output, content];
}

function cloneResponseInjectHeaders(
  resp: Response,
  fileType: FileTypeDirective,
  fileVersion: FileVersion | null,
) {
  if (resp.type === "opaque") {
    return resp;
  }

  const headers = new Headers(resp.headers);

  headers.set(swCryptsFileTypeHeader, fileType);
  if (fileVersion !== null) {
    headers.set(
      swCryptsFileVersionHeader,
      fileVersionToDebugString(fileVersion),
    );
  }

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

function fileVersionToDebugString(fileVersion: FileVersion) {
  return `${fileVersion.major}.${fileVersion.minor}`;
}
