import { MAX_BYTES, filename, validateBatch } from "./core";
import { fetchImage, makeArchive } from "./download";
import { request, errorText } from "./ui";
import type { Task } from "./types";
const running = new Map<string, AbortController>();
const cancelled = new Set<string>();
async function run(task: Task, abort: AbortController) {
  const completed = new Map<number, { bytes: Uint8Array; ext: string }>(),
    failures = new Map<number, string>();
  let received = 0,
    done = 0,
    savedCount = 0,
    cursor = 0,
    blobUrl = "";
  // Serialize reports so two download workers cannot regress the visible progress.
  let reports = Promise.resolve();
  const report = (status: string, progress: number, detail: string) => {
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
    await report("获取图片", 0, `正在获取 ${task.assets.length} 张原图`);
    const worker = async () => {
      while (cursor < task.assets.length && !abort.signal.aborted) {
        const index = cursor++;
        try {
          if (task.mode === "individual")
            await report(
              "获取图片",
              Math.round((index / task.assets.length) * 100),
              `正在获取第 ${index + 1}/${task.assets.length} 张原图`,
            );
          const data = await fetchImage(
            task.assets[index].originalUrl,
            abort.signal,
            MAX_BYTES,
            fetch,
            (bytes) => {
              if (received + bytes > MAX_BYTES)
                throw new Error("单批超过 200 MB，请减少选择后分批导出");
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
            throw new Error("图片内容损坏，无法读取尺寸");
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
                  throw new Error("浏览器保存中断，请重试");
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
          "获取图片",
          Math.round(
            (done / task.assets.length) *
              (task.mode === "individual" ? 100 : 80),
          ),
          `已处理 ${done}/${task.assets.length} 张 · 成功 ${task.mode === "individual" ? savedCount : completed.size} 张 · ${(received / 1024 / 1024).toFixed(1)} MB`,
        );
      }
    };
    if (task.mode === "individual") await worker();
    else await Promise.all([worker(), worker()]);
    abort.signal.throwIfAborted();
    if (task.mode === "individual") {
      if (!savedCount)
        throw new Error([...failures.values()][0] || "没有可保存的图片");
      await report(
        failures.size ? "部分失败" : "已完成",
        100,
        `已逐张保存 ${savedCount} 张原图${failures.size ? `，${failures.size} 张失败，可重试失败项` : "，可在下载文件夹查看"}`,
      );
      return;
    }
    if (!completed.size)
      throw new Error([...failures.values()][0] || "没有可保存的图片");
    await report(
      "打包中",
      85,
      task.mode === "zip"
        ? `正在打包 ${completed.size} 张原图`
        : "正在准备原图",
    );
    const files: Record<string, Uint8Array> = {};
    for (const [index, data] of [...completed].sort((a, b) => a[0] - b[0]))
      files[
        filename(
          task.assets[index],
          task.fileIndices?.[index] ?? index,
          data.ext,
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
      );
      name = `原图-${task.assets[0].platform}-${Date.now()}.zip`;
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
      if (state === "interrupted") throw new Error("浏览器保存中断，请重试");
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await report(
      failures.size ? "部分失败" : "已完成",
      100,
      `已保存 ${completed.size} 张原图${failures.size ? `，${failures.size} 张失败，可重试失败项` : "，可在下载文件夹查看"}`,
    );
  } catch (error) {
    await reports.catch(() => {});
    await request({
      type: "TASK_STATUS",
      id: task.id,
      status: abort.signal.aborted ? "已取消" : "失败",
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
