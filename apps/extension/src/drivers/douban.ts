import type { ExtensionJobResult } from "@tassello/shared";
import { cacheQuery } from "../driver-utils.ts";
import { executeInPage, waitForText } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

type DoubanPhoto = { id: string; url: string; width: number; height: number };

async function uploadPhoto(runtime: PublishRuntime, tabId: number, image: Awaited<ReturnType<PublishRuntime["loadMedia"]>>[number]): Promise<DoubanPhoto> {
  const query = cacheQuery(runtime, image, "photo");
  const cached = await runtime.lookupUpload(query);
  if (cached) {
    const payload = cached.payload as Partial<DoubanPhoto>;
    if (typeof payload.id === "string" && typeof payload.url === "string") {
      return {
        id: payload.id,
        url: payload.url,
        width: Number(payload.width ?? 0),
        height: Number(payload.height ?? 0),
      };
    }
  }
  const photo = await executeInPage(tabId, async ({ base64, name, mime }) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const ck = document.cookie.match(/(?:^|;\s*)ck=([^;]+)/)?.[1] ?? "";
    const authToken = ((globalThis as typeof globalThis & {
      __INIT_STATE__?: { upload_auth_token?: string };
    }).__INIT_STATE__?.upload_auth_token) ?? "";
    const form = new FormData();
    form.append("ck", ck);
    form.append("image_file", new File([bytes], name, { type: mime }));
    form.append("primary_color", "");
    form.append("upload_auth_token", authToken);
    const response = await fetch("https://upload.douban.com/j/group/topic/add_photo", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const payload = await response.json().catch(() => null) as {
      r?: number;
      photo?: { id?: string | number; url?: string; width?: number; height?: number };
    } | null;
    if (!response.ok || !payload || payload.r !== 0 || !payload.photo?.id) {
      throw new Error(`豆瓣图片上传失败（HTTP ${response.status}）`);
    }
    return {
      id: String(payload.photo.id),
      url: String(payload.photo.url || ""),
      width: Number(payload.photo.width || 0),
      height: Number(payload.photo.height || 0),
    };
  }, { base64: image.base64, name: image.fileName || "image.png", mime: image.mime }, 120_000);
  await runtime.saveUpload(query, { id: photo.id, url: photo.url, payload: photo as unknown as Record<string, unknown> });
  return photo;
}

type DraftItem = { kind: "text"; text: string } | { kind: "image"; order: number };

function draftItems(runtime: PublishRuntime): DraftItem[] {
  const items: DraftItem[] = [];
  for (const line of runtime.job.snapshot.markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const image = trimmed.match(/^!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)$/);
    if (image) {
      const item = runtime.job.snapshot.media.find((media) => media.kind === "image" && (
        media.resolved === image[1] || media.raw.includes(image[1]!)
      ));
      if (item) items.push({ kind: "image", order: item.order });
      continue;
    }
    const text = trimmed
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "• ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .trim();
    if (text) items.push({ kind: "text", text });
  }
  return items;
}

export async function publishDouban(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  if (!["article", "image"].includes(runtime.job.snapshot.type)) throw new Error("豆瓣只支持文章和贴图");
  const tabId = await runtime.open("https://www.douban.com/", false);
  await waitForText(tabId, "豆瓣", 20_000).catch(() => undefined);
  const imageMedia = (await runtime.loadMedia(runtime.job.snapshot.media.filter((media) => media.kind === "image")));
  const photoByOrder = new Map<number, DoubanPhoto>();
  for (const [index, image] of imageMedia.entries()) {
    runtime.report({ status: "uploading", stage: 1, progress: 15 + Math.round(((index + 1) / imageMedia.length) * 55), message: `上传豆瓣图片 ${index + 1}/${imageMedia.length}` });
    photoByOrder.set(image.order, await uploadPhoto(runtime, tabId, image));
  }
  const items = draftItems(runtime);
  const hasText = items.some((item) => item.kind === "text");
  const imageLayout = imageMedia.length ? (hasText ? "vertical" : "horizontal") : undefined;
  const photos = imageMedia.map((image) => photoByOrder.get(image.order)).filter((item): item is DoubanPhoto => !!item);
  const entityMap: Record<string, unknown> = {};
  const blocks: Record<string, unknown>[] = [];
  let imageSeq = 0;
  for (const item of items) {
    if (item.kind === "text") {
      blocks.push({
        key: `t${Date.now().toString(36)}${blocks.length}`,
        text: item.text,
        type: "unstyled",
        depth: 0,
        inlineStyleRanges: [],
        entityRanges: [],
        data: { align: "" },
      });
    } else {
      const photo = photoByOrder.get(item.order);
      if (!photo) continue;
      const key = `e${imageSeq++}`;
      entityMap[key] = {
        type: "IMAGE",
        mutability: "IMMUTABLE",
        data: { src: photo.url, width: photo.width, height: photo.height, id: photo.id },
      };
      blocks.push({
        key: `t${Date.now().toString(36)}${blocks.length}`,
        text: " ",
        type: "atomic",
        depth: 0,
        inlineStyleRanges: [],
        entityRanges: [{ key, offset: 0, length: 1 }],
        data: { align: "" },
      });
    }
  }
  const title = runtime.job.snapshot.title.trim();
  const draftProps = JSON.stringify({
    ...(title ? { title } : {}),
    content: { blocks, entityMap },
    image_ids: photos.map((photo) => photo.id),
    ...(imageLayout ? { image_layout: imageLayout } : {}),
    topic_tag_ids: [],
    subtype: "personal",
  });
  runtime.report({ status: "filling", stage: 2, progress: 80, message: "保存豆瓣草稿" });
  const result = await executeInPage(tabId, async ({ draftProps }) => {
    const response = await fetch("https://m.douban.com/rexxar/api/v2/dwarf/drafts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_props: draftProps }),
    });
    const text = await response.text();
    let id: string | null = null;
    try {
      id = String((JSON.parse(text) as { id?: unknown }).id || "") || null;
    } catch {}
    return { ok: response.ok, status: response.status, id, message: response.ok ? null : text.slice(0, 300) };
  }, { draftProps });
  if (!result.ok || !result.id) {
    await Promise.all(imageMedia.map((image) => runtime.forgetUpload(cacheQuery(runtime, image, "photo"))));
    throw new Error(`豆瓣草稿保存失败（HTTP ${result.status}）：${result.message || "未知错误"}`);
  }
  return {
    status: "awaiting_confirm",
    url: `https://www.douban.com/topic/create?draft_id=${encodeURIComponent(result.id)}`,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
