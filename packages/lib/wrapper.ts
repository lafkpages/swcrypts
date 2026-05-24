import _wrapper from "./wrapper-dist/index.html" with { type: "text" };
import _swJs from "./wrapper-dist/index.js" with { type: "text" };

const wrapperHtml = _wrapper as unknown as string;
const swJs = _swJs as unknown as string;

export interface WrapperOptions {
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

const defaultWrapperOptions: Required<WrapperOptions> = {
  customStyles: null,
  title: "This page is encrypted!",
  message: "Please enter the password to view the content.",
  includeAttribution: true,
};

export function getWrapperHtml(
  encryptedPage: Uint8Array,
  salt: string,
  options?: WrapperOptions,
) {
  const resolvedOptions = { ...defaultWrapperOptions, ...options };

  let html = wrapperHtml
    .replace('"{{ENCRYPTED_PAGE}}"', JSON.stringify(encryptedPage.toBase64()))
    .replace('"{{SALT}}"', JSON.stringify(salt))
    .replaceAll("{{TITLE}}", resolvedOptions.title)
    .replace("{{MESSAGE}}", resolvedOptions.message);

  if (resolvedOptions.customStyles) {
    html = html.replace("</style>", `${resolvedOptions.customStyles}</style>`);
  }

  if (!resolvedOptions.includeAttribution) {
    html = html.replace(/<aside>.+?<\/aside>/is, "");
  }

  return html;
}

export function getServiceWorkerJs(assets: string[]) {
  return swJs.replace('["{{ASSETS}}"]', JSON.stringify(assets));
}
