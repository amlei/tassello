import type { ExtensionJobResult } from "@tassello/shared";
import { plainBody } from "../driver-utils.ts";
import { clickText, executeInPage, setControlValue, setInputFiles, waitForSelector } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

const UPLOAD_URL = "https://admin.qingting.fm/content/upload_program";

export async function publishQingting(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const audioItems = runtime.job.snapshot.media.filter((item) => item.kind === "audio");
  if (audioItems.length > 1) throw new Error("蜻蜓 FM 当前只支持上传单个音频");
  const audio = (await runtime.loadMedia(audioItems))[0];
  if (!audio) throw new Error("蜻蜓 FM 发布需要音频素材");
  const channel = runtime.job.snapshot.targetChannel;
  if (!channel) throw new Error("蜻蜓 FM 发布需要选择专辑");
  const tabId = await runtime.open(`${UPLOAD_URL}?channel_id=${encodeURIComponent(channel.id)}`, true);
  await waitForSelector(tabId, 'input[type="file"][accept*="mp3" i], input[type="file"][accept*="m4a" i]', {
    visible: false,
    timeoutMs: 60_000,
  });
  if (!(await setInputFiles(
    tabId,
    'input[type="file"][accept*="mp3" i], input[type="file"][accept*="m4a" i]',
    [audio],
  ))) {
    throw new Error("蜻蜓 FM 音频没有进入上传控件");
  }
  runtime.report({ status: "uploading", stage: 1, progress: 45, message: "蜻蜓 FM 音频上传中" });
  const fileName = audio.fileName || audio.name;
  const uploadState = await executeInPage(tabId, async ({ fileName }) => {
    const base = fileName.replace(/\.[^.]+$/, "");
    const deadline = Date.now() + 15 * 60_000;
    while (Date.now() < deadline) {
      const text = document.body?.innerText ?? "";
      const uploading = /上传中|上传进度|\d+(?:\.\d+)?%/.test(text);
      if (text.includes("节目名称") && text.includes(base) && !uploading) return "ready";
      if (/上传失败|格式不支持/.test(text)) return "failed";
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return "timeout";
  }, { fileName }, 15 * 60_000 + 5_000);
  if (uploadState === "failed") throw new Error("蜻蜓 FM 音频上传失败");
  if (uploadState !== "ready") throw new Error("蜻蜓 FM 音频上传未完成");

  const opened = await executeInPage(tabId, () => {
    const button = Array.from(document.querySelectorAll(".qt-clickable-div"))
      .find((element) => (element as HTMLElement).offsetParent !== null) as HTMLElement | undefined;
    if (!button) return false;
    button.click();
    return true;
  }, []);
  if (!opened) throw new Error("未找到蜻蜓 FM 节目编辑入口");
  await waitForSelector(tabId, 'input[placeholder="请输入节目名"]', { visible: true, timeoutMs: 20_000 });
  if (!(await setControlValue(tabId, 'input[placeholder="请输入节目名"]', runtime.job.snapshot.title))) {
    throw new Error("蜻蜓 FM 节目标题写入失败");
  }
  const body = plainBody(runtime).trim();
  if (body) {
    await setControlValue(tabId, 'textarea[placeholder*="精彩简练"]', body.slice(0, 200)).catch(() => false);
    await setControlValue(tabId, 'textarea[placeholder*="听头条"]', body.slice(0, 50)).catch(() => false);
  }
  if (!(await clickText(tabId, "确 认", { exact: true, timeoutMs: 10_000 }))) {
    throw new Error("蜻蜓 FM 节目信息确认失败");
  }
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
