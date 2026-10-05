/* browser-runtime —— 发布批次唯一的可见性决策点。
 * adapter 只声明“产物是否可持久化”，不声明 Chrome 是否可见；
 * 只要批次里有一个 state-only 平台，本次全部 visible，且等待人工收尾期间不许切模式。 */
import type { BrowserMode } from "@tassello/cdp";
import { releaseBrowser, retainBrowser } from "@tassello/cdp";
import { getAdapter, publishPersistenceFor } from "@tassello/platform-core";
import type { ContentType } from "@tassello/shared";

const taskModes = new Map<string, BrowserMode>();

export function resolvePublishBatchMode(postType: ContentType, platformIds: string[]): BrowserMode {
  return platformIds.some((id) => {
    const meta = getAdapter(id)?.meta;
    return !!meta && publishPersistenceFor(meta, postType) === "state";
  })
    ? "visible"
    : "headless";
}

export function setTaskBrowserMode(taskId: string, mode: BrowserMode): void {
  taskModes.set(taskId, mode);
}

export function forgetTaskBrowserMode(taskId: string): void {
  taskModes.delete(taskId);
}

/** 重试/进程内恢复使用；没有批次上下文时按当前稿子类型和平台能力兜底。 */
export function taskBrowserMode(taskId: string, platformId: string, postType: ContentType): BrowserMode {
  const meta = getAdapter(platformId)?.meta;
  return taskModes.get(taskId) ?? (meta && publishPersistenceFor(meta, postType) === "state" ? "visible" : "headless");
}

let loginLeasePlatformId: string | null = null;

/** 打开人工登录页后保留 visible Chrome；下一次同平台 verify 前显式释放。 */
export function retainLoginBrowser(platformId: string): void {
  retainBrowser("visible");
  loginLeasePlatformId = platformId;
}

export function releaseLoginBrowser(platformId: string): void {
  if (loginLeasePlatformId !== platformId) return;
  loginLeasePlatformId = null;
  releaseBrowser("visible");
}
