import type { ExtensionJobResult } from "@tassello/shared";
import { setInputFiles, waitForText } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

export async function publishLizhi(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const audio = (await runtime.loadMedia(runtime.job.snapshot.media.filter((item) => item.kind === "audio")))[0];
  if (!audio) throw new Error("荔枝播客发布需要音频素材");
  const channel = runtime.job.snapshot.targetChannel;
  if (!channel) throw new Error("荔枝播客发布需要选择播单");
  const url = "https://nj.lizhi.fm/static/newsite/#/content/batchToSheet";
  const tabId = await runtime.open(url, true);
  await waitForText(tabId, "上传声音", 45_000).catch(() => undefined);
  if (!(await setInputFiles(tabId, 'input[type="file"]', [audio]))) {
    throw new Error("荔枝音频没有进入上传控件");
  }
  runtime.report({ status: "uploading", stage: 1, progress: 70, message: `音频已交给荔枝上传向导（目标播单：${channel.name}）` });
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
