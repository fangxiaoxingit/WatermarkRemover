import {
  contextFromUrl,
  validateAsset,
  validateBatch,
  isExtensionPage,
} from "./core";
import type { Task, TaskProgress } from "./types";
import {
  LocalizedError,
  errorMessage,
  message,
  resolveLocale,
  type Locale,
  type LocalizedText,
} from "./i18n";
import { isActiveStatus, normalizeStatus } from "./task-status";
import { restoreTaskDetail } from "./task-text";
const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
const active = (task: Task) => isActiveStatus(task.status);
function restoreTask(task: Task): Task {
  return {
    ...task,
    status: normalizeStatus(task.status) || "failed",
    locale: task.locale === "en" ? "en" : "zh-CN",
    detail: restoreTaskDetail(task.detail),
  };
}
async function exportLocale(): Promise<Locale> {
  const { language } = await chrome.storage.local.get("language");
  return resolveLocale(language, chrome.i18n?.getUILanguage?.() || "zh-CN");
}
function progressDetail(value: unknown): string | LocalizedText {
  if (typeof value === "string") return restoreTaskDetail(value.slice(0, 300));
  if (
    !value ||
    typeof value !== "object" ||
    !("key" in value) ||
    typeof value.key !== "string"
  )
    return "";
  const params: Record<string, string | number> = {};
  if ("params" in value && value.params && typeof value.params === "object") {
    for (const [key, item] of Object.entries(value.params).slice(0, 12)) {
      if (typeof item === "number" && Number.isFinite(item)) params[key] = item;
      else if (typeof item === "string") params[key] = item.slice(0, 300);
    }
  }
  return message(value.key.slice(0, 300), params);
}
const queues = new Map<string, Promise<unknown>>();
function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) || Promise.resolve())
    .catch(() => {})
    .then(work);
  queues.set(key, next);
  void next
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    })
    .catch(() => {});
  return next;
}
const fromExtension = (sender: chrome.runtime.MessageSender, path?: string) =>
  isExtensionPage(sender.url || "", chrome.runtime.id, path);
// Chrome keeps sender.url at the document's initial URL after SPA navigation.
// MessageSender.tab contains the browser's current URL; never infer scope from assets.
function senderContext(sender: chrome.runtime.MessageSender) {
  if (sender.tab?.id === undefined || sender.frameId !== 0) return null;
  try {
    const currentUrl = sender.tab.url || "";
    if (new URL(sender.url || "").origin !== new URL(currentUrl).origin)
      return null;
    return contextFromUrl(currentUrl);
  } catch {
    return null;
  }
}
const fromRunner = (sender: chrome.runtime.MessageSender) =>
  fromExtension(sender, "/offscreen.html") && !sender.tab;
async function readTask(id: string): Promise<Task> {
  if (!/^[\w-]{36}$/.test(id)) throw new LocalizedError("任务不存在");
  const data = await chrome.storage.session.get(`task:${id}`);
  if (!data[`task:${id}`]) throw new LocalizedError("任务已过期，请重新导出");
  return restoreTask(data[`task:${id}`]);
}
function progressOf(task: Task): TaskProgress {
  return {
    id: task.id,
    platform: task.assets[0]?.platform,
    conversationId: task.assets[0]?.conversationId,
    status: task.status,
    progress: task.progress || 0,
    detail: task.detail || "",
    retryable:
      !active(task) &&
      task.status !== "completed" &&
      !!task.assets.length &&
      (task.mode !== "individual" ||
        task.savedIndices?.length !== task.assets.length),
  };
}
async function store(task: Task) {
  await chrome.storage.session.set({ [`task:${task.id}`]: task });
  if (task.ownerTab !== undefined)
    void chrome.tabs
      .sendMessage(task.ownerTab, {
        type: "EXPORT_PROGRESS",
        task: progressOf(task),
      })
      .catch(() => {});
}
// Use browser-confirmed saves, including a file that completed just before cancellation.
async function refreshSaved(task: Task) {
  const saved = new Set(task.savedIndices || []);
  for (const [index, id] of Object.entries(task.downloads || {})) {
    if (saved.has(Number(index))) continue;
    const [item] = await chrome.downloads.search({ id });
    if (item?.state === "complete") saved.add(Number(index));
  }
  task.savedIndices = [...saved];
}
async function allTasks(): Promise<Task[]> {
  return Object.entries(await chrome.storage.session.get(null))
    .filter(([key]) => key.startsWith("task:"))
    .map(([, task]) => restoreTask(task));
}
function assertOwner(task: Task, sender: chrome.runtime.MessageSender) {
  const context = senderContext(sender);
  if (
    task.ownerTab !== sender.tab?.id ||
    !context ||
    task.assets[0]?.platform !== context.platform ||
    task.assets[0]?.conversationId !== context.conversationId
  )
    throw new LocalizedError("任务不属于当前聊天");
}
let creating: Promise<void> | undefined;
async function ensureRunner() {
  if (creating) return creating;
  creating = (async () => {
    const found = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL("offscreen.html")],
    });
    if (!found.length)
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification:
          "在不打开新标签页的情况下验证原始图片并创建下载文件 Blob",
      });
  })();
  try {
    await creating;
  } finally {
    creating = undefined;
  }
}
async function start(
  assets: Task["assets"],
  mode: Task["mode"],
  ownerTab: number,
  fileIndices = assets.map((_, i) => i),
  locale?: Locale,
) {
  if ((await allTasks()).some((t) => t.ownerTab === ownerTab && active(t)))
    throw new LocalizedError("当前页面已有导出任务，请等待完成或取消");
  const task: Task = {
    id: crypto.randomUUID(),
    assets,
    mode,
    fileIndices,
    ownerTab,
    createdAt: Date.now(),
    locale: locale || (await exportLocale()),
    status: "preparing",
    progress: 0,
    detail: message("准备导出 {count} 张原图", { count: assets.length }),
  };
  await store(task);
  try {
    await ensureRunner();
    const latest = await readTask(task.id);
    if (!active(latest)) return progressOf(latest);
    const response = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "START_EXPORT",
      task,
    });
    if (!response?.ok) {
      const detail = response?.error || "下载组件未能启动";
      throw new LocalizedError(
        typeof detail === "string" ? detail : detail.key,
        typeof detail === "string" ? undefined : detail.params,
      );
    }
  } catch (error) {
    const latest = await readTask(task.id);
    if (latest.status === "cancelled") return progressOf(latest);
    latest.status = "failed";
    latest.detail = errorMessage(error);
    await store(latest);
    throw error;
  }
  return progressOf(task);
}
const pendingNames = new Map<string, string>();
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const filename =
    item.byExtensionId === chrome.runtime.id
      ? pendingNames.get(item.url)
      : undefined;
  if (filename) {
    suggest({ filename, conflictAction: "uniquify" });
    pendingNames.delete(item.url);
  } else suggest();
});
async function handle(m: any, sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id) throw new LocalizedError("无效来源");
  if (m.type === "OPEN_OPTIONS") {
    if (!fromExtension(sender) && !senderContext(sender))
      throw new LocalizedError("不支持此页面");
    await chrome.runtime.openOptionsPage();
    return;
  }
  if (m.type === "CREATE_TASK") {
    const context = senderContext(sender);
    if (!context || sender.tab?.id === undefined)
      throw new LocalizedError("请从支持的聊天页或分享页导出");
    const prefs = await chrome.storage.local.get("platforms");
    if (prefs.platforms?.[context.platform] === false)
      throw new LocalizedError("该平台已停用");
    if (!Array.isArray(m.assets) || m.assets.length > 100)
      throw new LocalizedError("每批最多 100 张");
    const assets = m.assets.map((a: unknown) => validateAsset(a, context));
    if (assets.some((a: unknown) => !a))
      throw new LocalizedError("图片来源不受支持");
    validateBatch(assets);
    const mode =
      m.mode === "single"
        ? "single"
        : m.mode === "individual"
          ? "individual"
          : "zip";
    if (mode === "single" && assets.length !== 1)
      throw new LocalizedError("单张下载只支持一张图片");
    const old = (await allTasks())
      .filter((t) => !active(t) && Date.now() - t.createdAt > 7200000)
      .map((t) => `task:${t.id}`);
    if (old.length) await chrome.storage.session.remove(old);
    return start(assets, mode, sender.tab.id);
  }
  if (m.type === "CURRENT_TASK") {
    const context = senderContext(sender);
    if (!context || sender.tab?.id === undefined)
      throw new LocalizedError("不支持此页面");
    const task = (await allTasks())
      .filter(
        (t) =>
          t.ownerTab === sender.tab!.id &&
          t.assets[0]?.conversationId === context.conversationId &&
          t.assets[0]?.platform === context.platform,
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return task ? progressOf(task) : null;
  }
  if (
    [
      "CANCEL_DOWNLOAD",
      "RETRY_TASK",
      "TASK_STATUS",
      "SAVE_BLOB",
      "DOWNLOAD_STATE",
    ].includes(m.type)
  ) {
    const task = await readTask(String(m.id));
    if (m.type === "CANCEL_DOWNLOAD" || m.type === "RETRY_TASK") {
      assertOwner(task, sender);
      if (m.type === "RETRY_TASK") {
        if (active(task)) throw new LocalizedError("正在导出，请稍候");
        if (task.mode === "individual") await refreshSaved(task);
        const indices = task.assets
          .map((_, i) => i)
          .filter((i) =>
            task.mode === "individual"
              ? !task.savedIndices?.includes(i)
              : task.status === "partial" && task.failedIndices?.length
                ? task.failedIndices.includes(i)
                : true,
          );
        const assets = indices.map((i) => task.assets[i]);
        if (!assets.length)
          throw new LocalizedError("所有图片已保存，无需重试");
        validateBatch(assets);
        return start(
          assets,
          task.mode,
          task.ownerTab!,
          indices.map((i) => task.fileIndices?.[i] ?? i),
          task.locale,
        );
      }
      if (!active(task)) return progressOf(task);
      if (task.downloadId !== undefined)
        await chrome.downloads.cancel(task.downloadId).catch(() => {});
      if (task.mode === "individual") await refreshSaved(task);
      task.status = "cancelled";
      task.detail =
        task.mode === "individual"
          ? message(
              "已取消 · 已保存 {count}/{total} 张，重试仅下载未保存图片",
              {
                count: task.savedIndices?.length || 0,
                total: task.assets.length,
              },
            )
          : "导出已取消，可重新选择图片下载";
      await store(task);
      void chrome.runtime
        .sendMessage({
          target: "offscreen",
          type: "CANCEL_EXPORT",
          id: task.id,
        })
        .catch(() => {});
      return progressOf(task);
    }
    if (!fromRunner(sender)) throw new LocalizedError("无效下载来源");
    if (m.type === "DOWNLOAD_STATE") {
      if (task.status === "cancelled") return "interrupted";
      if (task.downloadId === undefined)
        throw new LocalizedError("保存尚未开始");
      const [item] = await chrome.downloads.search({ id: task.downloadId });
      if (task.mode === "individual" && item?.state === "complete") {
        await refreshSaved(task);
        await store(task);
      }
      return item?.state || "interrupted";
    }
    if (m.type === "TASK_STATUS") {
      if (task.status === "cancelled") return;
      const status = normalizeStatus(m.status);
      if (
        ![
          "fetching",
          "packing",
          "saving",
          "completed",
          "partial",
          "failed",
          "cancelled",
        ].includes(status || "")
      )
        throw new LocalizedError("无效状态");
      if (["completed", "partial"].includes(status!)) {
        if (task.mode === "individual") {
          await refreshSaved(task);
          const count = task.savedIndices?.length || 0;
          if (
            !count ||
            (status === "completed" && count !== task.assets.length)
          )
            throw new LocalizedError("浏览器尚未保存完成");
        } else {
          const [saved] =
            task.downloadId !== undefined
              ? await chrome.downloads.search({ id: task.downloadId })
              : [];
          if (saved?.state !== "complete")
            throw new LocalizedError("浏览器尚未保存完成");
        }
      }
      task.status = status!;
      task.progress = Math.max(0, Math.min(100, Number(m.progress) || 0));
      task.detail = progressDetail(m.detail);
      task.failedIndices = Array.isArray(m.failedIndices)
        ? m.failedIndices.filter(
            (i: unknown) =>
              Number.isInteger(i) &&
              Number(i) >= 0 &&
              Number(i) < task.assets.length,
          )
        : undefined;
      await store(task);
      return;
    }
    if (!active(task)) throw new LocalizedError("任务已结束");
    if (
      typeof m.url !== "string" ||
      !m.url.startsWith(`blob:${extensionOrigin}/`)
    )
      throw new LocalizedError("无效文件来源");
    const name = typeof m.filename === "string" ? m.filename : "";
    if (!/^[\w\u4e00-\u9fff-]{1,100}\.(zip|png|jpg|webp|gif)$/.test(name))
      throw new LocalizedError("无效文件名");
    if (
      task.mode === "individual" &&
      (!Number.isInteger(m.index) ||
        m.index < 0 ||
        m.index >= task.assets.length ||
        task.downloads?.[m.index] !== undefined)
    )
      throw new LocalizedError("无效或重复的图片序号");
    const filename = `${task.locale === "en" ? "Original Images" : "原图导出"}/${name}`;
    pendingNames.set(m.url, filename);
    try {
      task.downloadId = await chrome.downloads.download({
        url: m.url,
        filename,
        conflictAction: "uniquify",
        saveAs: false,
      });
    } catch (error) {
      pendingNames.delete(m.url);
      throw error;
    }
    if (task.mode === "individual") {
      task.downloads = { ...task.downloads, [m.index]: task.downloadId };
      task.progress = Math.round(((m.index + 0.8) / task.assets.length) * 100);
      task.detail = message("正在保存第 {index}/{total} 张原图", {
        index: m.index + 1,
        total: task.assets.length,
      });
    } else {
      task.progress = 95;
      task.detail = "正在保存到下载文件夹";
    }
    task.status = "saving";
    await store(task);
    return task.downloadId;
  }
  if (m.type === "LIST_TASKS" && fromExtension(sender))
    return (await allTasks())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((t) => ({ ...progressOf(t), ownerTab: t.ownerTab }));
  throw new LocalizedError("不支持的操作");
}
// A chat tab may be closed without interrupting its already-started export.
// Offscreen owns the bytes; completion still remains in the extension task history.
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m?.target === "offscreen") return false;
  const key = typeof m.id === "string" ? m.id : `tab:${sender.tab?.id}`;
  serialized(key, () => handle(m, sender)).then(
    (value) => reply({ ok: true, value }),
    (error) =>
      reply({
        ok: false,
        error: errorMessage(error),
      }),
  );
  return true;
});
