import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});
afterEach(() => vi.unstubAllGlobals());

function browser(language: string, stored: unknown = "auto") {
  const values: Record<string, unknown> = { language: stored };
  const listeners: Array<(changes: any, area: string) => void> = [];
  const storage = {
    get: async (key: string) => ({ [key]: values[key] }),
    set: async (update: Record<string, unknown>) => {
      const changes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(update)) {
        changes[key] = { oldValue: values[key], newValue: value };
        values[key] = value;
      }
      listeners.forEach((fn) => fn(changes, "local"));
    },
  };
  vi.stubGlobal("chrome", {
    i18n: { getUILanguage: () => language },
    storage: {
      local: storage,
      onChanged: { addListener: (fn: any) => listeners.push(fn) },
    },
  });
  return { values, storage, listeners };
}

it("resolves Chinese browser variants and falls back to English for unsupported languages", async () => {
  const { resolveLocale } = await import("../src/i18n");
  for (const input of ["zh", "zh-CN", "zh-Hans", "zh_TW", "ZH-hant-HK"])
    expect(resolveLocale("auto", input)).toBe("zh-CN");
  for (const input of ["en", "en-US", "en-GB", "fr-FR", "", "ja"])
    expect(resolveLocale("auto", input)).toBe("en");
  expect(resolveLocale("zh-CN", "en-US")).toBe("zh-CN");
  expect(resolveLocale("en", "zh-CN")).toBe("en");
  expect(resolveLocale(undefined, "en-US")).toBe("en");
  expect(resolveLocale("invalid", "zh-CN")).toBe("zh-CN");
});

it("can translate and create localized errors without browser or document globals", async () => {
  const { getLocale, translate, message, LocalizedError, errorMessage } =
    await import("../src/i18n");
  expect(getLocale()).toBe("zh-CN");
  expect(translate(message("已选择 {count} 张", { count: 3 }), "en")).toBe(
    "3 selected",
  );
  const error = new LocalizedError(
    message("获取失败（HTTP {status}）", { status: 403 }),
  );
  expect(error.message).toBe("获取失败（HTTP 403）");
  expect(translate(errorMessage(error), "en")).toBe("Fetch failed (HTTP 403)");
  expect(translate(errorMessage({ key: "已取消" }), "en")).toBe("Cancelled");
});

it("uses the browser UI language until a persisted preference overrides it", async () => {
  browser("en-GB", "zh-CN");
  const i18n = await import("../src/i18n");
  expect(i18n.getLocale()).toBe("en");
  await i18n.initLanguage();
  expect(i18n.getPreference()).toBe("zh-CN");
  expect(i18n.getLocale()).toBe("zh-CN");
});

it("persists an explicit preference and restores it in a new context", async () => {
  const { values } = browser("zh-CN");
  let i18n = await import("../src/i18n");
  await i18n.initLanguage();
  await i18n.setPreference("en");
  expect(values.language).toBe("en");
  expect(i18n.getLocale()).toBe("en");
  vi.resetModules();
  i18n = await import("../src/i18n");
  await i18n.initLanguage();
  expect(i18n.getPreference()).toBe("en");
  expect(i18n.getLocale()).toBe("en");
  await i18n.setPreference("auto");
  expect(values.language).toBe("auto");
  expect(i18n.getLocale()).toBe("zh-CN");
});

it("keeps the previous locale and preference when persistence fails", async () => {
  const { storage } = browser("zh-CN");
  const i18n = await import("../src/i18n");
  await i18n.initLanguage();
  const changes: string[] = [];
  i18n.onLanguageChange((locale) => changes.push(locale));
  storage.set = async () => {
    throw new Error("Storage unavailable");
  };
  await expect(i18n.setPreference("en")).rejects.toThrow("Storage unavailable");
  expect(i18n.getPreference()).toBe("auto");
  expect(i18n.getLocale()).toBe("zh-CN");
  expect(changes).toEqual([]);
});

it("updates other contexts from local language changes and supports unsubscribe", async () => {
  const { listeners } = browser("en-US");
  const i18n = await import("../src/i18n");
  await i18n.initLanguage();
  const changes: string[] = [];
  const stop = i18n.onLanguageChange((locale) => changes.push(locale));
  listeners.forEach((fn) => fn({ language: { newValue: "zh-CN" } }, "local"));
  expect(i18n.getLocale()).toBe("zh-CN");
  expect(changes).toEqual(["zh-CN"]);
  stop();
  listeners.forEach((fn) => fn({ language: { newValue: "en" } }, "local"));
  expect(changes).toEqual(["zh-CN"]);
  listeners.forEach((fn) => fn({ language: { newValue: "zh-CN" } }, "session"));
  expect(i18n.getPreference()).toBe("en");
});

it("uses browser defaults when the stored preference cannot be read", async () => {
  const { storage } = browser("de-DE", "invalid");
  const i18n = await import("../src/i18n");
  storage.get = async () => {
    throw new Error("Storage unavailable");
  };
  await i18n.initLanguage();
  expect(i18n.getPreference()).toBe("auto");
  expect(i18n.getLocale()).toBe("en");
});

it("keeps fallback text and interpolates every occurrence without altering missing placeholders", async () => {
  const { translate, message } = await import("../src/i18n");
  expect(translate("third-party error", "en")).toBe("third-party error");
  expect(
    translate(message("{count} / {count} / {missing}", { count: 0 }), "en"),
  ).toBe("0 / 0 / {missing}");
  expect(translate(message("已选择 {count} 张", { count: 2 }), "zh-CN")).toBe(
    "已选择 2 张",
  );
  expect(
    translate(message("启用{name}", { name: message("千问") }), "en"),
  ).toBe("Enable Qianwen");
});

it("refreshes bound text and attributes while preserving nodes and control state", async () => {
  browser("zh-CN");
  const i18n = await import("../src/i18n");
  await i18n.initLanguage();
  const node = {
    textContent: "",
    checked: true,
    attrs: new Map<string, string>(),
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
    },
  };
  const sibling = { textContent: "untouched" };
  const children = [node, sibling];
  const root = { querySelectorAll: () => children };
  i18n.setText(
    node as unknown as Node,
    i18n.message("已选择 {count} 张", { count: 2 }),
  );
  i18n.setAttribute(node as unknown as Element, "aria-label", "导出原图");
  await i18n.setPreference("en");
  i18n.refreshTranslations(root as unknown as ParentNode);
  expect(node.textContent).toBe("2 selected");
  expect(node.attrs.get("aria-label")).toBe("Export originals");
  expect(children[0]).toBe(node);
  expect(node.checked).toBe(true);
  expect(sibling.textContent).toBe("untouched");
});

it("reconstructs runtime errors as localized messages at the UI boundary", async () => {
  browser("en-US");
  Object.assign(globalThis.chrome, {
    runtime: {
      sendMessage: async () => ({
        ok: false,
        error: { key: "获取失败（HTTP {status}）", params: { status: 403 } },
      }),
    },
  });
  const { request, errorText } = await import("../src/ui");
  const { translate } = await import("../src/i18n");
  try {
    await request({ type: "CREATE_TASK" });
    throw new Error("Expected request to fail");
  } catch (error) {
    expect(translate(errorText(error))).toBe("Fetch failed (HTTP 403)");
  }
});

it("does not overwrite a language change received while initial storage is being read", async () => {
  const { storage, listeners } = browser("zh-CN", "zh-CN");
  let finish!: (value: { language: string }) => void;
  storage.get = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const i18n = await import("../src/i18n");
  const loading = i18n.initLanguage();
  listeners.forEach((fn) => fn({ language: { newValue: "en" } }, "local"));
  finish({ language: "zh-CN" });
  await loading;
  expect(i18n.getLocale()).toBe("en");
  expect(i18n.getPreference()).toBe("en");
});

it("keeps the latest selected language persisted when writes would finish out of order", async () => {
  const { storage, values, listeners } = browser("en-US");
  const pending: Array<{ value: string; finish: () => void }> = [];
  storage.set = (update) =>
    new Promise<void>((resolve) => {
      const value = update.language as string;
      pending.push({
        value,
        finish: () => {
          const oldValue = values.language;
          values.language = value;
          listeners.forEach((fn) =>
            fn({ language: { oldValue, newValue: value } }, "local"),
          );
          resolve();
        },
      });
    });
  const i18n = await import("../src/i18n");
  await i18n.initLanguage();
  const first = i18n.setPreference("zh-CN");
  const latest = i18n.setPreference("en");
  for (let index = 0; index < 2; index += 1) {
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    // Prefer completing the newer write first if the implementation overlaps them.
    const next = Math.max(
      0,
      pending.findIndex((write) => write.value === "en"),
    );
    pending.splice(next, 1)[0].finish();
  }
  await Promise.all([first, latest]);
  expect(values.language).toBe("en");
  expect(i18n.getPreference()).toBe("en");
  expect(i18n.getLocale()).toBe("en");
});

it("does not reapply an older write after another context changes the persisted language", async () => {
  const { storage, values, listeners } = browser("zh-CN");
  let finish!: () => void;
  storage.set = (update) =>
    new Promise<void>((resolve) => {
      values.language = update.language;
      listeners.forEach((fn) =>
        fn({ language: { newValue: update.language } }, "local"),
      );
      finish = resolve;
    });
  const i18n = await import("../src/i18n");
  await i18n.initLanguage();
  const saving = i18n.setPreference("en");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  values.language = "zh-CN";
  listeners.forEach((fn) => fn({ language: { newValue: "zh-CN" } }, "local"));
  finish();
  await saving;
  expect(values.language).toBe("zh-CN");
  expect(i18n.getPreference()).toBe("zh-CN");
  expect(i18n.getLocale()).toBe("zh-CN");
});

it("continues saving a newer preference after an earlier write fails", async () => {
  const { storage, values } = browser("zh-CN");
  const save = storage.set;
  let attempts = 0;
  storage.set = async (update) => {
    attempts += 1;
    if (attempts === 1) throw new Error("Storage unavailable");
    await save(update);
  };
  const i18n = await import("../src/i18n");
  await i18n.initLanguage();
  const first = i18n.setPreference("zh-CN");
  const latest = i18n.setPreference("en");
  await expect(first).rejects.toThrow("Storage unavailable");
  await latest;
  expect(values.language).toBe("en");
  expect(i18n.getPreference()).toBe("en");
  expect(i18n.getLocale()).toBe("en");
});
