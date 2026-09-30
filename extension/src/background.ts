import {
  contextFromUrl,
  validateAsset,
  validateBatch,
  isExtensionPage,
} from "./core";
import type { Task, TaskProgress } from "./types";
const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
const active = (task: Task) =>
  ["准备中", "获取图片", "打包中", "浏览器保存中"].includes(task.status);
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
const fromRunner = (sender: chrome.runtime.MessageSender) =>
  fromExtension(sender, "/offscreen.html") && !sender.tab;
async function readTask(id: string): Promise<Task> {
  if (!/^[\w-]{36}$/.test(id)) throw new Error("任务不存在");
  const data = await chrome.storage.session.get(`task:${id}`);
  if (!data[`task:${id}`]) throw new Error("任务已过期，请重新导出");
  return data[`task:${id}`];
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
      task.status !== "已完成" &&
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
    .map(([, task]) => task);
}
function assertOwner(task: Task, sender: chrome.runtime.MessageSender) {
  const context = contextFromUrl(sender.url || "");
  if (
    task.ownerTab !== sender.tab?.id ||
    !context ||
    task.assets[0]?.platform !== context.platform ||
    task.assets[0]?.conversationId !== context.conversationId
  )
    throw new Error("任务不属于当前聊天");
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
) {
  if ((await allTasks()).some((t) => t.ownerTab === ownerTab && active(t)))
    throw new Error("当前页面已有导出任务，请等待完成或取消");
  const task: Task = {
    id: crypto.randomUUID(),
    assets,
    mode,
    fileIndices,
    ownerTab,
    createdAt: Date.now(),
    status: "准备中",
    progress: 0,
    detail: `准备导出 ${assets.length} 张原图`,
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
    if (!response?.ok) throw new Error(response?.error || "下载组件未能启动");
  } catch (error) {
    const latest = await readTask(task.id);
    if (latest.status === "已取消") return progressOf(latest);
    latest.status = "失败";
    latest.detail = error instanceof Error ? error.message : "下载组件启动失败";
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
  if (sender.id !== chrome.runtime.id) throw new Error("无效来源");
  if (m.type === "OPEN_OPTIONS") {
    if (!fromExtension(sender) && !contextFromUrl(sender.url || ""))
      throw new Error("不支持此页面");
    await chrome.runtime.openOptionsPage();
    return;
  }
  if (m.type === "CREATE_TASK") {
    const context = contextFromUrl(sender.url || "");
    if (!context || sender.tab?.id === undefined)
      throw new Error("请从支持的聊天页面导出");
    const prefs = await chrome.storage.local.get("platforms");
    if (prefs.platforms?.[context.platform] === false)
      throw new Error("该平台已停用");
    if (!Array.isArray(m.assets) || m.assets.length > 100)
      throw new Error("每批最多 100 张");
    const assets = m.assets.map((a: unknown) => validateAsset(a, context));
    if (assets.some((a: unknown) => !a)) throw new Error("图片来源不受支持");
    validateBatch(assets);
    const mode =
      m.mode === "single"
        ? "single"
        : m.mode === "individual"
          ? "individual"
          : "zip";
    if (mode === "single" && assets.length !== 1)
      throw new Error("单张下载只支持一张图片");
    const old = (await allTasks())
      .filter((t) => !active(t) && Date.now() - t.createdAt > 7200000)
      .map((t) => `task:${t.id}`);
    if (old.length) await chrome.storage.session.remove(old);
    return start(assets, mode, sender.tab.id);
  }
  if (m.type === "CURRENT_TASK") {
    const context = contextFromUrl(sender.url || "");
    if (!context || sender.tab?.id === undefined)
      throw new Error("不支持此页面");
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
        if (active(task)) throw new Error("正在导出，请稍候");
        if (task.mode === "individual") await refreshSaved(task);
        const indices = task.assets
          .map((_, i) => i)
          .filter((i) =>
            task.mode === "individual"
              ? !task.savedIndices?.includes(i)
              : task.status === "部分失败" && task.failedIndices?.length
                ? task.failedIndices.includes(i)
                : true,
          );
        const assets = indices.map((i) => task.assets[i]);
        if (!assets.length) throw new Error("所有图片已保存，无需重试");
        validateBatch(assets);
        return start(
          assets,
          task.mode,
          task.ownerTab!,
          indices.map((i) => task.fileIndices?.[i] ?? i),
        );
      }
      if (!active(task)) return progressOf(task);
      if (task.downloadId !== undefined)
        await chrome.downloads.cancel(task.downloadId).catch(() => {});
      if (task.mode === "individual") await refreshSaved(task);
      task.status = "已取消";
      task.detail =
        task.mode === "individual"
          ? `已取消 · 已保存 ${task.savedIndices?.length || 0}/${task.assets.length} 张，重试仅下载未保存图片`
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
    if (!fromRunner(sender)) throw new Error("无效下载来源");
    if (m.type === "DOWNLOAD_STATE") {
      if (task.status === "已取消") return "interrupted";
      if (task.downloadId === undefined) throw new Error("保存尚未开始");
      const [item] = await chrome.downloads.search({ id: task.downloadId });
      if (task.mode === "individual" && item?.state === "complete") {
        await refreshSaved(task);
        await store(task);
      }
      return item?.state || "interrupted";
    }
    if (m.type === "TASK_STATUS") {
      if (task.status === "已取消") return;
      if (
        ![
          "获取图片",
          "打包中",
          "浏览器保存中",
          "已完成",
          "部分失败",
          "失败",
          "已取消",
        ].includes(m.status)
      )
        throw new Error("无效状态");
      if (["已完成", "部分失败"].includes(m.status)) {
        if (task.mode === "individual") {
          await refreshSaved(task);
          const count = task.savedIndices?.length || 0;
          if (!count || (m.status === "已完成" && count !== task.assets.length))
            throw new Error("浏览器尚未保存完成");
        } else {
          const [saved] =
            task.downloadId !== undefined
              ? await chrome.downloads.search({ id: task.downloadId })
              : [];
          if (saved?.state !== "complete")
            throw new Error("浏览器尚未保存完成");
        }
      }
      task.status = m.status;
      task.progress = Math.max(0, Math.min(100, Number(m.progress) || 0));
      task.detail = String(m.detail || "").slice(0, 300);
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
    if (!active(task)) throw new Error("任务已结束");
    if (
      typeof m.url !== "string" ||
      !m.url.startsWith(`blob:${extensionOrigin}/`)
    )
      throw new Error("无效文件来源");
    const name = typeof m.filename === "string" ? m.filename : "";
    if (!/^[\w\u4e00-\u9fff-]{1,100}\.(zip|png|jpg|webp|gif)$/.test(name))
      throw new Error("无效文件名");
    if (
      task.mode === "individual" &&
      (!Number.isInteger(m.index) ||
        m.index < 0 ||
        m.index >= task.assets.length ||
        task.downloads?.[m.index] !== undefined)
    )
      throw new Error("无效或重复的图片序号");
    const filename = `原图导出/${name}`;
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
      task.detail = `正在保存第 ${m.index + 1}/${task.assets.length} 张原图`;
    } else {
      task.progress = 95;
      task.detail = "正在保存到下载文件夹";
    }
    task.status = "浏览器保存中";
    await store(task);
    return task.downloadId;
  }
  if (m.type === "LIST_TASKS" && fromExtension(sender))
    return (await allTasks())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((t) => ({ ...progressOf(t), ownerTab: t.ownerTab }));
  throw new Error("不支持的操作");
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
        error: error instanceof Error ? error.message : "操作失败",
      }),
  );
  return true;
});
