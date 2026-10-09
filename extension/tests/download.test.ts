import { it, expect } from "vitest";
import { fetchImage, makeArchive } from "../src/download";
import { unzipSync } from "fflate";
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const url = "https://workspace-zb-cdn.qianwen.com/a.png";
it("retries a temporary server error and returns original bytes", async () => {
  let calls = 0;
  const data = await fetchImage(
    url,
    new AbortController().signal,
    100,
    async () => {
      calls++;
      return calls < 3
        ? new Response("", { status: 503 })
        : new Response(png, { headers: { "content-type": "image/png" } });
    },
  );
  expect(calls).toBe(3);
  expect(data.bytes).toEqual(png);
});
it("does not retry a forbidden resource", async () => {
  let calls = 0;
  await expect(
    fetchImage(url, new AbortController().signal, 100, async () => {
      calls++;
      return new Response("", { status: 403 });
    }),
  ).rejects.toThrow(/过期|权限/);
  expect(calls).toBe(1);
});
it("rejects HTML returned as image and oversized responses", async () => {
  await expect(
    fetchImage(
      url,
      new AbortController().signal,
      100,
      async () =>
        new Response("<html>error</html>", {
          headers: { "content-type": "image/png" },
        }),
    ),
  ).rejects.toThrow();
  await expect(
    fetchImage(
      url,
      new AbortController().signal,
      10,
      async () => new Response(png),
    ),
  ).rejects.toThrow(/200|大小|分批/);
});
it("keeps originals byte-for-byte inside ZIP and includes sanitized failures", async () => {
  const zip = await makeArchive({ "image.png": png }, [
    { index: 2, error: "网络失败" },
  ]);
  const files = unzipSync(zip);
  expect(files["image.png"]).toEqual(png);
  expect(new TextDecoder().decode(files["未完成.txt"])).toContain("2");
});

it("writes English failure notes without exposing image URLs or changing original bytes", async () => {
  const zip = await makeArchive(
    { "image.png": png },
    [
      { index: 2, error: "网络失败，请检查连接后重试" },
      { index: 3, error: "https://private.test/token" },
    ],
    "en",
  );
  const files = unzipSync(zip);
  expect(files["image.png"]).toEqual(png);
  expect(files["未完成.txt"]).toBeUndefined();
  const note = new TextDecoder().decode(files["failed-images.txt"]);
  expect(note).toContain("Image 2");
  expect(note).toContain("Network");
  expect(note).not.toContain("https://private.test");
  expect(note).toContain("[URL hidden]");
});
