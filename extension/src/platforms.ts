import type { Platform } from "./types";
export const platforms: Record<
  Platform,
  {
    name: string;
    url: string;
    color: string;
    description: string;
    status: string;
    limitations: string;
  }
> = {
  qianwen: {
    name: "千问",
    url: "https://www.qianwen.com/",
    color: "#6255d9",
    description:
      "导出聊天与分享页中，平台已提供的生成原图。保留原始画质与格式。",
    status: "聊天页 · 已实测 / 分享页 · 待回归",
    limitations:
      "仅识别当前会话已加载的图片。参考图、水印变体与缩略图不会加入列表。",
  },
  doubao: {
    name: "豆包",
    url: "https://www.doubao.com/chat/",
    color: "#368d79",
    description: "从当前聊天的生成图片中读取原图资源，支持多图选择与批量保存。",
    status: "聊天页 · 已实测 / 分享页 · 暂不支持",
    limitations:
      "部分账号与区域重绘、智能编辑、变清晰结果可能仍含水印。平台未提供无水印版本时，扩展无法修复图片。",
  },
};
export type Settings = Record<Platform, boolean>;
export const defaults: Settings = { qianwen: true, doubao: true };
export async function getSettings(): Promise<Settings> {
  const v = await chrome.storage.local.get("platforms");
  return { ...defaults, ...v.platforms };
}
