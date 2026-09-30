import { describe, it, expect } from "vitest";
import { parseAssets } from "../src/adapters";
import {
  Registry,
  imageFormat,
  validateAsset,
  validateBatch,
  contextFromUrl,
} from "../src/core";
const url = "https://workspace-zb-cdn.qianwen.com/a.png?auth_key=keep-me";
const ctx = { platform: "qianwen" as const, conversationId: "chat-a" };
const asset = {
  ...ctx,
  assetId: "a",
  messageId: "m",
  originalUrl: url,
  source: "structured",
  width: 720,
  height: 1280,
};
describe("resource boundaries", () => {
  it("recognizes supported chat URLs but not CDN or lookalike sites", () => {
    expect(contextFromUrl("https://www.qianwen.com/chat/chat-a")).toEqual(ctx);
    expect(
      contextFromUrl("https://qianwen.com.evil.test/chat/chat-a"),
    ).toBeNull();
    expect(
      contextFromUrl("https://www.doubao.com/chat/create-image"),
    ).toBeNull();
  });
  it("rejects arbitrary domains and credentials, preserves signed originals", () => {
    expect(validateAsset(asset, ctx)?.originalUrl).toBe(url);
    expect(
      validateAsset({ ...asset, originalUrl: "https://evil.test/a.png" }, ctx),
    ).toBeNull();
    expect(
      validateAsset(
        {
          ...asset,
          originalUrl: "https://user:pw@workspace-zb-cdn.qianwen.com/a.png",
        },
        ctx,
      ),
    ).toBeNull();
    expect(
      validateAsset({ ...asset, conversationId: "other" }, ctx),
    ).toBeNull();
  });
  it("updates signatures without duplicates and rejects late resources after route change", () => {
    const r = new Registry(ctx);
    r.merge([asset]);
    r.selectAll();
    r.merge([
      { ...asset, originalUrl: url + "2" },
      { ...asset, assetId: "b" },
    ]);
    expect(r.assets.size).toBe(2);
    expect(r.selected.size).toBe(1);
    expect(r.snapshot()[0].originalUrl).toBe(url + "2");
    r.reset({ ...ctx, conversationId: "chat-b" });
    r.merge([asset]);
    expect(r.assets.size).toBe(0);
    expect(r.selected.size).toBe(0);
  });
  it("rejects empty batches and more than 100 images", () => {
    expect(() => validateBatch([])).toThrow();
    expect(() => validateBatch(Array(101).fill(asset))).toThrow();
    expect(() => validateBatch([asset])).not.toThrow();
  });
  it("identifies actual formats and rejects HTML despite a fake PNG content type", () => {
    expect(
      imageFormat(
        Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]),
      ),
    ).toBe("png");
    expect(
      imageFormat(new TextEncoder().encode("<!DOCTYPE html>denied")),
    ).toBeNull();
    expect(imageFormat(new Uint8Array())).toBeNull();
  });
});
describe("structured image extraction", () => {
  it("extracts qianwen generated originals, never watermark or references", () => {
    const payload = {
      data: {
        originalData: {
          content: JSON.stringify({
            layout_list: [
              {
                type: "generate_image",
                image: [
                  {
                    image: {
                      resource_infos: [{ url }],
                      width: 720,
                      height: 1280,
                    },
                    watermark_image: {
                      resource_infos: [
                        {
                          url: "https://workspace-zb-cdn.qianwen.com/watermark.png",
                        },
                      ],
                    },
                  },
                ],
              },
              {
                type: "ref_image",
                image: {
                  resource_infos: [
                    { url: "https://workspace-zb-cdn.qianwen.com/ref.png" },
                  ],
                },
              },
            ],
          }),
        },
      },
    };
    const found = parseAssets("qianwen", payload, ctx);
    expect(found.map((a) => a.originalUrl)).toEqual([url]);
  });
  it("extracts doubao image creations and excludes video covers and other conversations", () => {
    const c = { platform: "doubao" as const, conversationId: "123" };
    const raw =
      "https://p3-flow-imagex-sign.byteimg.com/tos/image.png?sign=keep";
    const payload = {
      messages: [
        {
          message_id: "m",
          conversation_id: "123",
          creations: [
            { image: { key: "k", image_ori_raw: { url: raw } } },
            { video: { cover: { image_ori_raw: { url: raw } } } },
          ],
        },
        {
          message_id: "other",
          conversation_id: "456",
          creations: [{ image: { key: "wrong", image_ori_raw: { url: raw } } }],
        },
      ],
    };
    const found = parseAssets("doubao", payload, c);
    expect(found).toHaveLength(1);
    expect(found[0].assetId).toBe("k");
    expect(found[0].originalUrl).toBe(raw);
  });
  it("does not accept an unscoped realtime message as belonging to the current chat", () => {
    expect(
      parseAssets(
        "doubao",
        {
          message_id: "m",
          creations: [
            {
              image: {
                key: "k",
                image_ori_raw: {
                  url: "https://p3-flow-imagex-sign.byteimg.com/a.png",
                },
              },
            },
          ],
        },
        { platform: "doubao", conversationId: "123" },
      ),
    ).toEqual([]);
  });
});
it("resolves real Qianwen image reference IDs instead of exporting every resource", () => {
  const payload = {
    resource_infos: [
      { refer_id: "ref1", id: "original", url, width: 720, height: 1280 },
      {
        refer_id: "ref2",
        id: "wm",
        url: "https://workspace-zb-cdn.qianwen.com/wm.png",
      },
      {
        refer_id: "ref7",
        id: "reference",
        url: "https://workspace-zb-cdn.qianwen.com/ref.png",
      },
    ],
    layout_list: [
      {
        type: "generate_image",
        image: ["ref1"],
        watermark_image: ["ref2"],
        ref_image_ids: ["reference"],
      },
    ],
    display_list: [{ type: "generate_image", image: ["ref1"] }],
  };
  const found = parseAssets("qianwen", payload, ctx);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({
    assetId: "original",
    width: 720,
    height: 1280,
    originalUrl: url,
  });
});
it("authenticates extension pages by protocol and host even for opaque URL origins", async () => {
  const { isExtensionPage } = await import("../src/core");
  expect(
    isExtensionPage(
      "chrome-extension://abc/export.html?id=x",
      "abc",
      "/export.html",
    ),
  ).toBe(true);
  expect(
    isExtensionPage("https://abc/export.html", "abc", "/export.html"),
  ).toBe(false);
  expect(
    isExtensionPage(
      "chrome-extension://evil/export.html",
      "abc",
      "/export.html",
    ),
  ).toBe(false);
});
