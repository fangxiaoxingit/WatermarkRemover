import "./page.css";
import { el, button, link, logo, errorText } from "./ui";
import { platforms, getSettings } from "./platforms";
import type { Platform } from "./types";
import {
  getLocale,
  getPreference,
  initLanguage,
  message,
  onLanguageChange,
  refreshTranslations,
  setAttribute,
  setPreference,
  setText,
  type LanguagePreference,
} from "./i18n";

async function initialize() {
  await initLanguage();
  const app = document.querySelector("#app")!;
  const header = el("header", "page-header"),
    brand = el("a", "brand");
  brand.href = "options.html";
  brand.innerHTML = logo;
  brand.append(el("span", "", "AI 原图导出"));
  const headerControls = el("div", "header-controls"),
    languageLabel = el("label", "language-control"),
    language = el("select", "language-select");
  language.dataset.language = "";
  languageLabel.append(el("span", "", "界面语言"), language);
  for (const [value, label] of [
    ["auto", "跟随浏览器"],
    ["zh-CN", "简体中文"],
    ["en", "English"],
  ]) {
    const option = el("option", "", label);
    option.value = value;
    language.append(option);
  }
  setAttribute(language, "aria-label", "界面语言");
  headerControls.append(
    languageLabel,
    el("span", "version", `v${chrome.runtime.getManifest().version}`),
  );
  header.append(brand, headerControls);
  app.append(header);
  const layout = el("div", "settings-layout"),
    aside = el("aside", "sidebar");
  aside.append(
    el("p", "eyebrow", "YOUR CREATIVE TOOLKIT"),
    el("h1", "", "设置与帮助"),
    el("p", "sidebar-copy", "让好图片，保持原本的样子。"),
  );
  const nav = el("nav");
  setAttribute(nav, "aria-label", "设置栏目");
  const platformsButton = button(
      "◈   支持平台",
      () => show("platforms"),
      "nav-item active",
    ),
    helpButton = button("☷   使用说明", () => show("help"), "nav-item");
  nav.append(platformsButton, helpButton);
  aside.append(
    nav,
    el(
      "div",
      "privacy-note",
      "本地处理，无需账号\n图片从平台直接保存到你的设备。",
    ),
  );
  layout.append(aside);
  const main = el("main", "settings-main"),
    platformPage = el("section"),
    helpPage = el("section");
  helpPage.hidden = true;
  platformPage.append(
    el("span", "eyebrow", "CONNECTED PLATFORMS"),
    el("h2", "section-title", "从你创作的地方开始"),
    el("p", "lead", "启用需要的平台，在聊天页或分享页发现并导出原图。"),
  );
  const toast = el("p", "save-status");
  toast.setAttribute("role", "status");
  for (const [key, p] of Object.entries(platforms)) {
    const card = el("article", "platform-card"),
      top = el("div", "platform-top"),
      icon = el("div", `platform-icon ${key}`, p.icon),
      name = el("div");
    name.append(
      el("h3", "", p.name),
      el("span", "domain", new URL(p.url).hostname),
    );
    const label = el("label", "switch");
    const input = el("input");
    input.type = "checkbox";
    input.disabled = true;
    setAttribute(
      input,
      "aria-label",
      message("启用{name}", { name: message(p.name) }),
    );
    input.dataset.platform = key;
    const visual = el("span", "switch-track");
    label.append(input, visual);
    input.addEventListener("change", async () => {
      input.disabled = true;
      try {
        const values = await getSettings();
        await chrome.storage.local.set({
          platforms: { ...values, [key]: input.checked },
        });
        setText(
          toast,
          message(
            input.checked
              ? "已启用{name}，请刷新已打开的聊天页或分享页。"
              : "已停用{name}，已启动的下载会继续。",
            { name: message(p.name) },
          ),
        );
      } catch (error) {
        input.checked = !input.checked;
        setText(
          toast,
          message("保存失败：{error}", { error: errorText(error) }),
        );
      } finally {
        input.disabled = false;
      }
    });
    top.append(icon, name, label);
    card.append(
      top,
      el("p", "platform-desc", p.description),
      el("div", "status-pill", p.status),
      el("p", "platform-limit", p.limitations),
    );
    const bottom = el("div", "platform-bottom");
    bottom.append(
      el("span", "muted", "直接读取平台提供的原图"),
      link("打开平台 ↗", p.url),
    );
    card.append(bottom);
    platformPage.append(card);
  }
  platformPage.append(
    toast,
    el(
      "p",
      "muted small-print",
      "开启平台表示允许识别图片；支持状态以实际验证为准。平台只提供水印版时，不会自动修复或重新生成。",
    ),
  );
  helpPage.append(
    el("span", "eyebrow", "A LITTLE GUIDANCE"),
    el("h2", "section-title", "几步，带走你的原图"),
    el(
      "p",
      "lead",
      "首次安装或更新后，请刷新已打开的千问或豆包聊天页、分享页。",
    ),
  );
  const steps = [
    [
      "打开聊天或分享页",
      "进入千问或豆包的聊天页，或直接打开其分享链接。等待生成图片加载完成；聊天页向上滚动可加载更多历史图片。",
    ],
    [
      "选择原图",
      "点击页面右下角“导出原图”。首次打开面板时默认选中已识别图片；之后新增的图片需要手动选择。",
    ],
    [
      "下载与保存",
      "可下载单张图片，点击“逐张下载”将选中图片分别保存，或点击“打包下载 ZIP”保存压缩包。每批最多 100 张或 200 MB。全选按钮上方会显示导出进度，保留原始格式、字节与分辨率。",
    ],
    [
      "在面板查看进度",
      "下载不会打开新页面。获取、打包和保存进度直接显示在图片面板；关闭面板也会继续，可重新打开查看结果。文件位于下载目录的“原图导出”文件夹。",
    ],
  ];
  steps.forEach(([title, body], i) => {
    const step = el("article", "help-step");
    step.append(el("span", "step-number", String(i + 1).padStart(2, "0")));
    const copy = el("div");
    copy.append(el("h3", "", title), el("p", "", body));
    step.append(copy);
    helpPage.append(step);
  });
  helpPage.append(el("h3", "faq-title", "遇到问题时"));
  for (const [question, answer] of [
    [
      "为什么没有识别到图片？",
      "确认该平台已启用，等待生成图片加载完成，再重新扫描。聊天页可向上滚动加载历史；分享页只识别当前分享中已加载的生成图，不包含上传的参考图。首次安装或更新后请刷新当前页面。",
    ],
    [
      "下载失败或链接过期怎么办？",
      "临时网络错误会自动重试。权限不足或签名过期时，请刷新当前聊天页或分享页重新导出；部分成功的 ZIP 会保留成功图片，并附未完成说明。在进度条旁点击“重试失败项”即可仅重试失败图片。逐张下载取消后重试，也只下载尚未保存的图片。",
    ],
    [
      "分享链接也能导出吗？",
      "支持千问分享页和豆包 /thread/ 分享页。直接打开分享链接，等待图片加载后点击“导出原图”。仅导出当前分享公开展示、且平台提供原图资源的生成图片，不会读取其他聊天。",
    ],
    [
      "豆包导出的原图仍有水印？",
      "部分账号或编辑场景返回的原图本身可能含水印。扩展提取平台提供的原始资源，不改变图片像素，也无法保证每张原图都无水印。",
    ],
    [
      "为什么只看到了部分历史图片？",
      "豆包列表会按当前渲染内容增量识别，向上滚动加载更多后再打开面板。扩展不会主动遍历其他聊天。",
    ],
  ]) {
    const d = el("details", "faq");
    d.append(el("summary", "", question), el("p", "", answer));
    helpPage.append(d);
  }
  const sources = el("div", "sources");
  sources.append(
    el("h3", "", "开源参考"),
    link(
      "LauZzL / doubao-downloader ↗",
      "https://github.com/LauZzL/doubao-downloader",
    ),
    el(
      "p",
      "",
      "豆包原图字段调研参考。上游许可证为 GPL-3.0；本扩展独立实现页面读取、界面与下载流程。ZIP 使用 fflate（MIT）。",
    ),
  );
  helpPage.append(sources);
  main.append(platformPage, helpPage);
  layout.append(main);
  app.append(layout);
  function show(page: string) {
    platformPage.hidden = page !== "platforms";
    helpPage.hidden = page !== "help";
    platformsButton.classList.toggle("active", page === "platforms");
    helpButton.classList.toggle("active", page === "help");
  }
  async function load() {
    try {
      const values = await getSettings();
      document
        .querySelectorAll<HTMLInputElement>("input[data-platform]")
        .forEach((input) => {
          input.checked = values[input.dataset.platform as Platform];
          input.disabled = false;
        });
    } catch {
      toast.replaceChildren(
        el("span", "", "无法读取设置。"),
        button("重试", () => void load(), "button"),
      );
    }
  }
  void load();
  const pageTitle = document.querySelector("title")!;
  setText(pageTitle, "设置与帮助 · AI 原图导出");
  function syncLanguage() {
    document.documentElement.lang = getLocale();
    language.value = getPreference();
    refreshTranslations(document);
  }
  onLanguageChange(syncLanguage);
  syncLanguage();
  language.addEventListener("change", async () => {
    try {
      await setPreference(language.value as LanguagePreference);
    } catch (error) {
      language.value = getPreference();
      setText(toast, message("保存失败：{error}", { error: errorText(error) }));
    }
  });
}

void initialize();
