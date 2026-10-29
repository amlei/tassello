import type { ContentType, ExtensionJob, PublishMediaRefDTO } from "@tassello/shared";
import { executeInPage, openTab, pageUrl, waitForSelector } from "../src/page-runtime.ts";
import type { LoadedMedia, PublishRuntime } from "../src/publish-runtime.ts";
import { verifyPlatformAccount } from "../src/accounts.ts";
import { publishBaijiahao } from "../src/drivers/baijiahao.ts";
import { publishToutiao } from "../src/drivers/toutiao.ts";

const output = document.querySelector("#output") as HTMLPreElement;

function log(message: string): void {
  output.textContent = `${output.textContent}\n${message}`;
}

async function testImage(): Promise<{ base64: string; hash: string }> {
  const response = await fetch(chrome.runtime.getURL("icons/icon32.png"));
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  return { base64: btoa(binary), hash };
}

async function testVideo(): Promise<{ base64: string; hash: string }> {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("测试视频画布不可用");
  const stream = canvas.captureStream(2);
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) throw new Error("浏览器不支持生成 WebM 测试视频");
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  recorder.start();
  for (let index = 0; index < 4; index += 1) {
    context.fillStyle = index % 2 ? "#F04142" : "#2932E1";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "white";
    context.font = "32px sans-serif";
    context.fillText("Onda", 120, 100);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  recorder.stop();
  await stopped;
  const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return {
    base64: btoa(binary),
    hash: [...digest].map((value) => value.toString(16).padStart(2, "0")).join(""),
  };
}

async function makeRuntime(platformId: "toutiao" | "baijiahao", type: ContentType): Promise<PublishRuntime> {
  const image = await testImage();
  const video = type === "video" ? await testVideo() : null;
  const withImage = type === "article" || type === "image" || type === "audio";
  const media: PublishMediaRefDTO[] = video ? [{
    raw: "test.webm",
    alt: "九漾接入测试视频",
    kind: "video",
    source: "relative",
    resolved: "test.webm",
    order: 0,
    role: "body",
    assetId: null,
    fileName: "test.webm",
  }] : withImage ? [{
    raw: "test.png",
    alt: "九漾接入测试图",
    kind: "image",
    source: "relative",
    resolved: "test.png",
    order: 0,
    role: type === "audio" ? "cover" : "body",
    assetId: null,
    fileName: "test.png",
  }] : [];
  const job: ExtensionJob = {
    jobId: `e2e-${platformId}-${type}`,
    attempt: 1,
    snapshot: {
      documentId: "e2e-document",
      documentPath: "articles/e2e.md",
      title: platformId === "toutiao" && type === "audio" ? "九漾音频接入测试" : "九漾接入自动化测试",
      type,
      markdown: `# 九漾接入自动化测试\n\n这是一篇自动验证草稿，请勿发布。\n\n![测试图](test.png)`,
      bodyHtml: '<p>这是一篇自动验证草稿，请勿发布。</p><figure data-onda-media="0" data-alt="九漾接入测试图"></figure>',
      plainText: "这是一篇自动验证草稿，请勿发布。",
      media,
      cover: type === "audio" ? media[0] ?? null : null,
      contentHash: "e2e-content",
      platformId,
      accountUid: "e2e-account",
      targetChannel: null,
      options: { intent: "draft" },
    },
  };
  return {
    job,
    report(event: unknown) {
      log(`event ${JSON.stringify(event)}`);
    },
    async open(url: string, active = true) {
      return await openTab(url, active);
    },
    async currentUrl(tabId: number) {
      return await pageUrl(tabId);
    },
    async loadMedia(refs: PublishMediaRefDTO[]): Promise<LoadedMedia[]> {
      return refs.map((ref) => {
        const source = ref.kind === "video" ? video : image;
        if (!source) throw new Error(`测试素材缺失：${ref.kind}`);
        return {
          ...ref,
          name: ref.kind === "video" ? "test.webm" : "test.png",
          base64: source.base64,
          mime: ref.kind === "video" ? "video/webm" : "image/png",
          contentHash: source.hash,
        };
      });
    },
    async lookupUpload() {
      return null;
    },
    async saveUpload() {},
    async forgetUpload() {},
    async focus() {},
    async close() {},
    async closeAll() {},
    page() {
      throw new Error("测试页不提供直接求值");
    },
  } as unknown as PublishRuntime;
}

async function run(testCase: string): Promise<void> {
  if (testCase === "inspect-baijiahao-title") {
    const tabId = await openTab("https://baijiahao.baidu.com/builder/rc/edit?type=news", true);
    await waitForSelector(tabId, '[data-testid="news-title-input"] [contenteditable="true"]', {
      visible: true,
      timeoutMs: 60_000,
    });
    const info = await executeInPage(tabId, () => {
      const element = document.querySelector('[data-testid="news-title-input"] [contenteditable="true"]') as HTMLElement & {
        __lexicalEditor?: unknown;
      };
      const editor = element.__lexicalEditor as Record<string, unknown> | undefined;
      const nodes = editor?._nodes;
      const editorState = editor?._editorState as { _nodeMap?: Map<string, unknown> } | undefined;
      const root = editorState?._nodeMap?.get("root") as { getFirstChild?: () => unknown } | undefined;
      const firstChild = root?.getFirstChild?.() as { constructor?: { name?: string } } | undefined;
      return {
        ownKeys: Object.getOwnPropertyNames(element).filter((key) => /lex|react|editor/i.test(key)),
        parentKeys: Object.getOwnPropertyNames(element.parentElement ?? {}).filter((key) => /lex|react|editor/i.test(key)),
        globalKeys: Object.keys(globalThis).filter((key) => /lex|editor/i.test(key)).slice(0, 100),
        editorKeys: editor ? Object.keys(editor).slice(0, 120) : [],
        editorProtoKeys: editor
          ? Object.getOwnPropertyNames(Object.getPrototypeOf(editor)).filter((key) => /update|state|text|root|read|set/i.test(key))
          : [],
        nodeKeys: nodes instanceof Map ? [...nodes.keys()] : [],
        nodeTypes: nodes instanceof Map
          ? [...nodes.entries()].map(([key, value]) => ({
              key,
              type: typeof value,
              constructor: typeof value === "function" ? value.name : null,
              fields: value && typeof value === "object" ? Object.keys(value).slice(0, 12) : [],
            }))
          : [],
        rootChildType: firstChild?.constructor?.name ?? null,
      };
    }, []);
    log(`result ${JSON.stringify(info, null, 2)}`);
    document.body.dataset.state = "passed";
    return;
  }
  if (testCase === "verify-toutiao" || testCase === "verify-baijiahao") {
    const probe = await verifyPlatformAccount(testCase.slice("verify-".length), false);
    log(`result ${JSON.stringify(probe, null, 2)}`);
    document.body.dataset.state = probe.state === "ok" ? "passed" : "failed";
    return;
  }
  const [platformId, type] = testCase.split("-") as ["toutiao" | "baijiahao", ContentType];
  if (!["toutiao", "baijiahao"].includes(platformId) || !["article", "image", "video", "audio"].includes(type)) {
    throw new Error(`未知测试用例：${testCase}`);
  }
  output.textContent = `开始 ${testCase}`;
  const runtime = await makeRuntime(platformId, type);
  const result = platformId === "toutiao"
    ? await publishToutiao(runtime)
    : await publishBaijiahao(runtime);
  log(`result ${JSON.stringify(result, null, 2)}`);
  document.body.dataset.state = "passed";
}

for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-case]"))) {
  button.addEventListener("click", async () => {
    for (const item of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-case]"))) item.disabled = true;
    try {
      await run(button.dataset.case ?? "");
    } catch (error) {
      log(`error ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      document.body.dataset.state = "failed";
    }
  });
}

const requested = new URLSearchParams(location.search).get("case");
if (requested) {
  const button = document.querySelector<HTMLButtonElement>(`[data-case="${CSS.escape(requested)}"]`);
  button?.click();
}
