/// <reference no-default-lib="true" />
/// <reference lib="webworker" />

import { contentType } from "mime-types";

import { decrypt, encrypt, serviceWorkerFileName } from "../..";
import { patchCspForInlineScript } from "./csp";

declare const self: ServiceWorkerGlobalScope;

const swCryptsTypeHeader = "X-SwCrypts-Type";

const assets = ["{{ASSETS}}"];
let hashedPassword: string | null = null;

self.addEventListener("install", (e) => {
  console.debug("SwCrypts service worker installing");
});

self.addEventListener("fetch", (e) => {
  console.debug(
    "SwCrypts service worker intercepting fetch for",
    e.request.url,
    e.request,
  );

  const url = new URL(e.request.url);

  if (assets.includes(url.pathname)) {
    e.respondWith(fetchAsset(url, e.request));
    return;
  } else if (e.request.mode === "navigate") {
    e.respondWith(fetchEntryPoint(url, e.request));
    return;
  }

  e.respondWith(
    fetch(e.request).then((resp) => cloneResponseInjectHeaders(resp, "none")),
  );
});

self.addEventListener("message", (e) => {
  const data = e.data as unknown;

  if (
    data &&
    typeof data === "object" &&
    "type" in data &&
    data.type === "swcrypts:setHashedPassword" &&
    "hashedPassword" in data &&
    typeof data.hashedPassword === "string"
  ) {
    hashedPassword = data.hashedPassword;
  }
});

async function fetchAsset(url: URL, request: Request) {
  console.debug(
    "SwCrypts service worker intercepting fetch for asset",
    url.pathname,
  );

  if (!hashedPassword) {
    return new Response("Unauthorized SwCrypts", {
      status: 401,
      headers: {
        [swCryptsTypeHeader]: "asset; unauthed",
      },
    });
  }

  const [, resp, decryptedData] = await fetchAndDecrypt(request);

  if (!resp.ok) {
    return cloneResponseInjectHeaders(resp, "asset");
  }

  const headers = new Headers(resp.headers);
  headers.set(
    "Content-Type",
    contentType(url.pathname.replace(/^.*\//, "")) ||
      "application/octet-stream",
  );
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
    return cloneResponseInjectHeaders(
      await fetch(request),
      "entrypoint; unauthed",
    );
  }

  const [, resp, decryptedPage] = await fetchAndDecrypt(request);

  if (!resp.ok || !decryptedPage) {
    return cloneResponseInjectHeaders(resp, "entrypoint; error");
  }

  const decodedPage = new TextDecoder().decode(decryptedPage);

  const headers = new Headers(resp.headers);
  headers.set("Content-Type", "text/html");
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
    `${decodedPage}<script${nonceAttr}>navigator.serviceWorker.register("/${serviceWorkerFileName}",{scope:"/"});navigator.serviceWorker.ready.then(r=>{r.active.postMessage(localStorage.getItem("__swcrypts_hashed_password"))})</script>`,
    {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    },
  );
}

async function fetchAndDecrypt(
  request: Request,
): Promise<[URL, Response, ArrayBuffer | null]> {
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
    return [url, resp, null];
  }

  const encryptedData = await resp.bytes();

  return [url, resp, await decrypt(encryptedData, hashedPassword)];
}

function cloneResponseInjectHeaders(resp: Response, swCryptsType: string) {
  const headers = new Headers(resp.headers);
  headers.set(swCryptsTypeHeader, swCryptsType);
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}
