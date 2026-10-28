import type { ExtensionJobResult } from "@tassello/shared";
import { plainBody } from "../driver-utils.ts";
import { executeInPage, setControlValue, setFrameEditableText, setInputFiles, waitForSelector, waitForUploadIdle } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

const UPLOAD_URL = "https://www.ximalaya.com/reform-upload/page/webCenter/upload";

export function albumMatchLabels(album: string): string[] {
  const expected = album.replace(/\s+/g, "");
  return [expected, `${expected}公开`, `${expected}私密`];
}

export async function publishXimalaya(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const audio = (await runtime.loadMedia(runtime.job.snapshot.media.filter((item) => item.kind === "audio")))[0];
  if (!audio) throw new Error("喜马拉雅只支持音频发布");
  const tabId = await runtime.open(UPLOAD_URL, true);
  await waitForSelector(tabId, 'input[type="file"]', { visible: false, timeoutMs: 60_000 });
  if (!(await setInputFiles(tabId, 'input[type="file"]', [audio]))) {
    throw new Error("喜马拉雅音频没有进入上传控件");
  }
  runtime.report({ status: "uploading", stage: 1, progress: 45, message: "喜马拉雅音频上传中" });
  await waitForSelector(tabId, 'input[placeholder="请输入声音标题"]', { visible: true, timeoutMs: 180_000 });
  await setControlValue(tabId, 'input[placeholder="请输入声音标题"]', runtime.job.snapshot.title);
  const body = plainBody(runtime).trim();
  if (body && !(await setFrameEditableText(tabId, "body.ke-content", body))) {
    throw new Error("喜马拉雅节目简介写入失败");
  }
  const album = runtime.job.snapshot.targetChannel?.name;
  if (album) {
    const labels = albumMatchLabels(album);
    const changed = await executeInPage(tabId, async ({ album, labels }) => {
      const button = Array.from(document.querySelectorAll("button"))
        .find((candidate) => /search-select-album-btn/.test(String(candidate.className))) as HTMLButtonElement | undefined;
      const current = button?.textContent?.trim() ?? "";
      if (current === album) return true;
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const expected = album.replace(/\s+/g, "");
      const target = Array.from(document.querySelectorAll("[class*=scroll-item]"))
        .find((element) => {
          const text = (element.textContent || "").replace(/\s+/g, "");
          return labels.includes(text)
            && (element as HTMLElement).offsetParent !== null;
        }) as HTMLElement | undefined;
      if (!target) return false;
      target.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return (button.textContent || "").replace(/\s+/g, "") === expected;
    }, { album, labels });
    if (!changed) throw new Error(`未能选择喜马拉雅专辑：${album}`);
  }
  await waitForUploadIdle(tabId, 30 * 60_000);
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
