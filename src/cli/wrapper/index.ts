/// <reference lib="dom" />

import { decrypt, hashPassword } from "../..";

const hashedPasswordKey = "__swcrypts_hashed_password";
const encryptedPage = Uint8Array.fromBase64("{{ENCRYPTED_PAGE}}");

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

function setupUi() {
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("main form")!;
    const input = form.querySelector<HTMLInputElement>("input[type=password]")!;
    const button = form.querySelector("button")!;

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
  });
}

function openPage(decryptedPage: ArrayBuffer) {
  document.open();
  document.write(new TextDecoder().decode(decryptedPage));
  document.close();
}
