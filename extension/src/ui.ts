import {
  setText,
  errorMessage,
  LocalizedError,
  type LocalizedText,
} from "./i18n";
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text: string | LocalizedText = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) setText(node, text);
  return node;
}
export function button(
  text: string | LocalizedText,
  fn: (event: MouseEvent) => void,
  className = "button",
) {
  const b = el("button", className, text);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
}
export function link(
  text: string | LocalizedText,
  url: string,
  className = "text-link",
) {
  const a = el("a", className, text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
export function errorText(e: unknown) {
  return errorMessage(e);
}
export async function request<T = any>(message: unknown): Promise<T> {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok)
    throw new LocalizedError(
      errorMessage(result?.error || "扩展连接已失效，请刷新页面"),
    );
  return result.value;
}
import iconSource from "../icons/source.svg?raw";
export const logo = iconSource.replace(
  'fill="#4d55cc"',
  'fill="currentColor" aria-hidden="true"',
);
