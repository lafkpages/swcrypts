/// <reference lib="dom" />

import { decrypt, hashPassword } from "../..";

let failed = false;

if (location.protocol !== "https:" && location.hostname !== "localhost") {
  alert(
    "This page must be served over HTTPS to work properly. Please use a secure context to access this page.",
  );
  failed = true;
}

const hashedPasswordKey = "__swcrypts_hashed_password";
let encryptedPage: Uint8Array<ArrayBuffer>;

if (failed) {
  setupUi();
} else {
  encryptedPage = Uint8Array.fromBase64("{{ENCRYPTED_PAGE}}");

  const storedHashedPassword = localStorage.getItem(hashedPasswordKey);

  if (storedHashedPassword) {
    let decryptedPage: ArrayBuffer | null = null;

    try {
      decryptedPage = await decrypt(encryptedPage, storedHashedPassword);
    } catch (err) {
      console.error("Decryption failed with stored hashed password:", err);
      localStorage.removeItem(hashedPasswordKey);
    }

    if (decryptedPage) {
      openPage(decryptedPage);
    } else {
      setupUi();
    }
  } else {
    setupUi();
  }
}

async function setupUi() {
  if (!failed) {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.register(
        "/__swcrypts_sw.js",
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

  if (document.readyState === "complete") {
    onDocumentLoad();
  } else {
    document.addEventListener("DOMContentLoaded", onDocumentLoad);
  }
}

function onDocumentLoad() {
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
    let decryptedPage: ArrayBuffer | null = null;

    try {
      decryptedPage = await decrypt(encryptedPage, hashedPassword);
    } catch (err) {
      console.error("Decryption failed:", err);
      alert("Incorrect password, please try again.");
      return;
    } finally {
      input.disabled = false;
      button.disabled = false;
    }

    if (decryptedPage) {
      localStorage.setItem(hashedPasswordKey, hashedPassword);
      openPage(decryptedPage);
    }
  });
}

function openPage(decryptedPage: ArrayBuffer) {
  const decodedPage = new TextDecoder().decode(decryptedPage);

  document.open();
  document.write(decodedPage);
  document.write(
    `<script>navigator.serviceWorker.register("/__swcrypts_sw.js",{scope:"/"});navigator.serviceWorker.ready.then(r=>{r.active.postMessage(localStorage.getItem(${JSON.stringify(hashedPasswordKey)}))})</script>`,
  );
  document.close();
}
