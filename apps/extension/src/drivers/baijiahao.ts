import type { ExtensionJobResult } from "@tassello/shared";
import {
  articleHtml,
  figureSourceMap,
  mediaOfKind,
  plainBody,
} from "../driver-utils.ts";
import {
  clickText,
  executeInPage,
  setInputFiles,
  waitForEnabledButton,
  waitForSelector,
  waitForUploadIdle,
} from "../page-runtime.ts";
import type { LoadedMedia, PublishRuntime } from "../publish-runtime.ts";

const EDITOR_URL = "https://baijiahao.baidu.com/builder/rc/edit";
const NEWS_URL = `${EDITOR_URL}?type=news`;
const VIDEO_URL = `${EDITOR_URL}?type=video`;
const EVENTS_URL = `${EDITOR_URL}?type=events`;

export function fitBaijiaArticleTitle(title: string): string {
  const normalized = title.trim();
  const chars = Array.from(normalized);
  if (chars.length < 2) throw new Error("百家号图文标题至少需要 2 个字");
  if (chars.length > 64) throw new Error("百家号图文标题不能超过 64 个字");
  return normalized;
}

export function fitBaijiaVideoTitle(title: string): string {
  const normalized = title.trim();
  const chars = Array.from(normalized);
  if (chars.length < 2) throw new Error("百家号视频标题至少需要 2 个字");
  if (chars.length > 50) throw new Error("百家号视频标题不能超过 50 个字");
  return normalized;
}

export function baijiaEventText(runtime: PublishRuntime): string {
  const title = runtime.job.snapshot.title.trim();
  const body = plainBody(runtime).trim();
  const text = title && body && !body.startsWith(title) ? `${title}\n\n${body}` : body || title;
  if (!text) throw new Error("百家号动态需要正文");
  if (Array.from(text).length > 2_000) throw new Error("百家号动态正文不能超过 2000 个字");
  return text;
}

export function baijiaArticleHtml(
  runtime: PublishRuntime,
  replacements: Map<string, string> = new Map(),
): string {
  return articleHtml(runtime, replacements).replace(
    /<figure\b[^>]*>([\s\S]*?)<\/figure>/g,
    (_match, content: string) => /<img\b/i.test(content) ? `<p>${content}</p>` : "",
  );
}

type BaijiaEditor = {
  getContent?: () => string;
  setContent?: (html: string) => void;
  fireEvent?: (name: string) => void;
};

type LexicalNode = {
  append?: (node: LexicalNode) => void;
  clear?: () => void;
  getFirstChild?: () => LexicalNode | null;
  setTextContent?: (text: string) => void;
};
type LexicalNodeClass = new (text?: string) => LexicalNode;

async function replaceBaijiaLexicalText(tabId: number, selector: string, text: string): Promise<boolean> {
  const expected = text.replace(/\s+/g, "");
  return executeInPage(tabId, async ({ selector, text, expected }) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const element = document.querySelector(selector) as (HTMLElement & {
        __lexicalEditor?: {
          _nodes?: Map<string, unknown>;
          _editorState?: { _nodeMap?: Map<string, LexicalNode> };
          _pendingEditorState?: { _nodeMap?: Map<string, LexicalNode> } | null;
          update?: (fn: () => void) => void;
        };
      }) | null;
      const editor = element?.__lexicalEditor;
      if (element && editor?.update) {
        const resolveNodeClass = (name: string): LexicalNodeClass | undefined => {
          const registered = editor._nodes?.get(name) as
            | LexicalNodeClass
            | { klass?: LexicalNodeClass }
            | undefined;
          if (typeof registered === "function") return registered;
          return registered?.klass;
        };
        try {
          editor.update(() => {
            const root = (editor._pendingEditorState ?? editor._editorState)?._nodeMap?.get("root");
            if (!root) throw new Error("Lexical root 不可用");
            const existingParagraph = root.getFirstChild?.();
            const existingText = existingParagraph?.getFirstChild?.();
            const ParagraphClass = (existingParagraph?.constructor as LexicalNodeClass | undefined)
              ?? resolveNodeClass("paragraph");
            const TextClass = (existingText?.constructor as LexicalNodeClass | undefined)
              ?? resolveNodeClass("text");
            if (!ParagraphClass || !TextClass) throw new Error("Lexical 节点类型不可用");
            root.clear?.();
            for (const line of text.split(/\n+/).map((item: string) => item.trim()).filter(Boolean)) {
              const paragraph = new ParagraphClass() as LexicalNode;
              const node = new TextClass(line) as LexicalNode;
              node.setTextContent?.(line);
              paragraph.append?.(node);
              root.append?.(paragraph);
            }
          });
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
        if ((element.textContent ?? "").replace(/\s+/g, "") === expected) return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }, { selector, text, expected });
}

/* 标题是独立 Lexical 编辑器；原生 setter/execCommand 会追加到既有节点，
 * 这里直接重建标题根节点，保证重试和恢复草稿时不会叠字。 */
async function setBaijiaTitle(tabId: number, title: string): Promise<void> {
  const applied = await executeInPage(tabId, ({ title }) => {
    const element = document.querySelector(
      '[data-testid="news-title-input"] [contenteditable="true"]',
    ) as (HTMLElement & { __lexicalEditor?: unknown }) | null;
    const editor = element?.__lexicalEditor as {
      _editorState?: { _nodeMap?: Map<string, LexicalNode> };
      _pendingEditorState?: { _nodeMap?: Map<string, LexicalNode> } | null;
      _nodes?: Map<string, unknown>;
      update?: (fn: () => void) => void;
    } | undefined;
    if (!element || !editor?.update) return false;
    const resolveNodeClass = (name: string): LexicalNodeClass | undefined => {
      const registered = editor._nodes?.get(name) as
        | LexicalNodeClass
        | { klass?: LexicalNodeClass }
        | undefined;
      if (typeof registered === "function") return registered;
      return registered?.klass;
    };
    try {
      editor.update(() => {
        const currentRoot = (editor._pendingEditorState ?? editor._editorState)?._nodeMap?.get("root");
        if (!currentRoot) return;
        const paragraph = currentRoot.getFirstChild?.();
        const text = paragraph?.getFirstChild?.();
        const ParagraphClass = (paragraph?.constructor as LexicalNodeClass | undefined)
          ?? resolveNodeClass("paragraph");
        const TextClass = (text?.constructor as LexicalNodeClass | undefined)
          ?? resolveNodeClass("text");
        if (!ParagraphClass || !TextClass) throw new Error("Lexical 节点类型不可用");
        currentRoot.clear?.();
        const nextParagraph = new ParagraphClass() as LexicalNode;
        const nextText = new TextClass(title) as LexicalNode;
        nextText.setTextContent?.(title);
        nextParagraph.append?.(nextText);
        currentRoot.append?.(nextParagraph);
      });
      return true;
    } catch {
      return false;
    }
  }, { title });
  if (!applied) {
    const fallback = await executeInPage(tabId, ({ title }) => {
      const element = document.querySelector(
        '[data-testid="news-title-input"] [contenteditable="true"]',
      ) as HTMLElement | null;
      if (!element) return false;
      element.focus();
      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, title);
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: title,
      }));
      return (element.textContent ?? "").trim() === title;
    }, { title });
    if (!fallback) throw new Error("百家号图文标题编辑器不可写");
  }
  const rendered = await executeInPage(tabId, async ({ title }) => {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const element = document.querySelector(
        '[data-testid="news-title-input"] [contenteditable="true"]',
      );
      if ((element?.textContent ?? "").trim() === title) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }, { title });
  if (!rendered) throw new Error("百家号图文标题写入失败");
}

async function baijiaEditorHtml(tabId: number, minimumImages = 0): Promise<string> {
  return executeInPage(tabId, async ({ minimumImages }) => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const instances = (globalThis as typeof globalThis & {
        UE_V2?: { instants?: Record<string, BaijiaEditor> };
      }).UE_V2?.instants ?? {};
      const editor = Object.values(instances).find((candidate) =>
        typeof candidate?.getContent === "function"
        && typeof candidate?.setContent === "function"
      );
      const html = editor?.getContent?.() ?? "";
      if ((html.match(/<img\b/gi) ?? []).length >= minimumImages) return html;
      if (/上传失败|图片上传失败/.test(document.body?.innerText ?? "")) return "";
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return "";
  }, { minimumImages }, 185_000);
}

async function replaceBaijiaArticleHtml(
  tabId: number,
  html: string,
  text: string,
  minimumImages = 0,
): Promise<boolean> {
  const replaced = await executeInPage(tabId, async ({ html, text, minimumImages }) => {
    const instances = (globalThis as typeof globalThis & {
      UE_V2?: { instants?: Record<string, BaijiaEditor> };
    }).UE_V2?.instants ?? {};
    const editor = Object.values(instances).find((candidate) =>
      typeof candidate?.getContent === "function"
      && typeof candidate?.setContent === "function"
    );
    if (!editor?.setContent) return false;
    const expected = text.replace(/\s+/g, "").slice(0, 24);
    if (!expected && minimumImages === 0) {
      editor.setContent(html);
      editor.fireEvent?.("contentchange");
      return true;
    }
    editor.setContent(html);
    editor.fireEvent?.("contentchange");
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const frame = document.querySelector("#ueditor_0") as HTMLIFrameElement | null;
      const rendered = frame?.contentDocument?.body;
      const content = rendered?.innerHTML ?? editor.getContent?.() ?? "";
      const compact = (rendered?.textContent ?? content).replace(/\s+/g, "");
      const images = rendered?.querySelectorAll("img").length
        ?? (content.match(/<img\b/gi)?.length ?? 0);
      if ((!expected || compact.includes(expected)) && images >= minimumImages) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }, { html, text, minimumImages });
  if (!replaced) throw new Error("百家号图文正文或配图没有完成写入");
  return true;
}

async function uploadArticleImages(
  runtime: PublishRuntime,
  tabId: number,
  images: LoadedMedia[],
): Promise<Map<string, string>> {
  if (!images.length) return new Map();
  runtime.report({
    status: "uploading",
    stage: 1,
    progress: 30,
    message: `上传百家号图文配图 ${images.length} 张`,
  });
  const opened = await executeInPage(tabId, () => {
    const button = document.querySelector(".edui-for-insertimage");
    if (!(button instanceof HTMLElement)) return false;
    /* UEditor 的弹窗绑定在内层按钮的 onclick 上；外层仅负责按下态。 */
    const target = button.querySelector<HTMLElement>(".edui-button-body")
      ?? button.querySelector<HTMLElement>("[onclick]")
      ?? button;
    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
    });
    if (typeof target.onmousedown === "function") target.onmousedown(down);
    else target.dispatchEvent(down);
    target.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    target.click();
    return true;
  }, []);
  if (!opened) throw new Error("未找到百家号图文图片入口");
  await waitForSelector(tabId, 'input[type="file"][multiple]', { visible: false, timeoutMs: 20_000 });
  if (!(await setInputFiles(tabId, 'input[type="file"][multiple]', images))) {
    throw new Error("百家号图文图片没有进入上传控件");
  }
  await waitForEnabledButton(tabId, ["确认"], 180_000);
  if (!(await clickText(tabId, "确认", { selector: "button", exact: true, timeoutMs: 10_000 }))) {
    throw new Error("百家号图文图片没有完成插入");
  }
  const html = await baijiaEditorHtml(tabId, images.length);
  const sources = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1] ?? "");
  if (sources.length < images.length) throw new Error("百家号图文图片上传后没有全部进入正文");
  const remote = new Map<string, string>();
  for (const [index, image] of images.entries()) {
    const url = sources[index];
    if (!url) continue;
    remote.set(image.assetId ?? image.resolved, url);
    remote.set(image.resolved, url);
  }
  return remote;
}

async function publishArticle(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const tabId = await runtime.open(NEWS_URL, true);
  await waitForSelector(
    tabId,
    '[data-testid="news-title-input"] [contenteditable="true"]',
    { visible: true, timeoutMs: 60_000 },
  );
  const title = fitBaijiaArticleTitle(runtime.job.snapshot.title);
  await setBaijiaTitle(tabId, title);
  const text = plainBody(runtime);
  await replaceBaijiaArticleHtml(tabId, "", "");
  const images = await runtime.loadMedia(mediaOfKind(runtime, "image"));
  const remote = await uploadArticleImages(runtime, tabId, images);
  runtime.report({ status: "filling", stage: 2, progress: 75, message: "填充百家号图文正文" });
  await replaceBaijiaArticleHtml(
    tabId,
    baijiaArticleHtml(runtime, figureSourceMap(images, remote)),
    text,
    images.length,
  );
  runtime.report({ status: "filling", stage: 3, progress: 88, message: "保存百家号图文草稿" });
  if (!(await clickText(tabId, "存草稿", { selector: "button", exact: true, timeoutMs: 20_000 }))) {
    throw new Error("未找到百家号存草稿按钮");
  }
  const saved = await executeInPage(tabId, async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const text = document.body?.innerText ?? "";
      if (/内容已存入草稿/.test(text)) return "saved";
      if (/保存失败|存入失败/.test(text)) return "failed";
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return "timeout";
  }, [], 65_000);
  if (saved === "failed") throw new Error("百家号图文草稿保存失败");
  if (saved !== "saved") throw new Error("百家号图文草稿保存超时");
  const pageUrl = await runtime.currentUrl(tabId);
  if (!/[?&]article_id=\d+/.test(pageUrl)) throw new Error("百家号图文草稿没有返回 article_id");
  return {
    status: "awaiting_confirm",
    url: pageUrl,
    pageUrl,
    tabId,
    error: null,
  };
}

async function publishEvents(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const text = baijiaEventText(runtime);
  const images = await runtime.loadMedia(mediaOfKind(runtime, "image"));
  if (images.length > 9) throw new Error("百家号动态一次最多 9 张图片");
  const tabId = await runtime.open(EVENTS_URL, true);
  await waitForSelector(tabId, '[class*="contentEditable"]', { visible: true, timeoutMs: 60_000 });
  if (!(await replaceBaijiaLexicalText(tabId, '[class*="contentEditable"]', text))) {
    throw new Error("百家号动态正文写入失败");
  }
  if (images.length) {
    runtime.report({
      status: "uploading",
      stage: 1,
      progress: 35,
      message: `上传百家号动态图片 ${images.length} 张`,
    });
    const uploadRegion = '.cheetah-form-item:has(label[title="上传图片"])';
    const imageWrapper = `${uploadRegion} [class*="-wrap"][style*="background-image"]`;
    const cleared = await executeInPage(tabId, async ({ imageWrapper }) => {
      for (const wrapper of Array.from(document.querySelectorAll(imageWrapper))) {
        wrapper.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        const remove = wrapper.querySelector('[class*="-remove"]') as HTMLElement | null;
        if (!remove) continue;
        Object.assign(remove.style, {
          display: "block",
          opacity: "1",
          pointerEvents: "auto",
          visibility: "visible",
        });
        remove.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
        remove.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
        remove.click();
      }
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (!document.querySelector(imageWrapper)) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    }, { imageWrapper }, 6_000);
    if (!cleared) throw new Error("百家号动态旧图片清理失败");
    const opened = await executeInPage(tabId, async ({ uploadRegion }) => {
      const tile = document.querySelector(
        `${uploadRegion} .cheetah-form-item-control-input-content [class*="-wrap"][class*="-empty"]`,
      );
      if (!(tile instanceof HTMLElement)) return false;
      tile.click();
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (document.querySelector('input[type="file"][multiple]')) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    }, { uploadRegion }, 12_000);
    if (!opened) throw new Error("未找到百家号动态图片上传区域");
    if (!(await setInputFiles(tabId, 'input[type="file"][multiple]', images))) {
      throw new Error("百家号动态图片没有进入上传控件");
    }
    await waitForEnabledButton(tabId, ["确认"], 180_000);
    if (!(await clickText(tabId, "确认", { selector: "button", exact: true, timeoutMs: 10_000 }))) {
      throw new Error("百家号动态图片没有完成插入");
    }
    const accepted = await executeInPage(tabId, async ({ imageWrapper, expected }) => {
      const deadline = Date.now() + 180_000;
      let failureSince = 0;
      while (Date.now() < deadline) {
        const text = document.body?.innerText ?? "";
        if (document.querySelectorAll(imageWrapper).length >= expected) return true;
        if (/上传失败|图片上传失败/.test(text)) {
          failureSince ||= Date.now();
          if (Date.now() - failureSince >= 15_000) return false;
        } else {
          failureSince = 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return false;
    }, { imageWrapper, expected: images.length }, 185_000);
    if (!accepted) throw new Error("百家号动态图片上传未完成");
  }
  runtime.report({ message: "百家号动态已填好，请核对后手动发布" });
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

async function publishVideo(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const video = (await runtime.loadMedia(mediaOfKind(runtime, "video")))[0];
  if (!video) throw new Error("百家号视频稿需要视频素材");
  const tabId = await runtime.open(VIDEO_URL, true);
  const videoInput = 'input[type="file"][accept*=".mp4"]';
  await waitForSelector(tabId, videoInput, {
    visible: false,
    timeoutMs: 60_000,
  });
  runtime.report({ status: "uploading", stage: 1, progress: 25, message: "上传百家号视频" });
  if (!(await setInputFiles(tabId, videoInput, [video]))) {
    throw new Error("百家号视频没有进入上传控件");
  }
  const descriptionEditor = '[class*="contentEditable"]';
  await waitForSelector(tabId, descriptionEditor, {
    visible: true,
    timeoutMs: 15 * 60_000,
  });
  await waitForUploadIdle(tabId, 15 * 60_000);
  const title = fitBaijiaVideoTitle(runtime.job.snapshot.title);
  if (!(await replaceBaijiaLexicalText(tabId, descriptionEditor, title))) {
    throw new Error("百家号视频标题写入失败");
  }
  await waitForEnabledButton(tabId, "存草稿", 30_000);
  if (!(await clickText(tabId, "存草稿", { selector: "button", exact: true, timeoutMs: 20_000 }))) {
    throw new Error("未找到百家号视频存草稿按钮");
  }
  const saved = await executeInPage(tabId, async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const text = document.body?.innerText ?? "";
      if (/草稿保存成功|保存成功|内容已存入草稿/.test(text)) return "saved";
      if (/保存失败|存入失败|草稿失败/.test(text)) return "failed";
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return "timeout";
  }, [], 65_000);
  if (saved === "failed") throw new Error("百家号视频草稿保存失败");
  if (saved !== "saved") throw new Error("百家号视频草稿保存超时");
  const pageUrl = await runtime.currentUrl(tabId);
  if (!/[?&]article_id=\d+/.test(pageUrl) && !/video/i.test(pageUrl)) {
    throw new Error("百家号视频草稿没有返回可恢复页面");
  }
  runtime.report({ message: "百家号视频已上传，请核对标题、简介与封面后发布" });
  return {
    status: "awaiting_confirm",
    url: pageUrl,
    pageUrl,
    tabId,
    error: null,
  };
}

export async function publishBaijiahao(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const type = runtime.job.snapshot.type;
  if (type === "article") return publishArticle(runtime);
  if (type === "image") return publishEvents(runtime);
  if (type === "video") return publishVideo(runtime);
  if (type === "audio") throw new Error("百家号当前不支持音频发布");
  throw new Error(`百家号不支持的内容类型：${type}`);
}
