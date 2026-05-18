import _wrapper from "./wrapper-dist/index.html" with { type: "text" };
import _swJs from "./wrapper-dist/index.js" with { type: "text" };

const wrapperHtml = _wrapper as unknown as string;
const swJs = _swJs as unknown as string;

export interface WrapperOptions {
  /**
   * Custom CSS rules to override the default styling of SwCrypts' password
   * prompt page. Note that this is **NOT sanitised** and is injected directly into
   * the wrapper HTML.
   */
  customStyles?: string | null;
}

export function getWrapperHtml(
  encryptedPage: Uint8Array,
  salt: string,
  options?: WrapperOptions,
) {
  let html = wrapperHtml
    .replace('"{{ENCRYPTED_PAGE}}"', JSON.stringify(encryptedPage.toBase64()))
    .replace('"{{SALT}}"', JSON.stringify(salt));

  if (options?.customStyles) {
    html = html.replace("</style>", `${options.customStyles}</style>`);
  }

  return html;
}

export function getServiceWorkerJs(assets: string[]) {
  return swJs.replace('["{{ASSETS}}"]', JSON.stringify(assets));
}
