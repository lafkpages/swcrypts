/// <reference no-default-lib="true" />
/// <reference lib="webworker" />

import { contentType } from "mime-types";
import { decrypt } from "../..";
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
  }

  e.respondWith(fetch(e.request));
});

self.addEventListener("message", (e) => {
  if (typeof e.data !== "string") return;
  hashedPassword = e.data;
});

async function fetchAsset(request: Request) {
  if (!hashedPassword) {
    return new Response("Unauthorized SwCrypts", { status: 401 });
  }

  const url = new URL(request.url);
  url.pathname += ".enc";

  const resp = await fetch(url, request);

  if (!resp.ok) {
    return resp;
  }

  const encryptedData = await resp.bytes();
  const decryptedData = await decrypt(encryptedData, hashedPassword);

  return new Response(decryptedData, {
    ...resp,
    headers: {
      ...resp.headers,
      "Content-Type":
        contentType(url.pathname.replace(/^.*\/|\.enc$/g, "")) ||
        "application/octet-stream",
    },
  });
}
