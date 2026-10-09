import { MAX_BYTES, filename, validateBatch } from "./core";
import { fetchImage, makeArchive } from "./download";
import { request, errorText } from "./ui";
import type { Task } from "./types";
import { LocalizedError, message, type LocalizedText } from "./i18n";
import type { TaskStatus } from "./task-status";
const running = new Map<string, AbortController>();
const cancelled = new Set<string>();
function failure(value: string | LocalizedText = "没有可保存的图片") {
  return new LocalizedError(
    typeof value === "string" ? value : value.key,
    typeof value === "string" ? undefined : value.params,
  );
}
async function run(task: Task, abort: AbortController) {
  const completed = new Map<number, { bytes: Uint8Array; ext: string }>(),
    failures = new Map<number, string | LocalizedText>();
  let received = 0,
    done = 0,
    savedCount = 0,
    cursor = 0,
    blobUrl = "";
  // Serialize reports so two download workers cannot regress the visible progress.
  let reports = Promise.resolve();
  const report = (
    status: TaskStatus,
    progress: number,
    detail: string | LocalizedText,
  ) => {
    reports = reports.then(() =>
      request({
        type: "TASK_STATUS",
        id: task.id,
        status,
        progress,
        detail,
        failedIndices: [...failures.keys()],
      }),
    );
    return reports;
  };
  try {
    validateBatch(task.assets);
    await report(
      "fetching",
      0,
      message("正在获取 {count} 张原图", { count: task.assets.length }),
    );
    const worker = async () => {
      while (cursor < task.assets.length && !abort.signal.aborted) {
        const index = cursor++;
        try {
          if (task.mode === "individual")
            await report(
              "fetching",
              Math.round((index / task.assets.length) * 100),
              message("正在获取第 {index}/{total} 张原图", {
                index: index + 1,
                total: task.assets.length,
              }),
            );
          const data = await fetchImage(
            task.assets[index].originalUrl,
            abort.signal,
            MAX_BYTES,
            fetch,
            (bytes) => {
              if (received + bytes > MAX_BYTES)
                throw new LocalizedError(
                  "单批超过 200 MB，请减少选择后分批导出",
                );
              received += bytes;
            },
          );
          try {
            const bitmap = await createImageBitmap(
              new Blob([data.bytes as BlobPart]),
            );
            if (!bitmap.width || !bitmap.height) throw new Error();
            bitmap.close();
          } catch {
            received -= data.bytes.byteLength;
            throw new LocalizedError("图片内容损坏，无法读取尺寸");
          }
          if (task.mode === "individual") {
            abort.signal.throwIfAborted();
            blobUrl = URL.createObjectURL(
              new Blob([data.bytes as BlobPart], {
                type: `image/${data.ext === "jpg" ? "jpeg" : data.ext}`,
              }),
            );
            try {
              await request({
                type: "SAVE_BLOB",
                id: task.id,
                index,
                url: blobUrl,
                filename: filename(
                  task.assets[index],
                  task.fileIndices?.[index] ?? index,
                  data.ext,
                  task.locale,
                ),
              });
              while (true) {
                abort.signal.throwIfAborted();
                const state = await request<string>({
                  type: "DOWNLOAD_STATE",
                  id: task.id,
                });
                if (state === "complete") break;
                if (state === "interrupted")
                  throw new LocalizedError("浏览器保存中断，请重试");
                await new Promise((resolve) => setTimeout(resolve, 400));
              }
              savedCount++;
            } finally {
              URL.revokeObjectURL(blobUrl);
              blobUrl = "";
            }
          } else completed.set(index, data);
        } catch (error) {
          failures.set(index, errorText(error));
        }
        done++;
        await report(
          "fetching",
          Math.round(
            (done / task.assets.length) *
              (task.mode === "individual" ? 100 : 80),
          ),
          message("已处理 {count}/{total} 张 · 成功 {saved} 张 · {size} MB", {
            count: done,
            total: task.assets.length,
            saved: task.mode === "individual" ? savedCount : completed.size,
            size: (received / 1024 / 1024).toFixed(1),
          }),
        );
      }
    };
    if (task.mode === "individual") await worker();
    else await Promise.all([worker(), worker()]);
    abort.signal.throwIfAborted();
    if (task.mode === "individual") {
      if (!savedCount) throw failure([...failures.values()][0]);
      await report(
        failures.size ? "partial" : "completed",
        100,
        message(
          failures.size
            ? "已逐张保存 {count} 张原图，{failed} 张失败，可重试失败项"
            : "已逐张保存 {count} 张原图，可在下载文件夹查看",
          { count: savedCount, failed: failures.size },
        ),
      );
      return;
    }
    if (!completed.size) throw failure([...failures.values()][0]);
    await report(
      "packing",
      85,
      task.mode === "zip"
        ? message("正在打包 {count} 张原图", { count: completed.size })
        : "正在准备原图",
    );
    const files: Record<string, Uint8Array> = {};
    for (const [index, data] of [...completed].sort((a, b) => a[0] - b[0]))
      files[
        filename(
          task.assets[index],
          task.fileIndices?.[index] ?? index,
          data.ext,
          task.locale,
        )
      ] = data.bytes;
    let bytes: Uint8Array, name: string, mime: string;
    if (task.mode === "single") {
      [name, bytes] = Object.entries(files)[0];
      mime = `image/${name.endsWith(".jpg") ? "jpeg" : name.split(".").pop()}`;
    } else {
      bytes = await makeArchive(
        files,
        [...failures].map(([i, error]) => ({ index: i + 1, error })),
        task.locale,
      );
      name = `${task.locale === "en" ? "original-images" : "原图"}-${task.assets[0].platform}-${Date.now()}.zip`;
      mime = "application/zip";
    }
    abort.signal.throwIfAborted();
    blobUrl = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: mime }),
    );
    await request({
      type: "SAVE_BLOB",
      id: task.id,
      url: blobUrl,
      filename: name,
    });
    while (true) {
      abort.signal.throwIfAborted();
      const state = await request<string>({
        type: "DOWNLOAD_STATE",
        id: task.id,
      });
      if (state === "complete") break;
      if (state === "interrupted")
        throw new LocalizedError("浏览器保存中断，请重试");
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await report(
      failures.size ? "partial" : "completed",
      100,
      message(
        failures.size
          ? "已保存 {count} 张原图，{failed} 张失败，可重试失败项"
          : "已保存 {count} 张原图，可在下载文件夹查看",
        { count: completed.size, failed: failures.size },
      ),
    );
  } catch (error) {
    await reports.catch(() => {});
    await request({
      type: "TASK_STATUS",
      id: task.id,
      status: abort.signal.aborted ? "cancelled" : "failed",
      progress: 0,
      detail: errorText(error),
      failedIndices: [...failures.keys()],
    }).catch(() => {});
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    completed.clear();
    running.delete(task.id);
  }
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (
    m?.target !== "offscreen" ||
    sender.id !== chrome.runtime.id ||
    sender.tab
  )
    return false;
  if (m.type === "START_EXPORT") {
    if (cancelled.has(m.task.id) || running.has(m.task.id)) {
      reply({ ok: true });
      return false;
    }
    const abort = new AbortController();
    running.set(m.task.id, abort);
    reply({ ok: true });
    void run(m.task, abort);
    return false;
  }
  if (m.type === "CANCEL_EXPORT") {
    cancelled.add(m.id);
    if (cancelled.size > 100)
      cancelled.delete(cancelled.values().next().value!);
    running.get(m.id)?.abort();
    reply({ ok: true });
  }
  return false;
});
