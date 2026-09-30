import { it, expect, vi, beforeEach, afterEach } from "vitest";
let data: Record<string, any>, handlers: any, chromeMock: any;
const asset = {
  platform: "qianwen",
  conversationId: "a",
  assetId: "image",
  messageId: "m",
  originalUrl: "https://workspace-zb-cdn.qianwen.com/a.png",
  width: 1,
  height: 1,
  source: "structured",
};
const page = {
  id: "abc",
  tab: { id: 5 },
  url: "https://www.qianwen.com/chat/a",
};
const runner = { id: "abc", url: "chrome-extension://abc/offscreen.html" };
const send = (m: any, sender: any = page) =>
  new Promise<any>((resolve) => handlers.message(m, sender, resolve));
beforeEach(async () => {
  vi.resetModules();
  data = {};
  handlers = {};
  const storage = {
    get: async (k: any) =>
      k === null ? structuredClone(data) : { [k]: structuredClone(data[k]) },
    set: async (v: any) => Object.assign(data, structuredClone(v)),
    remove: async () => {},
  };
  chromeMock = {
    runtime: {
      id: "abc",
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      getURL: (s: string) => `chrome-extension://abc/${s}`,
      getContexts: vi.fn(async () => []),
      sendMessage: vi.fn(async () => ({ ok: true })),
      onMessage: { addListener: (f: any) => (handlers.message = f) },
    },
    offscreen: {
      Reason: { BLOBS: "BLOBS" },
      createDocument: vi.fn(async () => {}),
    },
    storage: { local: storage, session: storage },
    tabs: {
      create: vi.fn(),
      sendMessage: vi.fn(async () => {}),
      onRemoved: { addListener: () => {} },
    },
    downloads: {
      download: vi.fn(async () => 7),
      cancel: vi.fn(async () => {}),
      search: vi.fn(async () => [{ state: "in_progress" }]),
      onChanged: { addListener: (f: any) => (handlers.download = f) },
      onDeterminingFilename: {
        addListener: (f: any) => (handlers.filename = f),
      },
    },
  };
  vi.stubGlobal("chrome", chromeMock);
  await import("../src/background");
});
afterEach(() => vi.unstubAllGlobals());
it("starts an offscreen export without opening a tab and binds it to the source chat", async () => {
  const reply = await send({
    type: "CREATE_TASK",
    assets: [asset],
    mode: "single",
  });
  expect(reply.ok).toBe(true);
  expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  expect(chromeMock.offscreen.createDocument).toHaveBeenCalled();
  expect(data[`task:${reply.value.id}`].ownerTab).toBe(5);
});
it("does not expose or cancel another tab task", async () => {
  const { value } = await send({
    type: "CREATE_TASK",
    assets: [asset],
    mode: "single",
  });
  const result = await send(
    { type: "CANCEL_DOWNLOAD", id: value.id },
    { ...page, tab: { id: 8 } },
  );
  expect(result.ok).toBe(false);
  expect(chromeMock.downloads.cancel).not.toHaveBeenCalled();
});
it("serializes cancel after a delayed download id and preserves the requested filename", async () => {
  const { value } = await send({
    type: "CREATE_TASK",
    assets: [asset],
    mode: "single",
  });
  let finish!: (n: number) => void;
  chromeMock.downloads.download.mockImplementation(
    () => new Promise((r) => (finish = r)),
  );
  const saving = send(
    {
      type: "SAVE_BLOB",
      id: value.id,
      url: "blob:chrome-extension://abc/abcd",
      filename: "原图.png",
    },
    runner,
  );
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  const cancelling = send({ type: "CANCEL_DOWNLOAD", id: value.id });
  finish(7);
  await Promise.all([saving, cancelling]);
  expect(chromeMock.downloads.cancel).toHaveBeenCalledWith(7);
  expect(data[`task:${value.id}`].status).toBe("已取消");
  const suggest = vi.fn();
  handlers.filename(
    { byExtensionId: "abc", url: "blob:chrome-extension://abc/abcd" },
    suggest,
  );
  expect(suggest).toHaveBeenCalledWith({
    filename: "原图导出/原图.png",
    conflictAction: "uniquify",
  });
  const other = vi.fn();
  handlers.filename(
    { byExtensionId: "other", url: "https://example.com" },
    other,
  );
  expect(other).toHaveBeenCalledWith();
  await send(
    { type: "TASK_STATUS", id: value.id, status: "已完成", progress: 100 },
    runner,
  );
  expect(data[`task:${value.id}`].status).toBe("已取消");
});
it("refuses page-origin status or blob commands", async () => {
  const { value } = await send({
    type: "CREATE_TASK",
    assets: [asset],
    mode: "single",
  });
  expect(
    (await send({ type: "TASK_STATUS", id: value.id, status: "已完成" })).ok,
  ).toBe(false);
  expect(
    (
      await send({
        type: "SAVE_BLOB",
        id: value.id,
        url: "blob:https://www.qianwen.com/a",
        filename: "a.png",
      })
    ).ok,
  ).toBe(false);
});
it("retries all unsaved images after a save failure, but only failed images after a partial save", async () => {
  const second = { ...asset, assetId: "image-2" };
  const { value } = await send({
    type: "CREATE_TASK",
    assets: [asset, second],
    mode: "zip",
  });
  data[`task:${value.id}`].status = "失败";
  data[`task:${value.id}`].failedIndices = [1];
  const retried = await send({ type: "RETRY_TASK", id: value.id });
  expect(data[`task:${retried.value.id}`].assets).toHaveLength(2);
  data[`task:${retried.value.id}`].status = "部分失败";
  data[`task:${retried.value.id}`].failedIndices = [1];
  const partial = await send({ type: "RETRY_TASK", id: retried.value.id });
  expect(
    data[`task:${partial.value.id}`].assets.map((a: any) => a.assetId),
  ).toEqual(["image-2"]);
});
it("does not start fetching after cancellation while the hidden document is being created", async () => {
  let ready!: () => void;
  chromeMock.offscreen.createDocument.mockImplementation(
    () => new Promise<void>((r) => (ready = r)),
  );
  const pending = send({
    type: "CREATE_TASK",
    assets: [asset],
    mode: "single",
  });
  await vi.waitFor(() => expect(ready).toBeTypeOf("function"));
  const task = Object.values(data).find((t: any) => t?.id) as any;
  await send({ type: "CANCEL_DOWNLOAD", id: task.id });
  ready();
  await pending;
  expect(
    chromeMock.runtime.sendMessage.mock.calls.filter(
      (c: any) => c[0].type === "START_EXPORT",
    ),
  ).toHaveLength(0);
});
it("tracks individual browser saves and retries only unsaved images after cancellation", async () => {
  const second = { ...asset, assetId: "image-2" };
  const { value } = await send({
    type: "CREATE_TASK",
    assets: [asset, second],
    mode: "individual",
  });
  expect(data[`task:${value.id}`].mode).toBe("individual");
  await send(
    {
      type: "SAVE_BLOB",
      id: value.id,
      index: 0,
      url: "blob:chrome-extension://abc/one",
      filename: "one.png",
    },
    runner,
  );
  chromeMock.downloads.search.mockResolvedValue([{ state: "complete" }]);
  await send({ type: "CANCEL_DOWNLOAD", id: value.id });
  const retry = await send({ type: "RETRY_TASK", id: value.id });
  expect(retry.ok).toBe(true);
  expect(
    data[`task:${retry.value.id}`].assets.map((a: any) => a.assetId),
  ).toEqual(["image-2"]);
  expect(data[`task:${retry.value.id}`].fileIndices).toEqual([1]);
});
it("does not mark an individual batch complete until every image is saved", async () => {
  const { value } = await send({
    type: "CREATE_TASK",
    assets: [asset, { ...asset, assetId: "two" }],
    mode: "individual",
  });
  await send(
    {
      type: "SAVE_BLOB",
      id: value.id,
      index: 0,
      url: "blob:chrome-extension://abc/one",
      filename: "one.png",
    },
    runner,
  );
  chromeMock.downloads.search.mockResolvedValue([{ state: "complete" }]);
  expect(
    (
      await send(
        { type: "TASK_STATUS", id: value.id, status: "已完成" },
        runner,
      )
    ).ok,
  ).toBe(false);
  expect(
    (
      await send(
        {
          type: "TASK_STATUS",
          id: value.id,
          status: "部分失败",
          failedIndices: [1],
        },
        runner,
      )
    ).ok,
  ).toBe(true);
  const retry = await send({ type: "RETRY_TASK", id: value.id });
  expect(data[`task:${retry.value.id}`].assets).toHaveLength(1);
});
