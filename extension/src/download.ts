import { zipSync, strToU8 } from "fflate";
import { imageFormat } from "./core";
import {
  LocalizedError,
  translate,
  message,
  type Locale,
  type LocalizedText,
} from "./i18n";
class DownloadError extends LocalizedError {
  constructor(
    message: string,
    public retryable = false,
    params?: Record<string, string | number>,
  ) {
    super(message, params);
  }
}
export async function fetchImage(
  url: string,
  signal: AbortSignal,
  maxBytes: number,
  fetcher: typeof fetch = fetch,
  onChunk?: (size: number) => void,
): Promise<{ bytes: Uint8Array; ext: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let charged = 0;
    try {
      signal.throwIfAborted();
      const response = await fetcher(url, {
        signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new DownloadError(
          response.status === 401 || response.status === 403
            ? "链接已过期或缺少权限，请刷新当前页面重新获取"
            : "获取失败（HTTP {status}）",
          response.status >= 500 || response.status === 429,
          { status: response.status },
        );
      }
      if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel();
        throw new DownloadError("图片大小超过单批 200 MB 限制，请分批下载");
      }
      const type = response.headers.get("content-type") || "";
      if (/text\/|application\/json/i.test(type)) {
        await response.body?.cancel();
        throw new DownloadError("平台返回了非图片内容，请刷新当前页面重试");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new DownloadError("图片内容为空");
      const parts: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes)
            throw new DownloadError("图片大小超过单批 200 MB 限制，请分批下载");
          onChunk?.(value.byteLength);
          charged += value.byteLength;
          parts.push(value);
        }
      } catch (e) {
        await reader.cancel().catch(() => {});
        throw e;
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      const ext = imageFormat(bytes);
      if (!ext) throw new DownloadError("文件不是受支持的图片或内容已损坏");
      return { bytes, ext };
    } catch (error) {
      if (charged) onChunk?.(-charged);
      if (signal.aborted) throw new DownloadError("已取消");
      const retryable =
        error instanceof DownloadError
          ? error.retryable
          : error instanceof TypeError;
      if (attempt === 2 || !retryable)
        throw error instanceof DownloadError
          ? error
          : new DownloadError("网络失败，请检查连接后重试");
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw new DownloadError("网络失败");
}
export async function makeArchive(
  files: Record<string, Uint8Array>,
  errors: { index: number; error: string | LocalizedText }[],
  locale: Locale = "zh-CN",
): Promise<Uint8Array> {
  const entries = { ...files };
  if (errors.length)
    entries[locale === "en" ? "failed-images.txt" : "未完成.txt"] = strToU8(
      errors
        .map((x) =>
          translate(
            message("图片 {index}：{error}", {
              index: x.index,
              error: translate(x.error, locale).replace(
                /https?:\/\/\S+/g,
                translate("[链接已隐藏]", locale),
              ),
            }),
            locale,
          ),
        )
        .join("\n"),
    );
  // Already-compressed images are stored without re-encoding or unnecessary compression.
  return zipSync(entries, { level: 0 });
}
