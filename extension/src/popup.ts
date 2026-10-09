import "./page.css";
import { el, button, logo, request, errorText } from "./ui";
import { contextFromUrl } from "./core";
import { platforms, getSettings } from "./platforms";
import {
  getLocale,
  initLanguage,
  message,
  onLanguageChange,
  refreshTranslations,
  setText,
} from "./i18n";
import { statusLabel } from "./task-status";
import type { Task } from "./types";

async function initialize() {
  await initLanguage();
  const app = document.querySelector("#app")!;
  app.className = "popup";
  const title = el("div", "brand");
  title.innerHTML = logo;
  title.append(el("span", "", "AI 原图导出"));
  app.append(title, el("p", "muted", "把好图片，完整保存。"));
  const status = el("p", "popup-status", "正在识别当前页面…");
  app.append(status);
  app.append(
    button(
      "打开图片面板",
      async () => {
        try {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tab?.id === undefined) return;
          await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
          window.close();
        } catch {
          setText(status, "请刷新当前页面，再打开图片面板。");
        }
      },
      "primary",
    ),
    button("设置与帮助", () => void chrome.runtime.openOptionsPage(), "button"),
  );
  const pageTitle = document.querySelector("title")!;
  setText(pageTitle, "AI 原图导出");
  function syncLanguage() {
    document.documentElement.lang = getLocale();
    refreshTranslations(document);
  }
  onLanguageChange(syncLanguage);
  syncLanguage();
  try {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      }),
      context = contextFromUrl(tab?.url || ""),
      settings = await getSettings();
    setText(
      status,
      context
        ? message("{name} · {status}", {
            name: message(platforms[context.platform].name),
            status: message(
              settings[context.platform] ? "已启用" : "已停用，请在设置中启用",
            ),
          })
        : "当前页面不支持，请打开千问或豆包聊天页、分享页。",
    );
    const tasks = await request<Task[]>({ type: "LIST_TASKS" });
    if (tasks.length) {
      app.append(el("h3", "recent-title", "最近任务"));
      for (const t of tasks.slice(0, 3)) {
        const b = button(
          statusLabel(t.status),
          async () => {
            if (t.ownerTab)
              try {
                await chrome.tabs.update(t.ownerTab, { active: true });
              } catch {
                setText(status, "原页面已关闭，请重新打开聊天页或分享页。");
              }
          },
          "task-link",
        );
        app.append(b);
      }
    }
  } catch (error) {
    setText(status, errorText(error));
  }
}

void initialize();
