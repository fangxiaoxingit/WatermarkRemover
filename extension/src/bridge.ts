import { contextFromUrl, validateAsset } from "./core";
import { parseAssets } from "./adapters";
import type { Asset } from "./types";
import { ScriptOwnership } from "./lifecycle";
// Read-only platform integration. No network interception or replacement of native JSON methods.
let active = false,
  channel = "",
  current = contextFromUrl(location.href),
  timer = 0;
const scripts = () =>
  Array.from(document.querySelectorAll('script[type="application/json"]'));
const scriptScopes = new ScriptOwnership(current?.conversationId || "");
scriptScopes.observe(scripts());
// Navigation fires before pushState changes the URL; bind retained nodes to the old chat.
(window as any).navigation?.addEventListener("navigate", (event: any) => {
  const next = contextFromUrl(event.destination.url);
  scriptScopes.change(next?.conversationId || "", scripts());
  current = next;
  schedule();
});
// Keep only weak ownership metadata while disabled. No JSON is read or exported here.
new MutationObserver(() => {
  const next = contextFromUrl(location.href);
  if (next?.conversationId !== current?.conversationId) {
    // Conservative fallback for browsers without Navigation API: unknown retained nodes are old.
    scriptScopes.change(next?.conversationId || "", scripts());
    current = next;
  }
  scriptScopes.observe(scripts());
}).observe(document, { childList: true, subtree: true });
let observer: MutationObserver | undefined;
function scan() {
  if (!active || !channel) return;
  const next = contextFromUrl(location.href);
  if (next?.conversationId !== current?.conversationId) {
    current = next;
  }
  if (!current) return;
  const found = new Map<string, Asset>();
  if (current.platform === "qianwen") {
    for (const script of document.querySelectorAll(
      'script[type="application/json"]',
    )) {
      const text = script.textContent || "";
      if (!text.includes("generate_image") || text.length > 2_000_000) continue;
      if (!scriptScopes.belongs(script, current.conversationId)) continue;
      try {
        for (const a of parseAssets("qianwen", JSON.parse(text), current))
          found.set(a.assetId, a);
      } catch {}
    }
  } else {
    // The current rendered image component owns imageContent/item and a parent message scope.
    // Limit traversal to image ancestors; do not crawl application stores or unrelated chats.
    for (const image of document.querySelectorAll('img[alt="image"]')) {
      const key = Object.keys(image).find((k) => k.startsWith("__reactFiber$"));
      if (!key) continue;
      let fiber = (image as any)[key],
        candidate: any = null,
        messageId = "",
        conversationId = "";
      for (let n = 0; fiber && n < 25; n++, fiber = fiber.return) {
        const p = fiber.memoizedProps || {};
        if (
          !candidate &&
          (p.imageContent?.image_ori_raw || p.item?.image_ori_raw)
        )
          candidate = p.imageContent || p.item;
        if (p.conversationId) conversationId = String(p.conversationId);
        if (p.message?.conversation_id)
          conversationId = String(p.message.conversation_id);
        if (p.messageId || p.message?.message_id)
          messageId = String(p.messageId || p.message.message_id);
        if (candidate && conversationId && messageId) break;
      }
      if (!candidate || conversationId !== current.conversationId) continue;
      const raw = candidate.image_ori_raw;
      if (typeof raw?.url !== "string" || /watermark|cgen_lwm/i.test(raw.url))
        continue;
      const a = validateAsset(
        {
          ...current,
          assetId: String(candidate.key || ""),
          messageId,
          originalUrl: raw.url,
          width: raw.width,
          height: raw.height,
          source: "rendered creation.image_ori_raw",
        },
        current,
      );
      if (a) found.set(a.assetId, a);
    }
  }
  window.postMessage(
    {
      type: "WR_ASSETS",
      channel,
      context: current,
      assets: [...found.values()].slice(0, 1000),
    },
    location.origin,
  );
}
function schedule() {
  if (!active) return;
  clearTimeout(timer);
  timer = window.setTimeout(scan, 300);
}
window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.type !== "WR_CONTROL" ||
    typeof event.data.channel !== "string"
  )
    return;
  if (channel && channel !== event.data.channel) return;
  channel = event.data.channel;
  if (event.data.action === "stop") {
    active = false;
    observer?.disconnect();
    observer = undefined;
    clearTimeout(timer);
    return;
  }
  if (!["scan", "start"].includes(event.data.action)) return;
  active = true;
  if (!observer) {
    observer = new MutationObserver((records) => {
      if (
        records.some(
          (r) =>
            !(
              r.target instanceof Element && r.target.closest("#wr-export-root")
            ),
        )
      )
        schedule();
    });
    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  }
  schedule();
});
window.addEventListener("popstate", schedule);
window.addEventListener("hashchange", schedule);
