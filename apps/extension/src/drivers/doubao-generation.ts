import {
  IMAGE_GENERATION_LOGIN_TIMEOUT_MS,
  IMAGE_GENERATION_TIMEOUT_MS,
  type ImageGenerationJob,
  type ImageGenerationJobEvent,
  type ImageGenerationJobResult,
} from "@tassello/shared";
import { generatedImageKey, pickBestResultImages, type ImageCandidate } from "../image-selection";
import {
  clickText,
  executeInPage,
  openTab,
  pageUrl,
} from "../page-runtime";

const CHAT_URL = "https://www.doubao.com/chat/";
const RESULT_IMAGE_CONTENT = '[data-testid="message_image_content"]';
const COMPOSER = 'div.tiptap.ProseMirror[contenteditable="true"]';
const SEND_BUTTON = '[data-testid="chat_input_send_button"]';
const HIGH_RES_MIN_WIDTH = 1500;

export type GenerationReport = (event: ImageGenerationJobEvent["event"]) => void;

export function quotaExhaustedMessage(text: string): string | null {
  if (text.includes("次数用完") || text.includes("免费次数已用完")) {
    return "今日图片生成免费次数已用完";
  }
  if (text.includes("开通豆包专业版") && text.includes("创作额度")) {
    return "免费额度用完，页面提示开通专业版或购买创作额度包";
  }
  if (text.includes("创作额度不足")) return "创作额度不足";
  return null;
}

async function latestResultImages(tabId: number): Promise<ImageCandidate[]> {
  return executeInPage(tabId, (selector) => {
    const containers = document.querySelectorAll(selector);
    const container = containers.item(containers.length - 1);
    if (!container) return [];
    const output: ImageCandidate[] = [];
    container.querySelectorAll("img").forEach((raw: Element, order: number) => {
      const image = raw as HTMLImageElement;
      const src = image.currentSrc || image.getAttribute("src") || "";
      if (!src.startsWith("http") || image.naturalWidth < 200) return;
      output.push({ src, w: image.naturalWidth, h: image.naturalHeight, order });
    });
    return output;
  }, RESULT_IMAGE_CONTENT);
}

async function isBusy(tabId: number): Promise<boolean> {
  const text = await executeInPage(tabId, (selector) => {
    const containers = document.querySelectorAll(selector);
    const container = containers.item(containers.length - 1);
    if (container?.getAttribute("data-finished") === "true") return "";
    const message = container?.closest('[data-testid="message_content"]');
    return (message?.textContent || container?.textContent || "").trim();
  }, RESULT_IMAGE_CONTENT).catch(() => "");
  return /生成中|正在生成|生成图片中/.test(text);
}

async function ensurePage(tabId: number): Promise<void> {
  const url = await pageUrl(tabId);
  if (!url.includes("doubao.com")) throw new Error("豆包生图标签页已离开目标站点");
}

async function ensureLogin(tabId: number): Promise<void> {
  const loggedIn = await executeInPage(tabId, async ({ timeoutMs }) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = Array.from(document.querySelectorAll("button"))
        .some((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0
            && /^用户/.test((button.textContent ?? "").trim());
        });
      if (found) return true;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return false;
  }, { timeoutMs: IMAGE_GENERATION_LOGIN_TIMEOUT_MS }, IMAGE_GENERATION_LOGIN_TIMEOUT_MS + 5_000);
  if (!loggedIn) throw new Error("豆包登录等待超时");
}

async function hasImageSession(tabId: number): Promise<boolean> {
  return executeInPage(tabId, () =>
    Array.from(document.querySelectorAll("button"))
      .some((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
          && (button.textContent ?? "").trim().startsWith("模型");
      })
  );
}

async function ensureImageSession(tabId: number): Promise<void> {
  if (await hasImageSession(tabId)) return;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickText(tabId, "图像生成", { exact: true, timeoutMs: 15_000 });
    for (let poll = 0; poll < 10; poll += 1) {
      if (await hasImageSession(tabId)) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (attempt === 1) {
      await executeInPage(tabId, () => location.assign(location.href)).catch(() => undefined);
    }
  }
  throw new Error("未能进入豆包图像生成会话");
}

async function buttonText(tabId: number, startsWith: string): Promise<string> {
  return executeInPage(tabId, ({ startsWith }) => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((candidate) =>
        (candidate.textContent ?? "").trim().startsWith(startsWith)
        && candidate.getBoundingClientRect().width > 0
        && candidate.getBoundingClientRect().height > 0
      );
    return (button?.textContent ?? "").trim();
  }, { startsWith });
}

async function selectMenuValue(
  tabId: number,
  buttonPrefix: string,
  value: string,
  exact: boolean,
): Promise<void> {
  const current = await buttonText(tabId, buttonPrefix);
  if (exact ? current === value : current.includes(value)) return;
  const opened = await clickText(tabId, buttonPrefix, { exact: false, timeoutMs: 10_000 });
  if (!opened) throw new Error(`未找到豆包「${buttonPrefix}」按钮`);
  const picked = await executeInPage(tabId, async ({ value, exact }) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const candidates = Array.from(document.querySelectorAll(
        '[role="menuitem"], [role="option"], button, [role="button"]',
      )) as HTMLElement[];
      const target = candidates.find((candidate) => {
        const text = (candidate.textContent ?? "").replace(/\s+/g, " ").trim();
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
          && (exact ? text === value : text.includes(value));
      });
      if (target) {
        target.click();
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }, { value, exact }, 12_000);
  if (!picked) throw new Error(`豆包菜单中没有「${value}」`);
  await new Promise((resolve) => setTimeout(resolve, 800));
}

async function writePrompt(
  tabId: number,
  prompt: string,
): Promise<"missing" | "failed" | "written"> {
  return executeInPage(tabId, async ({ selector, prompt }) => {
    const deadline = Date.now() + 15_000;
    let composer: HTMLElement | null = null;
    while (Date.now() < deadline && !composer) {
      composer = Array.from(document.querySelectorAll(selector) as NodeListOf<HTMLElement>)
        .find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }) ?? null;
      if (!composer) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!composer) return "missing";

    composer.scrollIntoView({ block: "center" });
    composer.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    composer.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand("insertText", false, prompt);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const normalizedPrompt = prompt.replace(/[\s\u200B]+/g, "");
    const normalizedText = () => (composer?.textContent ?? "").replace(/[\s\u200B]+/g, "");
    if (normalizedText().includes(normalizedPrompt)) return "written";

    const clearSelection = window.getSelection();
    const clearRange = document.createRange();
    clearRange.selectNodeContents(composer);
    clearSelection?.removeAllRanges();
    clearSelection?.addRange(clearRange);
    document.execCommand("delete");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const transfer = new DataTransfer();
    transfer.setData("text/plain", prompt);
    composer.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    return normalizedText().includes(normalizedPrompt) ? "written" : "failed";
  }, { selector: COMPOSER, prompt }, 18_000);
}

async function sendPrompt(tabId: number, prompt: string): Promise<void> {
  const written = await writePrompt(tabId, prompt);
  if (written === "missing") throw new Error("豆包提示词输入框未出现");
  if (written === "failed") throw new Error("豆包提示词写入后未生效");
  const sent = await executeInPage(tabId, async ({ selector }) => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const button = document.querySelector(selector) as HTMLButtonElement | null;
      if (button && button.getBoundingClientRect().width > 0 && !button.disabled) {
        button.click();
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }, { selector: SEND_BUTTON }, 7_000);
  if (!sent) throw new Error("豆包发送按钮不可用");
}

async function quotaCheck(tabId: number): Promise<void> {
  const text = await executeInPage(tabId, () => document.body?.innerText ?? "").catch(() => "");
  const message = quotaExhaustedMessage(text);
  if (message) throw new Error(`QUOTA_EXHAUSTED: ${message}`);
}

async function generateOne(
  tabId: number,
  job: ImageGenerationJob,
  promptIndex: number,
  seen: Set<string>,
  report: GenerationReport,
): Promise<ImageGenerationJobResult["result"]["outputs"]> {
  const item = job.request.items[promptIndex]!;
  for (const image of await latestResultImages(tabId)) seen.add(generatedImageKey(image.src));

  report({
    status: "generating",
    stage: 2,
    progress: Math.round((promptIndex / job.request.items.length) * 80) + 5,
    completed: promptIndex,
    message: `生成第 ${promptIndex + 1}/${job.request.items.length} 张图片`,
    pageUrl: await pageUrl(tabId),
    tabId,
  });
  await sendPrompt(tabId, item.prompt);
  await new Promise((resolve) => setTimeout(resolve, 4_000));
  await quotaCheck(tabId);

  const deadline = Date.now() + IMAGE_GENERATION_TIMEOUT_MS;
  let newest: ImageCandidate[] = [];
  let stable = 0;
  let signature = "";
  while (Date.now() < deadline) {
    await ensurePage(tabId);
    newest = pickBestResultImages(await latestResultImages(tabId)).filter((image) =>
      !seen.has(generatedImageKey(image.src))
    );
    if (newest.length > 0) {
      const nextSignature = newest
        .map((image) => `${generatedImageKey(image.src)}:${image.w}x${image.h}`)
        .join("|");
      const allHighResolution = newest.every((image) => image.w >= HIGH_RES_MIN_WIDTH);
      stable = allHighResolution && nextSignature === signature ? stable + 1 : 0;
      if (stable >= 2 && !(await isBusy(tabId))) break;
      signature = nextSignature;
    }
    await quotaCheck(tabId);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  const usable = newest.filter((image) => image.w >= HIGH_RES_MIN_WIDTH);
  if (usable.length === 0) {
    throw new Error(`第 ${promptIndex + 1} 张图片等待原图超时`);
  }
  const all = await latestResultImages(tabId);
  for (const image of all) seen.add(generatedImageKey(image.src));
  report({
    status: "downloading",
    stage: 3,
    progress: Math.round(((promptIndex + 1) / job.request.items.length) * 80) + 15,
    completed: promptIndex + 1,
    message: `已取得第 ${promptIndex + 1} 张原图`,
    pageUrl: await pageUrl(tabId),
    tabId,
  });
  return usable.map((image, outputIndex) => ({
    promptIndex,
    outputIndex,
    src: image.src,
    width: image.w,
    height: image.h,
  }));
}

export async function runDoubaoImageGeneration(
  job: ImageGenerationJob,
  report: GenerationReport,
): Promise<ImageGenerationJobResult["result"]> {
  const tabId = await openTab(CHAT_URL, true);
  const outputs: ImageGenerationJobResult["result"]["outputs"] = [];
  try {
    report({
      status: "waiting_login",
      stage: 1,
      progress: 2,
      message: "检查豆包登录状态",
      pageUrl: CHAT_URL,
      tabId,
    });
    await ensureLogin(tabId);
    await ensureImageSession(tabId);
    await selectMenuValue(tabId, "模型", job.request.model, false);

    const seen = new Set<string>();
    for (let index = 0; index < job.request.items.length; index += 1) {
      outputs.push(...await generateOne(tabId, job, index, seen, report));
    }
    return {
      status: "success",
      outputs,
      error: null,
      pageUrl: await pageUrl(tabId),
      tabId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: message.includes("QUOTA_EXHAUSTED") ? "quota_exhausted" : "failed",
      outputs,
      error: message.replace(/^QUOTA_EXHAUSTED:\s*/, ""),
      pageUrl: await pageUrl(tabId).catch(() => null),
      tabId,
    };
  }
}
