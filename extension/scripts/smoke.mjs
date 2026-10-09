import { chromium } from "playwright";
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
const out = resolve("output");
await mkdir(out, { recursive: true });
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGMomlJDEmIY1TCqYfhqAAArsYIQUE+mhwAAAABJRU5ErkJggg==",
  "base64",
);
const profile = await mkdtemp(join(tmpdir(), "wr-smoke-"));
const extension = resolve("dist");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  acceptDownloads: true,
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const errors = [];
  context.on("page", (page) =>
    page.on("pageerror", (e) => errors.push(e.message)),
  );
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const languagePage = await context.newPage();
  await languagePage.goto(`chrome-extension://${id}/options.html`);
  const languageChoice = languagePage.locator("select[data-language]");
  await languageChoice.waitFor({ timeout: 2000 });
  assert.equal(await languageChoice.inputValue(), "auto");
  const browserLanguage = await worker.evaluate(() =>
    chrome.i18n.getUILanguage(),
  );
  assert.equal(
    await languagePage.locator("html").getAttribute("lang"),
    browserLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : "en",
  );
  await languageChoice.selectOption("en");
  await languagePage
    .getByRole("heading", { name: "Settings & help" })
    .waitFor();
  await languagePage.screenshot({ path: join(out, "settings-en.png") });
  await languagePage.reload();
  assert.equal(
    await languagePage.locator("select[data-language]").inputValue(),
    "en",
  );
  await languagePage.locator("select[data-language]").selectOption("zh-CN");
  await languagePage.getByRole("heading", { name: "设置与帮助" }).waitFor();
  await languagePage.close();
  console.log("PASS browser language default and persistent manual override");
  const resource =
    "https://workspace-zb-cdn.qianwen.com/original.png?auth_key=test";
  const fixture = (name = "a") => ({
    data: {
      originalData: {
        content: {
          resource_infos: [
            { refer_id: "ref1", id: name, url: resource, width: 1, height: 1 },
            {
              refer_id: "ref2",
              id: "wm",
              url: "https://workspace-zb-cdn.qianwen.com/watermark.png",
              width: 1,
              height: 1,
            },
          ],
          layout_list: [
            {
              type: "generate_image",
              image: ["ref1"],
              watermark_image: ["ref2"],
            },
          ],
        },
      },
    },
  });
  const script = (data) =>
    `<script type="application/json">${JSON.stringify(data)}</script>`;
  await context.route("https://workspace-zb-cdn.qianwen.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: png }),
  );
  await context.route("https://www.qianwen.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><meta charset="UTF-8"><title>千问 · 脱敏测试样本</title><h1>千问图片会话测试</h1>${script(fixture())}`,
    }),
  );
  await context.route("https://www.doubao.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><meta charset="UTF-8"><title>豆包 · 脱敏测试样本</title><h1>豆包图片会话测试</h1><img alt="image" id="generated">',
    }),
  );
  await context.route("https://p6-flow-imagex-sign.byteimg.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: png }),
  );
  const shared = await context.newPage();
  await shared.goto("https://www.doubao.com/thread/testShare42");
  const appendSharedImage = async (shareId, key) =>
    shared.evaluate(
      ({ shareId, key }) => {
        const image = document.createElement("img");
        image.alt = "image";
        const message = { conversation_id: "", message_id: "shared-message" };
        let fiber = { memoizedProps: { shareId, message } };
        // The real share page has its image component at depth 13 and shareId at depth 34.
        for (let n = 33; n >= 0; n--)
          fiber = {
            memoizedProps:
              n === 13
                ? {
                    imageContent: {
                      key,
                      image_ori_raw: {
                        url: "https://p6-flow-imagex-sign.byteimg.com/shared.png",
                        width: 16,
                        height: 16,
                      },
                    },
                    message,
                  }
                : {},
            return: fiber,
          };
        image.__reactFiber$fixture = fiber;
        image.src = "https://p6-flow-imagex-sign.byteimg.com/shared.png";
        document.body.append(image);
      },
      { shareId, key },
    );
  await appendSharedImage("otherShare", "wrong-share");
  await appendSharedImage("testShare42", "shared-a");
  await shared
    .getByRole("button", { name: "导出原图 1" })
    .waitFor({ timeout: 5000 });
  console.log(
    "PASS Doubao share extraction with matching shareId beyond 25 ancestors",
  );
  const page = await context.newPage();
  await page.goto("https://www.qianwen.com/chat/chat-a");
  await page.getByRole("button", { name: "导出原图 1" }).waitFor();
  await page.getByRole("button", { name: "导出原图 1" }).click();
  assert.match(
    await page.locator("#wr-export-root .panel").innerText(),
    /已选择 1 张/,
  );
  await page.screenshot({ path: join(out, "qianwen-panel-fixture.png") });
  const zoom = page.getByRole("button", { name: "放大图片 1", exact: true });
  const previewSelection = await page
    .getByRole("checkbox", { name: "选择图片 1", exact: true })
    .isChecked();
  const beforePreviewTabs = (await worker.evaluate(() => chrome.tabs.query({})))
    .length;
  const iconBounds = await zoom.boundingBox();
  const thumbBounds = await page.locator(".preview").first().boundingBox();
  assert(iconBounds.x > thumbBounds.x + thumbBounds.width / 2);
  assert(iconBounds.y > thumbBounds.y + thumbBounds.height / 2);
  await zoom.click();
  const viewer = page.getByRole("dialog", {
    name: "图片 1 大图预览",
    exact: true,
  });
  await viewer.waitFor();
  await page.getByText("16 × 16 · 按 Esc 关闭", { exact: true }).waitFor();
  assert.equal(await viewer.locator("img").getAttribute("src"), resource);
  await viewer.locator("img").click();
  assert(await viewer.isVisible(), "clicking image keeps preview open");
  await page.keyboard.press("Tab");
  assert(
    await page
      .getByRole("button", { name: "关闭大图预览" })
      .evaluate((b) => b.getRootNode().activeElement === b),
  );
  await page.screenshot({ path: join(out, "image-preview.png") });
  await page.keyboard.press("Escape");
  await viewer.waitFor({ state: "detached" });
  assert(
    await page.locator(".panel").isVisible(),
    "Escape closes only large preview",
  );
  assert(await zoom.evaluate((b) => b.getRootNode().activeElement === b));
  assert.equal(
    await page
      .getByRole("checkbox", { name: "选择图片 1", exact: true })
      .isChecked(),
    previewSelection,
  );
  await zoom.click();
  await page.getByRole("button", { name: "关闭大图预览" }).click();
  await zoom.click();
  await viewer.click({ position: { x: 5, y: 100 } });
  await viewer.waitFor({ state: "detached" });
  assert.equal(
    (await worker.evaluate(() => chrome.tabs.query({}))).length,
    beforePreviewTabs,
  );
  const portraitPng = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 1200;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#729781";
      ctx.fillRect(0, 0, 900, 1200);
      ctx.fillStyle = "#d5dfca";
      ctx.fillRect(100, 120, 700, 800);
      ctx.fillStyle = "#254f40";
      ctx.fillRect(100, 960, 700, 120);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  await context.route(
    resource,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: portraitPng,
      }),
    { times: 1 },
  );
  await zoom.click();
  await page.getByText("900 × 1200 · 按 Esc 关闭", { exact: true }).waitFor();
  const largeBounds = await viewer.locator("img").boundingBox();
  assert(largeBounds.width > thumbBounds.width);
  assert(Math.abs(largeBounds.width / largeBounds.height - 3 / 4) < 0.01);
  assert(largeBounds.y >= 0 && largeBounds.y + largeBounds.height <= 1000);
  await page.screenshot({ path: join(out, "image-preview.png") });
  await page.keyboard.press("Escape");
  await context.route(
    resource,
    (route) => route.fulfill({ status: 403, body: "Expired" }),
    { times: 1 },
  );
  await zoom.click();
  await page
    .getByText("原图加载失败，链接可能已过期，请关闭预览并刷新聊天页重试。", {
      exact: true,
    })
    .waitFor();
  await page.keyboard.press("Escape");
  console.log(
    "PASS thumbnail zoom position, original-image preview, selection preserved, focus, Escape, close and backdrop",
  );

  await page.evaluate((data) => {
    const s = document.createElement("script");
    s.type = "application/json";
    s.textContent = JSON.stringify(data);
    document.body.append(s);
  }, fixture("b"));
  await page.getByText("已识别 2 张 · 仅含当前会话已加载内容").waitFor();
  assert.match(
    await page.locator("#wr-export-root .panel").innerText(),
    /已选择 1 张/,
  );
  await page.getByRole("button", { name: "关闭导出面板", exact: true }).click();
  await page.getByRole("button", { name: "导出原图 2" }).click();
  assert.match(
    await page.locator("#wr-export-root .panel").innerText(),
    /已选择 1 张/,
  );
  console.log(
    "PASS Qianwen original-only scan, dedupe, incremental selection and reopen",
  );
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.getByRole("checkbox", { name: "启用千问" }).uncheck();
  await page.locator("#wr-export-root").waitFor({ state: "detached" });
  await options.getByRole("checkbox", { name: "启用千问" }).check();
  await page.getByRole("button", { name: "导出原图 2" }).waitFor();
  await options.reload();
  assert.equal(
    await options.getByRole("checkbox", { name: "启用千问" }).isChecked(),
    true,
  );
  await options.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await options.screenshot({ path: join(out, "settings.png") });
  await options.getByRole("button", { name: /使用说明/ }).click();
  await options.getByRole("heading", { name: "几步，带走你的原图" }).waitFor();
  await options.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await options.screenshot({ path: join(out, "help.png") });
  console.log("PASS settings persistence, disable cleanup, help navigation");
  await page.getByRole("button", { name: "导出原图 2" }).click();
  await page
    .getByRole("checkbox", { name: "选择图片 2", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "放大图片 1", exact: true }).click();
  await page.evaluate(() => {
    const root = document.querySelector("#wr-export-root").shadowRoot;
    window.languageNodes = {
      dialog: root.querySelector(".image-viewer"),
      check: root.querySelectorAll(".preview input")[1],
      focus: root.activeElement,
    };
  });
  await options.locator("details").first().locator("summary").click();
  await options.locator("select[data-language]").selectOption("en");
  await page
    .locator("#wr-export-root[lang='en']")
    .waitFor({ state: "attached" });
  assert(
    await page.evaluate(() => {
      const root = document.querySelector("#wr-export-root").shadowRoot;
      return (
        window.languageNodes.dialog === root.querySelector(".image-viewer") &&
        window.languageNodes.check ===
          root.querySelectorAll(".preview input")[1] &&
        !window.languageNodes.check.checked &&
        window.languageNodes.focus === root.activeElement
      );
    }),
  );
  assert.equal(
    await options.locator("details").first().getAttribute("open"),
    "",
  );
  assert(!/[\p{Script=Han}]/u.test(await page.locator(".panel").innerText()));
  await page.locator(".viewer-close").click();
  await page.screenshot({ path: join(out, "qianwen-panel-en.png") });
  await options.screenshot({ path: join(out, "help-en.png") });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole("button", { name: "Settings & help" }).waitFor();
  await popup.locator("#app").screenshot({ path: join(out, "popup-en.png") });
  await popup.close();
  await options.locator("select[data-language]").selectOption("zh-CN");
  await page
    .locator("#wr-export-root[lang='zh-CN']")
    .waitFor({ state: "attached" });
  await page.getByRole("checkbox", { name: "选择图片 2", exact: true }).check();
  console.log(
    "PASS live language switch preserves selection, preview, focus and expanded FAQ",
  );
  // Offscreen documents are not Playwright pages; route their fixture requests via their CDP target.
  await worker.evaluate(() =>
    chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["BLOBS"],
      justification: "Extension export integration test",
    }),
  );
  const cdp = await context.browser().newBrowserCDPSession();
  const targets = await cdp.send("Target.getTargets");
  const offscreen = targets.targetInfos.find(
    (t) => t.url === `chrome-extension://${id}/offscreen.html`,
  );
  assert(offscreen, "offscreen export document exists");
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: offscreen.targetId,
    flatten: false,
  });
  let commandId = 1;
  let requestNumber = 0,
    failAt = 0,
    holdAt = 0;
  let hold = false,
    fail = false;
  const held = [];
  const command = (method, params) =>
    cdp.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({ id: commandId++, method, params }),
    });
  cdp.on("Target.receivedMessageFromTarget", (event) => {
    if (event.sessionId !== sessionId) return;
    const msg = JSON.parse(event.message);
    if (msg.method === "Fetch.requestPaused") {
      const shouldFail = fail || ++requestNumber === failAt;
      const fulfill = () =>
        command("Fetch.fulfillRequest", {
          requestId: msg.params.requestId,
          responseCode: shouldFail ? 403 : 200,
          responseHeaders: [{ name: "Content-Type", value: "image/png" }],
          body: png.toString("base64"),
        });
      if (hold || requestNumber === holdAt) held.push(fulfill);
      else void fulfill();
    }
  });
  await command("Fetch.enable", {
    patterns: [
      { urlPattern: "https://workspace-zb-cdn.qianwen.com/*" },
      { urlPattern: "https://p6-flow-imagex-sign.byteimg.com/*" },
    ],
  });
  const tabsBefore = await worker.evaluate(() => chrome.tabs.query({}));
  await page.getByRole("button", { name: "打包下载 ZIP" }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: /已完成|失败/ })
    .waitFor({ timeout: 25000 });
  assert.equal(
    await page.locator(".export-progress strong").innerText(),
    "已完成",
    await page.locator(".export-progress").innerText(),
  );
  assert.equal(
    (await worker.evaluate(() => chrome.tabs.query({}))).length,
    tabsBefore.length,
    "export must not create a tab",
  );
  const layout = await page.locator(".export-progress").evaluate((el) => ({
    bottom: el.getBoundingClientRect().bottom,
    toolbar: el.nextElementSibling.getBoundingClientRect().top,
  }));
  assert(layout.bottom <= layout.toolbar);
  assert.equal(
    await page
      .locator(".grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    5,
  );
  await page.screenshot({ path: join(out, "inline-export-complete.png") });
  const downloads = await worker.evaluate(() => chrome.downloads.search({}));
  const zipDownload = downloads.find(
    (x) => x.mime === "application/zip" || x.filename.endsWith(".zip"),
  );
  assert(zipDownload && zipDownload.state === "complete");
  const bytes = await readFile(zipDownload.filename);
  const files = unzipSync(bytes);
  assert.equal(Object.keys(files).length, 2);
  for (const b of Object.values(files))
    assert.equal(
      createHash("sha256").update(b).digest("hex"),
      createHash("sha256").update(png).digest("hex"),
    );
  await writeFile(join(out, "fixture-export.zip"), bytes);
  console.log(
    "PASS real extension task and ZIP browser save, 2 byte-identical images",
  );
  const individualButton = page.getByRole("button", {
    name: "逐张下载",
    exact: true,
  });
  const left = await individualButton.boundingBox();
  const right = await page
    .getByRole("button", { name: "打包下载 ZIP" })
    .boundingBox();
  assert(
    left.x + left.width <= right.x,
    "individual download appears left of ZIP",
  );
  const beforeIndividual = await worker.evaluate(() =>
    chrome.downloads.search({}),
  );
  await individualButton.click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor();
  const afterIndividual = await worker.evaluate(() =>
    chrome.downloads.search({}),
  );
  const individualFiles = afterIndividual.filter(
    (d) => !beforeIndividual.some((old) => old.id === d.id),
  );
  assert.equal(individualFiles.length, 2);
  for (const file of individualFiles) {
    assert.equal(file.state, "complete");
    assert.equal(file.mime, "image/png", JSON.stringify(file));
    assert.deepEqual(await readFile(file.filename), png);
  }
  assert.equal(
    (await worker.evaluate(() => chrome.tabs.query({}))).length,
    tabsBefore.length,
  );
  await page.screenshot({
    path: join(out, "individual-download-complete.png"),
  });
  failAt = requestNumber + 2;
  await individualButton.click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "部分失败" })
    .waitFor();
  const beforeRetry = await worker.evaluate(() => chrome.downloads.search({}));
  await page.getByRole("button", { name: "重试失败项", exact: true }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor();
  const afterRetry = await worker.evaluate(() => chrome.downloads.search({}));
  const retriedFiles = afterRetry.filter(
    (d) => !beforeRetry.some((old) => old.id === d.id),
  );
  assert.equal(
    retriedFiles.length,
    1,
    "retry must not repeat the already-saved image",
  );
  const latestTask = await worker.evaluate(async () => {
    const data = await chrome.storage.session.get(null);
    return Object.values(data)
      .filter((t) => t?.id)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  });
  assert.deepEqual(latestTask.fileIndices, [1]);
  console.log(
    "PASS individual downloads: two original PNGs, no new tab, retry only unsaved file with original number",
  );
  holdAt = requestNumber + 2;
  await individualButton.click();
  await page.getByText("正在获取第 2/2 张原图", { exact: true }).waitFor();
  const activeTask = await worker.evaluate(async () => {
    const data = await chrome.storage.session.get(null);
    return Object.values(data).find(
      (task) => task?.mode === "individual" && task.status === "fetching",
    )?.id;
  });
  assert(activeTask);
  await options.locator("select[data-language]").selectOption("en");
  await page
    .locator("#wr-export-root[lang='en']")
    .waitFor({ state: "attached" });
  assert(
    !/[\p{Script=Han}]/u.test(
      await page.locator(".export-progress").innerText(),
    ),
  );
  assert.equal(
    await worker.evaluate(
      async (id) =>
        (await chrome.storage.session.get(`task:${id}`))[`task:${id}`].status,
      activeTask,
    ),
    "fetching",
  );
  await options.locator("select[data-language]").selectOption("zh-CN");
  await page
    .locator("#wr-export-root[lang='zh-CN']")
    .waitFor({ state: "attached" });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已取消" })
    .waitFor();
  assert.match(
    await page.locator(".export-progress").innerText(),
    /已保存 1\/2 张/,
  );
  holdAt = 0;
  for (const resume of held.splice(0)) await resume().catch(() => {});
  const beforeCancelRetry = await worker.evaluate(() =>
    chrome.downloads.search({}),
  );
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor();
  assert.equal(
    (await worker.evaluate(() => chrome.downloads.search({}))).length,
    beforeCancelRetry.length + 1,
  );
  console.log(
    "PASS individual cancellation keeps saved file and resumes only remaining image",
  );
  hold = true;
  await page.getByRole("button", { name: "打包下载 ZIP" }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "获取图片" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "打包下载 ZIP" }).isDisabled(),
    true,
  );
  await page.screenshot({ path: join(out, "inline-export-progress.png") });
  await page.getByRole("button", { name: "关闭导出面板", exact: true }).click();
  hold = false;
  for (const resume of held.splice(0)) await resume();
  await page.getByRole("button", { name: "导出原图 2" }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor();
  console.log("PASS export continues while panel is closed");
  fail = true;
  await page.getByRole("button", { name: "打包下载 ZIP" }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: /^失败$/ })
    .waitFor();
  fail = false;
  await page
    .getByRole("button", { name: "重试", exact: true })
    .evaluate((b) => b.click());
  assert.equal(
    await page.locator(".export-progress strong").innerText(),
    "失败",
  );
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor();
  hold = true;
  await page.getByRole("button", { name: "打包下载 ZIP" }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "获取图片" })
    .waitFor();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已取消" })
    .waitFor();
  hold = false;
  for (const resume of held.splice(0)) await resume().catch(() => {});
  console.log("PASS inline failure, retry and cancellation");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor();
  const downloadsBeforeReload = await worker.evaluate(() =>
    chrome.downloads.search({}),
  );
  await page.reload();
  await page.getByRole("button", { name: "导出原图 1" }).click();
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor();
  assert.equal(
    (await worker.evaluate(() => chrome.downloads.search({}))).length,
    downloadsBeforeReload.length,
  );
  console.log(
    "PASS inline progress above toolbar, five columns, no new tab, completed task recovery",
  );
  await page.evaluate(() => history.pushState({}, "", "/chat/chat-b"));
  await page.getByRole("button", { name: "导出原图 0" }).waitFor();
  await page.evaluate((data) => {
    const s = document.createElement("script");
    s.type = "application/json";
    s.textContent = JSON.stringify(data);
    document.body.append(s);
  }, fixture("new-chat"));
  await page.getByRole("button", { name: "导出原图 1" }).waitFor();
  await worker.evaluate(() => {
    globalThis.spaSenders = [];
    chrome.runtime.onMessage.addListener((m, sender) => {
      if (m.type === "CREATE_TASK")
        globalThis.spaSenders.push({
          url: sender.url,
          tabUrl: sender.tab?.url,
          frameId: sender.frameId,
          documentId: sender.documentId,
        });
    });
  });
  await page.getByRole("button", { name: "导出原图 1" }).click();
  await page.getByRole("button", { name: "下载", exact: true }).click();
  const [spaSender] = await worker.evaluate(() => globalThis.spaSenders);
  assert.equal(spaSender.url, "https://www.qianwen.com/chat/chat-a");
  assert.equal(spaSender.tabUrl, "https://www.qianwen.com/chat/chat-b");
  await page
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor({ timeout: 5000 });
  console.log("PASS SPA conversation isolation and download without reload");
  await options.getByRole("button", { name: /支持平台/ }).click();
  await options.getByRole("checkbox", { name: "启用千问" }).uncheck();
  await page.locator("#wr-export-root").waitFor({ state: "detached" });
  await page.evaluate(() => history.pushState({}, "", "/chat/chat-c"));
  await page.evaluate((data) => {
    const s = document.createElement("script");
    s.type = "application/json";
    s.textContent = JSON.stringify(data);
    document.body.append(s);
  }, fixture("disabled-new-chat"));
  await options.getByRole("checkbox", { name: "启用千问" }).check();
  await page.getByRole("button", { name: "导出原图 1" }).waitFor();
  console.log("PASS disabled-platform SPA ownership");
  const doubao = await context.newPage();
  await doubao.goto("https://www.doubao.com/chat/123");
  await doubao.evaluate(() => {
    const i = document.querySelector("#generated");
    i.__reactFiber$fixture = {
      memoizedProps: {
        imageContent: {
          key: "image-a",
          image_ori_raw: {
            url: "https://p6-flow-imagex-sign.byteimg.com/a.png",
            width: 1,
            height: 1,
          },
        },
      },
      return: { memoizedProps: { conversationId: "123", messageId: "m" } },
    };
    i.src = "https://p6-flow-imagex-sign.byteimg.com/a.png";
  });
  await doubao.getByRole("button", { name: "导出原图 1" }).click();
  await doubao.screenshot({ path: join(out, "doubao-panel-fixture.png") });
  const singleTabs = await worker.evaluate(() => chrome.tabs.query({}));
  await doubao.getByRole("button", { name: "下载", exact: true }).click();
  await doubao
    .locator(".export-progress strong")
    .filter({ hasText: /已完成|失败/ })
    .waitFor({ timeout: 25000 });
  assert.equal(
    await doubao.locator(".export-progress strong").innerText(),
    "已完成",
    await doubao.locator(".export-progress").innerText(),
  );
  assert.equal(
    (await worker.evaluate(() => chrome.tabs.query({}))).length,
    singleTabs.length,
  );
  console.log("PASS Doubao scoped raw image and inline single browser save");
  await shared.getByRole("button", { name: "导出原图 1" }).click();
  await shared.getByRole("button", { name: "下载", exact: true }).click();
  await shared
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor();
  const sharedSaved = (
    await worker.evaluate(() => chrome.downloads.search({}))
  ).sort((a, b) => b.id - a.id)[0];
  assert.deepEqual(await readFile(sharedSaved.filename), png);
  await shared.evaluate(() => history.pushState({}, "", "/thread/nextShare43"));
  await shared.getByRole("button", { name: "导出原图 0" }).waitFor();
  await appendSharedImage("nextShare43", "shared-b");
  await shared.getByRole("button", { name: "导出原图 1" }).click();
  assert.equal(await shared.locator(".export-progress strong").count(), 0);
  await shared.getByRole("button", { name: "下载", exact: true }).click();
  await shared
    .locator(".export-progress strong")
    .filter({ hasText: "已完成" })
    .waitFor();
  console.log(
    "PASS Doubao share byte-identical download and SPA isolation without reload",
  );
  const layoutPage = await context.newPage();
  await layoutPage.goto("https://www.qianwen.com/chat/layout");
  await layoutPage.evaluate(
    (data) => {
      for (const item of data) {
        const s = document.createElement("script");
        s.type = "application/json";
        s.textContent = JSON.stringify(item);
        document.body.append(s);
      }
    },
    Array.from({ length: 9 }, (_, i) => fixture(`layout-${i}`)),
  );
  await layoutPage.getByRole("button", { name: "导出原图 10" }).click();
  const cards = await layoutPage.locator(".preview").evaluateAll((els) =>
    els.map((el) => ({
      top: el.getBoundingClientRect().top,
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
    })),
  );
  assert.equal(cards.filter((c) => c.top === cards[0].top).length, 5);
  assert(
    cards[0].width < 125 &&
      Math.abs(cards[0].width / cards[0].height - 3 / 4) < 0.01,
  );
  await layoutPage.screenshot({ path: join(out, "five-column-panel.png") });
  console.log("PASS five compact thumbnails per row");
  await options.locator("select[data-language]").selectOption("en");
  await layoutPage
    .locator("#wr-export-root[lang='en']")
    .waitFor({ state: "attached" });
  for (const width of [1440, 660, 540, 390]) {
    await layoutPage.setViewportSize({ width, height: 1000 });
    await layoutPage.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const overflow = await layoutPage.locator(".panel").evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      return [
        ...panel.querySelectorAll(
          ".toolbar button, .footer button, .card-actions > *, .header button",
        ),
      ].some((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.left < bounds.left - 1 ||
          rect.right > bounds.right + 1 ||
          node.scrollWidth > node.clientWidth + 1
        );
      });
    });
    assert.equal(overflow, false, `English controls fit at ${width}px`);
    await layoutPage.screenshot({ path: join(out, `panel-en-${width}.png`) });
  }
  await layoutPage.evaluate(() => {
    const root = document.querySelector("#wr-export-root").shadowRoot;
    const grid = root.querySelector(".grid");
    grid.scrollTop = 100;
    window.languageScroll = { grid, scrollTop: grid.scrollTop };
  });
  await options.locator("select[data-language]").selectOption("zh-CN");
  await layoutPage
    .locator("#wr-export-root[lang='zh-CN']")
    .waitFor({ state: "attached" });
  assert(
    await layoutPage.evaluate(() => {
      const grid = document
        .querySelector("#wr-export-root")
        .shadowRoot.querySelector(".grid");
      return (
        grid === window.languageScroll.grid &&
        grid.scrollTop === window.languageScroll.scrollTop
      );
    }),
  );
  console.log(
    "PASS English layouts and language switch without rebuilding the image grid",
  );
  assert.deepEqual(errors, []);
  console.log("SMOKE PASS");
} finally {
  await context.close();
}
