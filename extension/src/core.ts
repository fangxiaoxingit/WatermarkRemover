import type { Asset, Context, Platform } from "./types";
export const MAX_IMAGES = 100,
  MAX_BYTES = 200 * 1024 * 1024;
export function contextFromUrl(raw: string): Context | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const platform: Platform | null = [
      "qianwen.com",
      "www.qianwen.com",
      "qianwen.my.cn",
    ].includes(u.hostname)
      ? "qianwen"
      : ["doubao.com", "www.doubao.com"].includes(u.hostname)
        ? "doubao"
        : null;
    if (!platform) return null;
    if (platform === "doubao") {
      const shared = u.pathname.match(/^\/thread\/([\w-]+)\/?$/);
      if (shared) return { platform, conversationId: `thread:${shared[1]}` };
    }
    const m = u.pathname.match(
      platform === "qianwen"
        ? /^\/(?:share\/)?chat\/([\w-]+)\/?$/
        : /^\/chat\/(\d+)\/?$/,
    );
    return m ? { platform, conversationId: m[1] } : null;
  } catch {
    return null;
  }
}
export function allowedUrl(raw: unknown, platform: Platform): raw is string {
  if (typeof raw !== "string" || raw.length > 8192) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return false;
    return platform === "qianwen"
      ? [
          "workspace-zb-cdn.qianwen.com",
          "quark-aistudio-cdn.quark.cn",
        ].includes(u.hostname)
      : /^p\d+-flow-imagex-sign\.byteimg\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}
export function validateAsset(raw: unknown, context: Context): Asset | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Asset;
  if (
    a.platform !== context.platform ||
    a.conversationId !== context.conversationId ||
    !allowedUrl(a.originalUrl, a.platform) ||
    typeof a.assetId !== "string" ||
    !a.assetId ||
    a.assetId.length > 2048
  )
    return null;
  return {
    ...context,
    assetId: a.assetId,
    messageId: typeof a.messageId === "string" ? a.messageId.slice(0, 256) : "",
    originalUrl: a.originalUrl,
    previewUrl: allowedUrl(a.previewUrl, a.platform) ? a.previewUrl : undefined,
    width: boundedDimension(a.width),
    height: boundedDimension(a.height),
    source:
      typeof a.source === "string" ? a.source.slice(0, 128) : "structured",
  };
}
function boundedDimension(n: unknown) {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n < 65536
    ? Math.round(n)
    : 0;
}
export function validateBatch(a: Asset[]) {
  if (!Array.isArray(a) || !a.length) throw new Error("请先选择图片");
  if (a.length > MAX_IMAGES) throw new Error("每批最多 100 张，请分批导出");
  const context = a[0];
  const shared =
    context.platform === "doubao" &&
    context.conversationId.startsWith("thread:");
  const parsed = contextFromUrl(
    `https://${context.platform === "qianwen" ? "www.qianwen.com" : "www.doubao.com"}/${shared ? `thread/${context.conversationId.slice(7)}` : `chat/${context.conversationId}`}`,
  );
  if (
    parsed?.platform !== context.platform ||
    parsed.conversationId !== context.conversationId ||
    a.some((x) => !validateAsset(x, context))
  )
    throw new Error("图片来源或会话不匹配，请刷新页面重试");
}
export function imageFormat(
  b: Uint8Array,
): "png" | "jpg" | "webp" | "gif" | null {
  if (b.length < 12) return null;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v))
    return "png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpg";
  const h = String.fromCharCode(...b.slice(0, 12));
  if (h.startsWith("RIFF") && h.slice(8) === "WEBP") return "webp";
  if (h.startsWith("GIF87a") || h.startsWith("GIF89a")) return "gif";
  return null;
}
export class Registry {
  assets = new Map<string, Asset>();
  selected = new Set<string>();
  private opened = false;
  constructor(public context: Context) {}
  merge(list: unknown[]) {
    for (const raw of list) {
      const a = validateAsset(raw, this.context);
      if (a) this.assets.set(a.assetId, a);
    }
  }
  open() {
    if (!this.opened) {
      this.selectAll();
      this.opened = true;
    }
  }
  selectAll() {
    this.selected = new Set(this.assets.keys());
  }
  reset(context: Context) {
    this.context = context;
    this.assets.clear();
    this.selected.clear();
    this.opened = false;
  }
  snapshot() {
    return [...this.assets.values()]
      .filter((a) => this.selected.has(a.assetId))
      .map((a) => ({ ...a }));
  }
}
export const safeName = (s: string) =>
  s.replace(/[^\w\u4e00-\u9fff-]/g, "_").slice(0, 80) || "image";
export function filename(a: Asset, index: number, ext: string) {
  return `${a.platform === "qianwen" ? "千问" : "豆包"}-${safeName(a.conversationId).slice(-8)}-${String(index + 1).padStart(3, "0")}.${ext}`;
}
export function isExtensionPage(url: string, id: string, path?: string) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "chrome-extension:" &&
      u.hostname === id &&
      (!path || u.pathname === path)
    );
  } catch {
    return false;
  }
}
