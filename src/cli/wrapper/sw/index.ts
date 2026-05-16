/// <reference no-default-lib="true" />
/// <reference lib="webworker" />

import { contentType } from "mime-types";
import { decrypt } from "../../..";
import { patchCspForInlineScript } from "./csp";

declare const self: ServiceWorkerGlobalScope;

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
    console.debug(
      "SwCrypts service worker intercepting fetch for asset",
      url.pathname,
    );

    e.respondWith(fetchAsset(e.request));

    return;
  } else if (e.request.mode === "navigate") {
    e.respondWith(fetchEntryPoint(e.request));
    return;
  }

  e.respondWith(fetch(e.request));
});

self.addEventListener("message", (e) => {
  if (typeof e.data !== "string") return;
  hashedPassword = e.data;
});

async function fetchAsset(request: Request) {
  if (!hashedPassword) {
    return new Response("Unauthorized SwCrypts", {
      status: 401,
    });
  }

  const url = new URL(request.url);
  url.pathname += ".enc";

  const resp = await fetch(url, request);

  if (!resp.ok) {
    return resp;
  }

  const encryptedData = await resp.bytes();
  const decryptedData = await decrypt(encryptedData, hashedPassword);

  const headers = new Headers(resp.headers);
  headers.set(
    "Content-Type",
    contentType(url.pathname.replace(/^.*\/|\.enc$/g, "")) ||
      "application/octet-stream",
  );
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(decryptedData, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

async function fetchEntryPoint(request: Request) {
  const resp = await fetch(request);

  if (!hashedPassword) {
    return resp;
  }

  if (!resp.ok) {
    return resp;
  }

  const wrapperHtml = await resp.text();
  const encryptedPageMatch = wrapperHtml.match(
    /=Uint8Array\.fromBase64\(("[\w+/=]+")\);/,
  )?.[1];

  if (!encryptedPageMatch) {
    return resp;
  }

  const encryptedPage = Uint8Array.fromBase64(JSON.parse(encryptedPageMatch));
  const decryptedPage = await decrypt(encryptedPage, hashedPassword);
  const decodedPage = new TextDecoder().decode(decryptedPage);

  const headers = new Headers(resp.headers);
  headers.set("Content-Type", "text/html");

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
    `${decodedPage}<script${nonceAttr}>navigator.serviceWorker.register("/__swcrypts_sw.js",{scope:"/"});navigator.serviceWorker.ready.then(r=>{r.active.postMessage(localStorage.getItem("__swcrypts_hashed_password"))})</script>`,
    {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    },
  );
}
