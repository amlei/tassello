import type { ExtensionJobResult } from "@tassello/shared";
import { articleHtml, cacheQuery, coverMedia, figureSourceMap, mediaOfKind, plainBody, summaryText } from "../driver-utils.ts";
import {
  clickText,
  executeInPage,
  setControlValue,
  setInputFiles,
  waitForSelector,
  waitForText,
} from "../page-runtime.ts";
import type { LoadedMedia, PublishRuntime } from "../publish-runtime.ts";

const MP_HOME = "https://mp.weixin.qq.com/";

async function readWechatSession(tabId: number): Promise<string | null> {
  const session = await executeInPage(tabId, async () => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const scan = !!document.querySelector(".login__type__container__scan, #scan_qrcode");
      const token = new URL(location.href).searchParams.get("token");
      const common = (globalThis as typeof globalThis & {
        wx?: { commonData?: { data?: Record<string, unknown> } };
      }).wx?.commonData?.data;
      if (scan && !token) return { state: "needs_login" as const, token: null };
      if (token) return { state: "ok" as const, token };
      if (common?.user_name || common?.nick_name) {
        const match = location.href.match(/[?&]token=(\d+)/);
        return { state: "ok" as const, token: match?.[1] ?? null };
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    return { state: "timeout" as const, token: null };
  }, []);
  if (session.state === "needs_login") throw new Error("公众号后台未登录，请扫码登录");
  if (session.state === "timeout") throw new Error("公众号后台加载超时");
  return session.token;
}

async function openEditor(runtime: PublishRuntime, createType: number): Promise<number> {
  const home = await runtime.open(MP_HOME, false);
  const token = await readWechatSession(home);
  await runtime.close(home);
  const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=${createType}${token ? `&token=${token}` : ""}&lang=zh_CN`;
  return runtime.open(url, true);
}

async function uploadImage(runtime: PublishRuntime, tabId: number, image: LoadedMedia): Promise<string> {
  const result = await uploadMaterial(runtime, tabId, image, 8);
  return result.url || "";
}

async function uploadMaterial(
  runtime: PublishRuntime,
  tabId: number,
  media: LoadedMedia,
  scene: number,
): Promise<{ id: string; url: string | null }> {
  const query = cacheQuery(runtime, media, `filetransfer:scene-${scene}`);
  const cached = await runtime.lookupUpload(query);
  if (cached) {
    const payload = cached.payload && typeof cached.payload === "object" ? cached.payload : {};
    return {
      id: cached.id,
      url: typeof payload.cdn === "string" ? payload.cdn : cached.url,
    };
  }
  const result = await executeInPage(tabId, async ({ base64, name, mime, scene }) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), name);
      const data = (globalThis as typeof globalThis & {
        wx?: { commonData?: { data?: Record<string, unknown> } };
      }).wx?.commonData?.data ?? {};
      const seq = Date.now();
      const url = `/cgi-bin/filetransfer?action=upload_material&f=json&scene=${scene}&writetype=doublewrite&groupid=1`
        + `&ticket_id=${encodeURIComponent(String(data.ticket_id ?? ""))}`
        + `&ticket_token=${encodeURIComponent(String(data.ticket_token ?? ""))}`
        + `&svr_time=${Math.floor(seq / 1000)}&lang=zh_CN&seq=${seq}`;
      const response = await fetch(url, { method: "POST", body: form, credentials: "include" });
      const payload = await response.json().catch(() => null) as {
        base_resp?: { ret?: number; err_msg?: string };
        content?: string;
        cdn_url?: string;
      } | null;
      if (!response.ok || payload?.base_resp?.ret !== 0 || !payload.content) {
        return { error: `公众号素材上传失败：${payload?.base_resp?.err_msg || response.status}` };
      }
      return { id: payload.content, url: payload.cdn_url || null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, { base64: media.base64, name: media.fileName || "asset", mime: media.mime, scene }, 300_000);
  if ("error" in result) throw new Error(result.error || "公众号素材上传失败");
  if (!result.id) throw new Error("公众号素材上传没有返回文件 ID");
  await runtime.saveUpload(query, {
    id: result.id,
    url: result.url,
    payload: { cdn: result.url, sourceName: media.fileName },
  });
  return result;
}

async function pasteWechatBody(tabId: number, html: string, text: string): Promise<void> {
  const result = await executeInPage(tabId, ({ html, text }) => {
    const candidates = Array.from(document.querySelectorAll(".ProseMirror"))
      .filter((element) => (element as HTMLElement).offsetHeight > 80)
      .sort((a, b) => (b as HTMLElement).offsetHeight - (a as HTMLElement).offsetHeight);
    const editor = candidates[0] as HTMLElement | undefined;
    if (!editor) return false;
    return (async () => {
      editor.focus();
      const transfer = new DataTransfer();
      transfer.setData("text/html", html);
      transfer.setData("text/plain", text);
      editor.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }));
      if (!editor.textContent?.trim()) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection?.removeAllRanges();
        selection?.addRange(range);
        const inserted = document.execCommand("insertHTML", false, html);
        if (!inserted) {
          editor.innerHTML = html;
          editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text }));
        }
      }
      const expected = text.replace(/\s+/g, "").slice(0, 24);
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if ((editor.textContent ?? "").replace(/\s+/g, "").includes(expected)) return true;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return false;
    })();
  }, { html, text });
  if (!result) throw new Error("未找到公众号正文编辑区");
}

async function setWechatTitle(tabId: number, title: string): Promise<boolean> {
  if (!(await setControlValue(tabId, "textarea#title", title))) return false;
  await executeInPage(tabId, ({ title }) => {
    const editor = Array.from(document.querySelectorAll(".ProseMirror"))
      .find((element) => {
        const height = (element as HTMLElement).offsetHeight;
        return height > 0 && height < 60;
      }) as HTMLElement | undefined;
    if (!editor || editor.textContent?.trim()) return false;
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const inserted = document.execCommand("insertText", false, title);
    if (!inserted) {
      editor.textContent = title;
      editor.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: title,
      }));
    }
    return true;
  }, { title });
  return true;
}

async function publishArticle(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const tabId = await openEditor(runtime, 0);
  await waitForSelector(tabId, "textarea#title", { visible: false, timeoutMs: 60_000 });
  const imageRefs = mediaOfKind(runtime, "image");
  const images = await runtime.loadMedia(imageRefs);
  const coverRef = coverMedia(runtime);
  const remote = new Map<string, string>();
  for (const [index, image] of images.entries()) {
    runtime.report({ status: "uploading", stage: 1, progress: 15 + Math.round(((index + 1) / images.length) * 45), message: `上传公众号配图 ${index + 1}/${images.length}` });
    const url = await uploadImage(runtime, tabId, image);
    if (url) {
      remote.set(image.assetId ?? image.resolved, url);
      remote.set(image.resolved, url);
    }
  }
  const title = runtime.job.snapshot.title.slice(0, 64);
  const titleSet = await setWechatTitle(tabId, title);
  if (!titleSet) throw new Error("公众号标题写入失败");
  const summary = summaryText(runtime);
  if (summary) await setControlValue(tabId, "textarea#js_description", summary).catch(() => false);
  const html = articleHtml(runtime, figureSourceMap(images, remote));
  runtime.report({ status: "filling", stage: 2, progress: 75, message: "填充公众号正文与摘要" });
  await pasteWechatBody(tabId, html, plainBody(runtime));
  if (coverRef) {
    const coverIsBodyImage = coverRef.role !== "cover";
    let coverFileName = "";
    if (!coverIsBodyImage) {
      const [cover] = await runtime.loadMedia([coverRef]);
      if (!cover) throw new Error("公众号封面素材读取失败");
      coverFileName = cover.fileName || "";
      runtime.report({ status: "uploading", stage: 2, progress: 82, message: "上传公众号封面" });
      await uploadImage(runtime, tabId, cover);
    }
    if (!(await clickText(tabId, "拖拽或选择封面", {
      selector: "#js_cover_area .js_cover_btn_area",
      exact: false,
      timeoutMs: 15_000,
    }))) {
      throw new Error("未找到公众号封面设置入口");
    }
    await clickText(tabId, coverIsBodyImage ? "从正文选择" : "从图片库选择", { exact: false, timeoutMs: 10_000 });
    await waitForText(tabId, "选择图片", 20_000);
    await waitForSelector(tabId, ".weui-desktop-img-picker__item", { visible: true, timeoutMs: 30_000 });
    const selected = await executeInPage(tabId, ({ coverIndex, coverFileName: fileName }) => {
      const items = Array.from(document.querySelectorAll(".weui-desktop-img-picker__item"));
      const named = fileName
        ? items.find((element) =>
          element.querySelector(".weui-desktop-img-picker__img-title")?.textContent?.trim() === fileName
        )
        : undefined;
      const item = (named ?? items[coverIndex]) as HTMLElement | undefined;
      item?.click();
      return !!item;
    }, {
      coverIndex: coverIsBodyImage
        ? Math.max(0, imageRefs.findIndex((item) =>
            item.assetId === coverRef.assetId || item.resolved === coverRef.resolved
          ))
        : 0,
      coverFileName,
    });
    if (!selected) throw new Error("公众号没有可用的封面图片");
    await clickText(tabId, "下一步", { exact: true, timeoutMs: 10_000 });
    await waitForText(tabId, "编辑封面", 20_000);
    await clickText(tabId, "确认", { exact: true, timeoutMs: 10_000 });
    await waitForSelector(tabId, "#js_cover_area .js_cover_preview_new", { visible: true, timeoutMs: 20_000 });
    runtime.report({ status: "filling", stage: 3, progress: 92, message: "公众号封面已设置" });
  }
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

async function publishImage(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const images = await runtime.loadMedia(runtime.job.snapshot.media.filter((item) => item.kind === "image"));
  if (!images.length) throw new Error("公众号贴图没有图片素材");
  if (images.length > 20) throw new Error("公众号贴图一次最多 20 张");
  const tabId = await openEditor(runtime, 8);
  await waitForSelector(tabId, 'input[type="file"]', { visible: false, timeoutMs: 60_000 });
  if (!(await setInputFiles(tabId, 'input[type="file"]', [images[0]!]))) {
    throw new Error("公众号贴图没有进入上传控件");
  }
  await waitForText(tabId, "上传成功", 180_000).catch(() => undefined);
  await waitForSelector(tabId, "#title, .js_title_main .ProseMirror", { visible: true, timeoutMs: 60_000 });
  const title = runtime.job.snapshot.title.slice(0, 64);
  if (!(await setControlValue(tabId, "#title, .js_title_main .ProseMirror", title))) {
    throw new Error("公众号贴图标题写入失败");
  }
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

async function publishVideo(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const video = (await runtime.loadMedia(runtime.job.snapshot.media.filter((item) => item.kind === "video")))[0];
  if (!video) throw new Error("公众号视频稿没有视频素材");
  const home = await runtime.open(MP_HOME, false);
  const token = await readWechatSession(home);
  await runtime.close(home);
  const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/videomsg_edit&action=video_edit&type=15${token ? `&token=${token}` : ""}&lang=zh_CN`;
  const tabId = await runtime.open(url, true);
  await waitForSelector(tabId, 'input[type="file"][accept*="video"]', { visible: false, timeoutMs: 60_000 });
  if (!(await setInputFiles(tabId, 'input[type="file"][accept*="video"]', [video]))) {
    throw new Error("公众号视频没有进入上传控件");
  }
  await setControlValue(tabId, 'input[name="title"]', runtime.job.snapshot.title.slice(0, 64)).catch(() => false);
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

async function publishAudio(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const audio = (await runtime.loadMedia(runtime.job.snapshot.media.filter((item) => item.kind === "audio")))[0];
  if (!audio) throw new Error("公众号音频稿没有音频素材");
  const tabId = await openEditor(runtime, 7);
  await waitForSelector(tabId, "#title, .js_title_main .ProseMirror", { visible: true, timeoutMs: 60_000 });
  const title = runtime.job.snapshot.title.slice(0, 64);
  if (!(await setControlValue(tabId, "#title, .js_title_main .ProseMirror", title))) {
    throw new Error("公众号音频标题写入失败");
  }
  const uploaded = await uploadMaterial(runtime, tabId, audio, 4);
  runtime.report({ message: `音频素材已上传（${uploaded.id}），请在公众号编辑器里从音频素材库插入` });
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

export async function publishWechat(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const type = runtime.job.snapshot.type;
  if (type === "article") return publishArticle(runtime);
  if (type === "image") return publishImage(runtime);
  if (type === "video") return publishVideo(runtime);
  if (type === "audio") return publishAudio(runtime);
  throw new Error(`公众号不支持的内容类型：${type}`);
}
