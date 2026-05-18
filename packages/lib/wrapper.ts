import _wrapper from "./wrapper-dist/index.html" with { type: "text" };
import _swJs from "./wrapper-dist/index.js" with { type: "text" };

const wrapperHtml = _wrapper as unknown as string;
const swJs = _swJs as unknown as string;

export function getWrapperHtml(encryptedPage: Uint8Array, salt: string) {
  return wrapperHtml
    .replace('"{{ENCRYPTED_PAGE}}"', JSON.stringify(encryptedPage.toBase64()))
    .replace('"{{SALT}}"', JSON.stringify(salt));
}

export function getServiceWorkerJs(assets: string[]) {
  return swJs.replace('["{{ASSETS}}"]', JSON.stringify(assets));
}
