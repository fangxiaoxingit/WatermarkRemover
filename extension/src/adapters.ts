import { allowedUrl, validateAsset } from "./core";
import type { Asset, Context, Platform } from "./types";
// Parse only structured generated-image records; never infer originals from a thumbnail URL.
export function parseAssets(
  platform: Platform,
  payload: unknown,
  context: Context,
): Asset[] {
  const result = new Map<string, Asset>(),
    seen = new WeakSet<object>();
  let budget = 12000;
  function add(image: any, scope: Context, messageId: string, source: string) {
    const resource = platform === "doubao" ? image?.image_ori_raw : image;
    const urls =
      platform === "doubao"
        ? [resource?.url]
        : Array.isArray(resource?.resource_infos)
          ? resource.resource_infos.map((r: any) => r.url)
          : [resource?.url];
    const originalUrl = urls.find((s: unknown) => allowedUrl(s, platform));
    if (!originalUrl) return;
    if (/watermark|cgen_lwm/i.test(originalUrl)) return;
    const a = validateAsset(
      {
        ...scope,
        assetId: String(
          image?.key || image?.id || new URL(originalUrl).pathname,
        ),
        messageId,
        originalUrl,
        width: Number(resource?.width || image?.width || 0),
        height: Number(resource?.height || image?.height || 0),
        source,
      },
      context,
    );
    if (a) result.set(a.assetId, a);
  }
  function walk(
    v: any,
    scope: Context | null,
    mid = "",
    generated = false,
    depth = 0,
  ): void {
    if (--budget < 0 || depth > 24 || v == null) return;
    if (typeof v === "string") {
      if (
        v.length < 2_000_000 &&
        /creations|generate_image|layout_list|display_list/.test(v)
      ) {
        try {
          walk(JSON.parse(v), scope, mid, generated, depth + 1);
        } catch {}
      }
      return;
    }
    if (typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, scope, mid, generated, depth + 1));
      return;
    }
    const cid = v.conversation_id || v.conversationId;
    if (cid) {
      if (String(cid) !== context.conversationId) return;
      scope = { ...context, conversationId: String(cid) };
    }
    mid = String(v.message_id || v.messageId || mid);
    if (platform === "doubao") {
      if (scope && Array.isArray(v.creations))
        for (const c of v.creations)
          if (c?.image && !c?.video)
            add(c.image, scope, mid, "creations.image.image_ori_raw");
    } else {
      if (Array.isArray(v.resource_infos)) {
        const resources = new Map(
          v.resource_infos.map((r: any) => [r.refer_id, r]),
        );
        for (const layout of [
          ...(v.layout_list || []),
          ...(v.display_list || []),
        ]) {
          if (layout?.type !== "generate_image" || !Array.isArray(layout.image))
            continue;
          for (const ref of layout.image) {
            const resource = resources.get(ref);
            if (resource)
              add(
                resource,
                scope || context,
                mid,
                "generate_image.image → resource_infos",
              );
          }
        }
      }
      if (v.type === "ref_image") return;
      if (v.type === "generate_image") generated = true;
      if (generated && v.image) {
        const items = Array.isArray(v.image) ? v.image : [v.image];
        for (const im of items) {
          if (im?.image)
            add(im.image, scope || context, mid, "generate_image.image");
          else if (im?.resource_infos || im?.url)
            add(im, scope || context, mid, "generate_image.image");
        }
      }
    }
    for (const [key, value] of Object.entries(v)) {
      if (
        /^(ref_image|watermark_image|brand_watermark_image|ai_watermark_image|video|image_thumb|image_preview|children|_owner)$/.test(
          key,
        )
      )
        continue;
      walk(value, scope, mid, generated, depth + 1);
    }
  }
  walk(payload, platform === "qianwen" ? context : null);
  return [...result.values()];
}
