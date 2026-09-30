import "./page.css";
import { el, button, logo, request } from "./ui";
import { contextFromUrl } from "./core";
import { platforms, getSettings } from "./platforms";
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
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id)
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
          window.close();
        } catch {
          status.textContent = "请刷新聊天页，再打开图片面板。";
        }
    },
    "primary",
  ),
  button("设置与帮助", () => void chrome.runtime.openOptionsPage(), "button"),
);
void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }),
    context = contextFromUrl(tab?.url || ""),
    settings = await getSettings();
  status.textContent = context
    ? `${platforms[context.platform].name} · ${settings[context.platform] ? "已启用" : "已停用，请在设置中启用"}`
    : "当前页面不支持，请打开千问或豆包聊天。";
  const tasks = await request<any[]>({ type: "LIST_TASKS" });
  if (tasks.length) {
    app.append(el("h3", "recent-title", "最近任务"));
    for (const t of tasks.slice(0, 3)) {
      const b = button(
        t.status,
        () => {
          if (t.ownerTab)
            void chrome.tabs.update(t.ownerTab, { active: true }).catch(() => {
              status.textContent = "原聊天页已关闭，请重新打开聊天。";
            });
        },
        "task-link",
      );
      app.append(b);
    }
  }
})();
