/// <reference lib="dom" />

import { decrypt, hashPassword, serviceWorkerFileName } from "..";
import {
  getPasswordFromCache,
  removeCache,
  savePasswordInCache,
} from "./cache";

let failed = false;

if (location.protocol !== "https:" && location.hostname !== "localhost") {
  alert(
    "This page must be served over HTTPS to work properly. Please use a secure context to access this page.",
  );
  failed = true;
}

const cryptoCheck = Uint8Array.fromBase64("{{CRYPTOCHECK}}");
const cryptoCheckExpectedLength = 64;

if (failed) {
  setupUi();
} else {
  await registerServiceWorker();

  const storedHashedPassword = await getPasswordFromCache();

  if (storedHashedPassword) {
    let decryptedCheck: ArrayBuffer | null = null;

    try {
      decryptedCheck = await decrypt(cryptoCheck, storedHashedPassword);
    } catch (err) {
      console.error("Decryption failed with stored hashed password:", err);
      await removeCache();
    }

    if (decryptedCheck?.byteLength === cryptoCheckExpectedLength) {
      location.reload();
    } else {
      setupUi();
    }
  } else {
    setupUi();
  }
}

async function setupUi() {
  if (document.readyState === "complete") {
    setupUiOnDocumentLoad();
  } else {
    document.addEventListener("DOMContentLoaded", setupUiOnDocumentLoad);
  }
}

function setupUiOnDocumentLoad() {
  const form = document.querySelector("main form")!;
  const input = form.querySelector<HTMLInputElement>("input[type=password]")!;
  const button = form.querySelector("button")!;

  if (failed) {
    input.disabled = true;
    button.disabled = true;
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = input.value;

    if (!password) {
      return;
    }

    input.disabled = true;
    button.disabled = true;

    const hashedPassword = await hashPassword(password, "{{SALT}}");
    let decryptedCheck: ArrayBuffer | null = null;

    try {
      decryptedCheck = await decrypt(cryptoCheck, hashedPassword);
    } catch (err) {
      console.error("Decryption failed:", err);
      alert("Incorrect password, please try again.");
      return;
    } finally {
      input.disabled = false;
      button.disabled = false;
    }

    if (decryptedCheck?.byteLength === cryptoCheckExpectedLength) {
      await savePasswordInCache(hashedPassword);
      location.reload();
    }
  });
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.register(
      `/${serviceWorkerFileName}`,
      { scope: "/" },
    );

    if (registration.installing) {
      console.debug("SwCrypts service worker installing");
    } else if (registration.waiting) {
      console.debug("SwCrypts service worker installed");
    } else if (registration.active) {
      console.debug("SwCrypts service worker active");
    }
  } else {
    alert(
      "Service workers are not supported in this browser. Please use a modern browser that supports service workers to access this page.",
    );
    failed = true;
  }
}
