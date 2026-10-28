import type { ExtensionJobResult } from "@tassello/shared";
import { plainBody } from "../driver-utils.ts";
import { executeInPage, pasteInto, setControlValue, setInputFiles, waitForSelector, waitForText } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

export async function publishXiaoyuzhou(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const audio = (await runtime.loadMedia(runtime.job.snapshot.media.filter((item) => item.kind === "audio")))[0];
  if (!audio) throw new Error("小宇宙发布需要音频素材");
  const channel = runtime.job.snapshot.targetChannel;
  if (!channel) throw new Error("小宇宙发布需要选择节目");
  const url = `https://podcaster.xiaoyuzhoufm.com/podcast/${encodeURIComponent(channel.id)}/episode/create`;
  const tabId = await runtime.open(url, true);
  await waitForText(tabId, "点击上传", 45_000);
  const opened = await executeInPage(tabId, () => {
    const upload = Array.from(document.querySelectorAll("div[aria-haspopup='dialog']"))
      .find((element) => (element.textContent || "").replace(/\s+/g, "").includes("点击上传播客"));
    const button = upload?.querySelector("button") as HTMLButtonElement | null;
    if (!button) return false;
    button.click();
    return true;
  }, []);
  if (!opened) {
    throw new Error("未找到小宇宙音频上传入口");
  }
  await waitForSelector(tabId, 'input[type="file"][accept*="audio"]', { visible: false, timeoutMs: 30_000 });
  if (!(await setInputFiles(tabId, 'input[type="file"][accept*="audio"]', [audio]))) {
    throw new Error("小宇宙音频没有进入上传控件");
  }
  runtime.report({ status: "uploading", stage: 1, progress: 45, message: "小宇宙音频上传中" });
  const titleSet = await setControlValue(tabId, 'input[placeholder="输入单集标题"]', runtime.job.snapshot.title);
  if (!titleSet) throw new Error("小宇宙单集标题写入失败");
  const body = plainBody(runtime).trim();
  if (body) await pasteInto(tabId, ".tiptap.ProseMirror, .ProseMirror[contenteditable=true]", body);
  await waitForText(tabId, "重新上传", 30 * 60_000).catch(async () => {
    await waitForText(tabId, "音频 ·", 30 * 60_000);
  });
  await executeInPage(tabId, () => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((element) => (element.textContent || "").trim() === "收起") as HTMLButtonElement | undefined;
    button?.click();
  }, []);
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
