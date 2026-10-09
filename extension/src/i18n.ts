import { english } from "./translations";

export type Locale = "zh-CN" | "en";
export type LanguagePreference = "auto" | Locale;
export type LocalizedText = {
  key: string;
  params?: Record<string, string | number | LocalizedText>;
};

let preference: LanguagePreference = "auto";
let locale: Locale | undefined;
let initialization: Promise<void> | undefined;
let storageRevision = 0;
let languageWrites = Promise.resolve();
const listeners = new Set<(locale: Locale) => void>();

function browserLanguage(): string | undefined {
  try {
    return typeof chrome === "undefined"
      ? undefined
      : chrome.i18n?.getUILanguage?.();
  } catch {
    return undefined;
  }
}
function validPreference(value: unknown): LanguagePreference {
  return value === "en" || value === "zh-CN" ? value : "auto";
}
export function resolveLocale(value: unknown, browserLanguage: string): Locale {
  if (value === "en" || value === "zh-CN") return value;
  return /^zh(?:[-_]|$)/i.test(browserLanguage) ? "zh-CN" : "en";
}
export function getLocale(): Locale {
  if (locale) return locale;
  const language = browserLanguage();
  return language === undefined ? "zh-CN" : resolveLocale(preference, language);
}
export function getPreference(): LanguagePreference {
  return preference;
}
function applyPreference(value: LanguagePreference): void {
  const previous = getLocale();
  const changedPreference = preference !== value;
  preference = value;
  const language = browserLanguage();
  locale =
    value === "auto" && language === undefined
      ? "zh-CN"
      : resolveLocale(value, language ?? "");
  if (previous !== locale || changedPreference)
    listeners.forEach((fn) => fn(locale!));
}
export function initLanguage(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    let saved: unknown;
    const revision = storageRevision;
    if (typeof chrome !== "undefined") {
      chrome.storage?.onChanged?.addListener((changes, area) => {
        if (area === "local" && changes.language) {
          storageRevision += 1;
          applyPreference(validPreference(changes.language.newValue));
        }
      });
      try {
        saved = (await chrome.storage?.local?.get("language"))?.language;
      } catch {
        // Reading a preference must not prevent the extension from loading.
      }
    }
    if (revision === storageRevision) applyPreference(validPreference(saved));
  })();
  return initialization;
}
export function setPreference(value: LanguagePreference): Promise<void> {
  // Keep writes in selection order so an older request cannot persist last.
  const saving = languageWrites.then(async () => {
    const revision = storageRevision;
    if (typeof chrome !== "undefined" && chrome.storage?.local)
      await chrome.storage.local.set({ language: value });
    // A storage event already reflects the saved value or a newer context change.
    if (revision === storageRevision) applyPreference(value);
  });
  languageWrites = saving.catch(() => {});
  return saving;
}
export function onLanguageChange(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function message(
  key: string,
  params?: LocalizedText["params"],
): LocalizedText {
  return params ? { key, params } : { key };
}
function isLocalizedText(value: unknown): value is LocalizedText {
  return (
    !!value &&
    typeof value === "object" &&
    "key" in value &&
    typeof value.key === "string"
  );
}
function render(
  value: string | LocalizedText,
  language: Locale,
  depth: number,
): string {
  const text = typeof value === "string" ? message(value) : value;
  const template =
    language === "en" ? (english[text.key] ?? text.key) : text.key;
  if (!text.params || depth > 10) return template;
  return template.replace(/\{([\w]+)\}/g, (placeholder, name: string) => {
    const param = text.params?.[name];
    if (typeof param === "string" || typeof param === "number")
      return String(param);
    return isLocalizedText(param)
      ? render(param, language, depth + 1)
      : placeholder;
  });
}
export function translate(
  value: string | LocalizedText,
  language: Locale = getLocale(),
): string {
  return render(value, language, 0);
}

type Binding = {
  text?: string | LocalizedText;
  attributes?: Map<string, string | LocalizedText>;
};
const bindings = new WeakMap<Node, Binding>();
function bindingFor(node: Node): Binding {
  let binding = bindings.get(node);
  if (!binding) bindings.set(node, (binding = {}));
  return binding;
}
export function setText(node: Node, value: string | LocalizedText): void {
  bindingFor(node).text = value;
  node.textContent = translate(value);
}
export function setAttribute(
  node: Element,
  attribute: string,
  value: string | LocalizedText,
): void {
  const binding = bindingFor(node);
  if (!binding.attributes) binding.attributes = new Map();
  binding.attributes.set(attribute, value);
  node.setAttribute(attribute, translate(value));
}
export function refreshTranslations(root: ParentNode): void {
  function refresh(node: Node): void {
    const binding = bindings.get(node);
    if (!binding) return;
    if (binding.text !== undefined) node.textContent = translate(binding.text);
    binding.attributes?.forEach((value, attribute) => {
      (node as Element).setAttribute(attribute, translate(value));
    });
  }
  refresh(root);
  root.querySelectorAll("*").forEach(refresh);
}
export class LocalizedError extends Error {
  readonly localized: LocalizedText;
  constructor(value: string | LocalizedText, params?: LocalizedText["params"]) {
    const localized =
      typeof value === "string" ? message(value, params) : value;
    // Error.message stays readable to legacy callers; semantic text travels separately.
    super(translate(localized, "zh-CN"));
    this.name = "LocalizedError";
    this.localized = localized;
  }
}
export function errorMessage(error: unknown): LocalizedText | string {
  if (isLocalizedText(error)) return error;
  if (
    error &&
    typeof error === "object" &&
    "localized" in error &&
    isLocalizedText(error.localized)
  )
    return error.localized;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return message("操作失败，请重试");
}
