import { message, type LocalizedText } from "./i18n";

const legacyDetails: [RegExp, string, string[]][] = [
  [/^准备导出 (\d+) 张原图$/, "准备导出 {count} 张原图", ["count"]],
  [/^正在获取 (\d+) 张原图$/, "正在获取 {count} 张原图", ["count"]],
  [
    /^正在获取第 (\d+)\/(\d+) 张原图$/,
    "正在获取第 {index}/{total} 张原图",
    ["index", "total"],
  ],
  [
    /^正在保存第 (\d+)\/(\d+) 张原图$/,
    "正在保存第 {index}/{total} 张原图",
    ["index", "total"],
  ],
  [/^正在打包 (\d+) 张原图$/, "正在打包 {count} 张原图", ["count"]],
  [
    /^已处理 (\d+)\/(\d+) 张 · 成功 (\d+) 张 · (\d+(?:\.\d+)?) MB$/,
    "已处理 {count}/{total} 张 · 成功 {saved} 张 · {size} MB",
    ["count", "total", "saved", "size"],
  ],
  [
    /^已逐张保存 (\d+) 张原图，(\d+) 张失败，可重试失败项$/,
    "已逐张保存 {count} 张原图，{failed} 张失败，可重试失败项",
    ["count", "failed"],
  ],
  [
    /^已逐张保存 (\d+) 张原图，可在下载文件夹查看$/,
    "已逐张保存 {count} 张原图，可在下载文件夹查看",
    ["count"],
  ],
  [
    /^已保存 (\d+) 张原图，(\d+) 张失败，可重试失败项$/,
    "已保存 {count} 张原图，{failed} 张失败，可重试失败项",
    ["count", "failed"],
  ],
  [
    /^已保存 (\d+) 张原图，可在下载文件夹查看$/,
    "已保存 {count} 张原图，可在下载文件夹查看",
    ["count"],
  ],
  [
    /^已取消 · 已保存 (\d+)\/(\d+) 张，重试仅下载未保存图片$/,
    "已取消 · 已保存 {count}/{total} 张，重试仅下载未保存图片",
    ["count", "total"],
  ],
  [/^获取失败（HTTP (\d+)）$/, "获取失败（HTTP {status}）", ["status"]],
];

// Only interpret templates produced by earlier versions; preserve external errors.
export function restoreTaskDetail(
  value: string | LocalizedText | undefined,
): string | LocalizedText {
  if (value === undefined) return "";
  if (typeof value !== "string") return value;
  for (const [pattern, key, names] of legacyDetails) {
    const match = value.match(pattern);
    if (!match) continue;
    const params: Record<string, string | number> = {};
    names.forEach((name, index) => {
      params[name] =
        name === "size" ? match[index + 1] : Number(match[index + 1]);
    });
    return message(key, params);
  }
  return value;
}
