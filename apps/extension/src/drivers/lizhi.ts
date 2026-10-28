import type { ExtensionJobResult } from "@tassello/shared";
import { executeInPage, setControlValue, setInputFiles, waitForSelector, waitForText } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

export async function publishLizhi(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const audioItems = runtime.job.snapshot.media.filter((item) => item.kind === "audio");
  if (audioItems.length > 1) throw new Error("荔枝播客当前只支持上传单个声音");
  const audio = (await runtime.loadMedia(audioItems))[0];
  if (!audio) throw new Error("荔枝播客发布需要音频素材");
  const channel = runtime.job.snapshot.targetChannel;
  if (!channel) throw new Error("荔枝播客发布需要选择播单");
  const url = "https://nj.lizhi.fm/static/newsite/#/content/batchToSheet";
  const tabId = await runtime.open(url, true);
  await waitForText(tabId, "上传声音", 45_000).catch(() => undefined);
  if (!(await setInputFiles(tabId, 'input[type="file"]', [audio]))) {
    throw new Error("荔枝音频没有进入上传控件");
  }
  await waitForSelector(tabId, 'textarea[id^="name_"]', { visible: true, timeoutMs: 120_000 });
  if (!(await setControlValue(tabId, 'textarea[id^="name_"]', runtime.job.snapshot.title))) {
    throw new Error("荔枝声音标题写入失败");
  }
  const playlistSelected = await executeInPage(tabId, async ({ channelName }) => {
    const selector = document.querySelector(".lz-select-selector") as HTMLElement | null;
    if (!selector) return false;
    for (const type of ["mousedown", "mouseup", "click"]) {
      selector.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    }
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const option = Array.from(document.querySelectorAll(".lz-select-item-option"))
        .find((element) => (element.textContent || "").includes(channelName)) as HTMLElement | undefined;
      if (option) {
        for (const type of ["mousedown", "mouseup", "click"]) {
          option.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
        }
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }, { channelName: channel.name });
  if (!playlistSelected) throw new Error(`未能选择荔枝播单：${channel.name}`);
  runtime.report({ status: "uploading", stage: 1, progress: 70, message: `单个声音已加入荔枝上传向导（目标播单：${channel.name}）` });
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
