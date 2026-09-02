/// <reference path="./wrapper.d.ts" />

import { encrypt } from ".";
import wrapperHtml from "./wrapper/index.html?raw";
import swJs from "./wrapper/sw/index.ts?raw";

export interface WrapperOptions {
  cryptoCheck: Uint8Array;
  salt: string;

  /**
   * Custom CSS rules to override the default styling of SwCrypts' password
   * prompt page. Note that this is **NOT sanitised** and is injected directly into
   * the wrapper HTML.
   *
   * @default null
   */
  customStyles?: string | null;

  /**
   * The title shown in the wrapper page. Note that this is **NOT sanitised or escaped**.
   *
   * @default "This page is encrypted!"
   */
  title?: string;

  /**
   * The message shown in the wrapper page. Note that this is **NOT sanitised or escaped**.
   *
   * @default "Please enter the password to view the content."
   */
  message?: string;

  /**
   * Whether to show the "Powered by SwCrypts" attribution link in the
   * password prompt page.
   *
   * @default true
   */
  includeAttribution?: boolean;
}

const defaultWrapperOptions = {
  customStyles: null,
  title: "This page is encrypted!",
  message: "Please enter the password to view the content.",
  includeAttribution: true,
} satisfies Partial<WrapperOptions>;

export function getWrapperHtml(options: WrapperOptions) {
  const resolvedOptions = { ...defaultWrapperOptions, ...options };

  let html = wrapperHtml
    .replace(
      /"{{CRYPTOCHECK}}"/g,
      JSON.stringify(resolvedOptions.cryptoCheck.toBase64()),
    )
    .replace(/"{{SALT}}"/g, JSON.stringify(resolvedOptions.salt))
    .replace(/{{TITLE}}/g, resolvedOptions.title)
    .replace(/{{MESSAGE}}/g, resolvedOptions.message);

  if (resolvedOptions.customStyles) {
    html = html.replace("</style>", `${resolvedOptions.customStyles}</style>`);
  }

  if (!resolvedOptions.includeAttribution) {
    html = html.replace(/<aside>.+?<\/aside>/is, "");
  }

  return html;
}

export function getServiceWorkerJs() {
  return swJs;
}

export async function generateCryptoCheck(hashedPassword: string) {
  return await encrypt(
    crypto.getRandomValues(new Uint8Array(64)),
    hashedPassword,
  );
}
