import { contextFromUrl, Registry, validateBatch } from "./core";
import { getSettings, platforms, defaults } from "./platforms";
import { el, button, link, errorText, request, logo } from "./ui";
import {
  initLanguage,
  getLocale,
  onLanguageChange,
  message,
  setText,
  setAttribute,
  refreshTranslations,
  type LocalizedText,
} from "./i18n";
import { isActiveStatus, statusLabel } from "./task-status";
import type { Asset, TaskProgress } from "./types";
import styles from "./panel.css?inline";
let context = contextFromUrl(location.href),
  registry = context ? new Registry(context) : null,
  enabled = true,
  open = false;
let settings = defaults,
  settingsReady = false,
  lastUrl = location.href,
  host: HTMLElement | null = null,
  root: ShadowRoot | null = null,
  panel: HTMLElement | null = null;
let grid: HTMLElement,
  summary: HTMLElement,
  foot: HTMLElement,
  notice: HTMLElement,
  launch: HTMLButtonElement;
let viewer: HTMLDialogElement | null = null;
let previewTrigger: HTMLButtonElement | null = null;
function closeViewer(restoreFocus = true) {
  const previous = viewer;
  viewer = null;
  previous?.close();
  previous?.remove();
  if (restoreFocus) {
    const target = previewTrigger?.isConnected
      ? previewTrigger
      : root?.querySelector<HTMLButtonElement>(".zoom-image");
    target?.focus();
  }
  previewTrigger = null;
}
function showImage(asset: Asset, index: number, trigger: HTMLButtonElement) {
  if (!root) return;
  closeViewer(false);
  previewTrigger = trigger;
  const dialog = el("dialog", "image-viewer");
  viewer = dialog;
  setAttribute(
    dialog,
    "aria-label",
    message("图片 {index} 大图预览", { index: index + 1 }),
  );
  const heading = el("div", "viewer-heading");
  const close = button("×", () => closeViewer(), "viewer-close");
  setAttribute(close, "aria-label", "关闭大图预览");
  setAttribute(close, "title", "关闭（Esc）");
  heading.append(
    el("strong", "", message("图片 {index}", { index: index + 1 })),
    close,
  );
  const stage = el("div", "viewer-stage");
  const image = el("img");
  setAttribute(image, "alt", message("生成原图 {index}", { index: index + 1 }));
  image.referrerPolicy = "no-referrer";
  const status = el("p", "viewer-status", "正在加载原图…");
  status.setAttribute("role", "status");
  image.addEventListener("load", () => {
    setText(
      status,
      message("{width} × {height} · 按 Esc 关闭", {
        width: image.naturalWidth,
        height: image.naturalHeight,
      }),
    );
  });
  image.addEventListener("error", () => {
    setText(
      status,
      "原图加载失败，链接可能已过期，请关闭预览并刷新聊天页重试。",
    );
  });
  image.src = asset.originalUrl;
  stage.append(image);
  dialog.append(heading, stage, status);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target === stage) closeViewer();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeViewer();
  });
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  root.append(dialog);
  dialog.showModal();
  close.focus();
}
const channel = crypto.randomUUID();
let lastSignature = "";
let exportTask: TaskProgress | null = null,
  starting = false,
  progressBox: HTMLElement;
const busy = () =>
  starting || (!!exportTask && isActiveStatus(exportTask.status));
function acceptProgress(task: TaskProgress | null) {
  if (
    task &&
    (task.platform !== context?.platform ||
      task.conversationId !== context?.conversationId)
  )
    return;
  exportTask = task;
  renderProgress();
  renderFooter();
}
function renderProgress() {
  if (!progressBox) return;
  progressBox.hidden = !exportTask && !starting;
  progressBox.replaceChildren();
  if (progressBox.hidden) return;
  const task = exportTask,
    top = el("div", "progress-heading"),
    title = el("strong", "", statusLabel(task?.status || "preparing")),
    actions = el("div", "progress-actions");
  if (busy() && task)
    actions.append(
      button(
        "取消",
        async (event) => {
          if (!event.isTrusted) return;
          try {
            acceptProgress(
              await request({ type: "CANCEL_DOWNLOAD", id: task.id }),
            );
          } catch (error) {
            setNotice(errorText(error));
          }
        },
        "progress-action",
      ),
    );
  if (task?.retryable && !busy())
    actions.append(
      button(
        task.status === "partial" ? "重试失败项" : "重试",
        async (event) => {
          if (!event.isTrusted) return;
          starting = true;
          renderProgress();
          renderFooter();
          try {
            const next = await request<TaskProgress>({
              type: "RETRY_TASK",
              id: task.id,
            });
            if (exportTask?.id !== next.id) acceptProgress(next);
          } catch (error) {
            setNotice(errorText(error));
          } finally {
            starting = false;
            renderProgress();
            renderFooter();
          }
        },
        "progress-action",
      ),
    );
  top.append(
    title,
    el("span", "progress-percent", `${Math.round(task?.progress || 0)}%`),
    actions,
  );
  const bar = el("progress");
  bar.max = 100;
  bar.value = task?.progress || 0;
  setAttribute(bar, "aria-label", "导出进度");
  const detail = el("p", "progress-detail", task?.detail || "正在准备导出");
  detail.setAttribute("role", "status");
  progressBox.append(top, bar, detail);
  root
    ?.querySelectorAll<HTMLButtonElement>(".download-one")
    .forEach((b) => (b.disabled = busy()));
}

const control = (action: string) =>
  window.postMessage({ type: "WR_CONTROL", channel, action }, location.origin);
function setNotice(text: string | LocalizedText) {
  if (notice) setText(notice, text);
}
function dispose() {
  closeViewer(false);
  host?.remove();
  host = null;
  root = null;
  panel = null;
  open = false;
  lastSignature = "";
  exportTask = null;
  control("stop");
  if (context) registry?.reset(context);
}
function mount() {
  if (host || !context || !enabled) return;
  host = el("div");
  host.id = "wr-export-root";
  host.lang = getLocale();
  root = host.attachShadow({ mode: "open" });
  const style = el("style");
  style.textContent = styles;
  root.append(style);
  launch = button("", () => toggle(), "launcher");
  launch.innerHTML = logo;
  launch.append(el("span", "", "导出原图"), el("b", "", "0"));
  root.append(launch);
  panel = el("section", "panel");
  panel.setAttribute("role", "dialog");
  setAttribute(panel, "aria-label", "当前会话原图");
  panel.hidden = true;
  const header = el("header", "header"),
    brand = el("div", "brand");
  const mark = el("div", "mark");
  mark.innerHTML = logo;
  const heading = el("div");
  const title = el("h2");
  title.append(
    el("span", "", platforms[context.platform].name),
    el("span", "", " · 原图导出"),
  );
  heading.append(el("div", "eyebrow", "ORIGINALS"), title);
  brand.append(mark, heading);
  const close = button("×", () => toggle(false), "close");
  setAttribute(close, "aria-label", "关闭导出面板");
  header.append(
    brand,
    button(
      "设置与帮助",
      async (e) => {
        if (!e.isTrusted) return;
        try {
          await request({ type: "OPEN_OPTIONS" });
        } catch (err) {
          setNotice(errorText(err));
        }
      },
      "quiet",
    ),
    close,
  );
  panel.append(header);
  summary = el("p", "summary", "仅包含当前会话已加载的生成图片");
  panel.append(summary);
  progressBox = el("section", "export-progress");
  progressBox.hidden = true;
  setAttribute(progressBox, "aria-label", "导出状态");
  panel.append(progressBox);
  const toolbar = el("div", "toolbar");
  toolbar.append(
    button(
      "全选",
      () => {
        registry?.selectAll();
        render();
      },
      "small",
    ),
    button(
      "取消全选",
      () => {
        registry?.selected.clear();
        render();
      },
      "small",
    ),
    button(
      "重新扫描",
      () => {
        control("scan");
        setNotice("已重新扫描；等待生成完成或向上滚动加载历史图片。");
      },
      "small",
    ),
    button(
      "复制链接",
      async (e) => {
        if (!e.isTrusted) return;
        try {
          const list = registry?.snapshot() || [];
          validateBatch(list);
          await navigator.clipboard.writeText(
            list.map((a) => a.originalUrl).join("\n"),
          );
          setNotice("已复制所选原图链接，链接可能过期。");
        } catch (err) {
          setNotice(errorText(err));
        }
      },
      "small",
    ),
  );
  panel.append(toolbar);
  grid = el("div", "grid");
  panel.append(grid);
  notice = el("p", "notice");
  notice.setAttribute("role", "status");
  panel.append(notice);
  foot = el("footer", "footer");
  panel.append(foot);
  root.append(panel);
  document.documentElement.append(host);
  root.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") {
      toggle(false);
      launch.focus();
    }
  });
  render();
  void request<TaskProgress | null>({ type: "CURRENT_TASK" })
    .then(acceptProgress)
    .catch(() => {});
  control("start");
}
function toggle(force?: boolean) {
  open = force ?? !open;
  if (!panel) return;
  if (!open) closeViewer(false);
  panel.hidden = !open;
  launch.setAttribute("aria-expanded", String(open));
  if (open) {
    registry?.open();
    render();
    control("scan");
    panel.querySelector("button")?.focus();
  }
}
async function exportAssets(
  assets: Asset[],
  mode: "single" | "zip" | "individual",
  event: MouseEvent,
) {
  if (!event.isTrusted) return;
  if (busy()) return;
  try {
    validateBatch(assets);
    starting = true;
    exportTask = null;
    renderProgress();
    renderFooter();
    setNotice("");
    const task = await request<TaskProgress>({
      type: "CREATE_TASK",
      assets,
      mode,
    });
    if ((exportTask as TaskProgress | null)?.id !== task.id)
      acceptProgress(task);
  } catch (error) {
    setNotice(errorText(error));
  } finally {
    starting = false;
    renderProgress();
    renderFooter();
  }
}
function render() {
  if (!registry || !panel || !context) return;
  const all = [...registry.assets.values()];
  setText(launch.querySelector("b")!, String(all.length));
  setText(
    summary,
    message("已识别 {count} 张 · 仅含当前会话已加载内容", {
      count: all.length,
    }),
  );
  grid.replaceChildren();
  if (!all.length) {
    const empty = el("div", "empty");
    empty.innerHTML = logo;
    empty.append(
      el("h3", "", "还没有发现可导出的原图"),
      el(
        "p",
        "",
        "等待图片生成完成，或向上滚动加载历史后重新扫描。首次安装请刷新当前页面。",
      ),
    );
    grid.append(empty);
  }
  all.forEach((asset, index) => {
    const card = el("article", "card");
    const label = el("label", "preview");
    const image = el("img");
    image.src = asset.previewUrl || asset.originalUrl;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    setAttribute(
      image,
      "alt",
      message("生成原图 {index}", { index: index + 1 }),
    );
    const check = el("input");
    check.type = "checkbox";
    check.checked = registry!.selected.has(asset.assetId);
    setAttribute(
      check,
      "aria-label",
      message("选择图片 {index}", { index: index + 1 }),
    );
    check.addEventListener("change", () => {
      if (check.checked) registry!.selected.add(asset.assetId);
      else registry!.selected.delete(asset.assetId);
      renderFooter();
    });
    const number = el("span", "number", String(index + 1).padStart(2, "0"));
    label.append(image, check, number);
    const media = el("div", "thumbnail");
    const zoom = button(
      "",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        showImage(asset, index, zoom);
      },
      "zoom-image",
    );
    setAttribute(
      zoom,
      "aria-label",
      message("放大图片 {index}", { index: index + 1 }),
    );
    setAttribute(zoom, "title", "放大查看");
    zoom.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5M7.5 10.5h6m-3-3v6"/></svg>';
    media.append(label, zoom);
    card.append(media);
    const meta = el("div", "meta");
    meta.append(
      el(
        "span",
        "size",
        asset.width && asset.height
          ? `${asset.width} × ${asset.height}`
          : "原始尺寸",
      ),
      el("span", "tag", "原图资源"),
    );
    card.append(meta);
    const actions = el("div", "card-actions");
    actions.append(
      link("打开原图", asset.originalUrl),
      button(
        "下载",
        (e) => void exportAssets([asset], "single", e),
        "download-one",
      ),
    );
    card.append(actions);
    grid.append(card);
  });
  renderFooter();
  renderProgress();
}
function renderFooter() {
  if (!registry || !foot || !host) return;
  foot.replaceChildren();
  const info = el("div");
  info.append(
    el(
      "strong",
      "",
      message("已选择 {count} 张", { count: registry.selected.size }),
    ),
    el("span", "foot-note", "保留原始画质 · 单批最多 100 张"),
  );
  const save = button(
    "打包下载 ZIP",
    (e) => void exportAssets(registry!.snapshot(), "zip", e),
    "primary",
  );
  save.disabled = !registry.selected.size || busy();
  const individual = button(
    "逐张下载",
    (e) => void exportAssets(registry!.snapshot(), "individual", e),
    "secondary",
  );
  individual.disabled = !registry.selected.size || busy();
  const actions = el("div", "footer-actions");
  actions.append(individual, save);
  foot.append(info, actions);
}
window.addEventListener("message", (event) => {
  if (
    !settingsReady ||
    !enabled ||
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.type !== "WR_ASSETS" ||
    event.data.channel !== channel ||
    !context ||
    !registry
  )
    return;
  const actual = contextFromUrl(location.href);
  if (actual?.conversationId !== context.conversationId) return;
  if (
    event.data.context?.conversationId !== context.conversationId ||
    event.data.context?.platform !== context.platform ||
    !Array.isArray(event.data.assets) ||
    event.data.assets.length > 1000
  )
    return;
  const before = registry.assets.size;
  registry.merge(event.data.assets);
  const signature = [...registry.assets.values()]
    .map((a) => `${a.assetId}:${a.originalUrl}`)
    .join("|");
  if (signature === lastSignature) return;
  lastSignature = signature;
  render();
  if (open && registry.assets.size > before)
    setNotice(
      message("新增 {count} 张原图，尚未选中。", {
        count: registry.assets.size - before,
      }),
    );
});
const languageReady = initLanguage().catch(() => {});
let languageSubscribed = false;
async function syncSettings() {
  await languageReady;
  if (!languageSubscribed) {
    languageSubscribed = true;
    onLanguageChange((locale) => {
      if (host) host.lang = locale;
      if (root) refreshTranslations(root);
    });
  }
  try {
    settings = await getSettings();
    settingsReady = true;
    enabled = context ? settings[context.platform] : false;
    if (enabled) mount();
    else dispose();
  } catch {
    dispose();
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.platforms) void syncSettings();
});
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type === "EXPORT_PROGRESS") {
    acceptProgress(message.task);
    return;
  }
  if (message.type === "OPEN_PANEL") {
    if (!settingsReady) {
      void syncSettings().then(() => {
        if (!host) mount();
        toggle(true);
        reply({ ok: !!host });
      });
      return true;
    }
    if (!host) mount();
    toggle(true);
    reply({ ok: !!host });
  }
});
// SPA routes may use pushState without popstate; only compare the URL here, never poll page data.
setInterval(() => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  dispose();
  context = contextFromUrl(location.href);
  registry = context ? new Registry(context) : null;
  enabled = !!context && settings[context.platform];
  if (settingsReady && enabled) mount();
}, 400);
void syncSettings();
