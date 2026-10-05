import type { CdpLike, PlatformPageRunner } from "@tassello/platform-core";
import { closePage, openPage } from "./cdp";
import type { DefaultChromeManager } from "./default-chrome";

/** 把 Obsidian 的“默认 Chrome 审批连接”注入平台 adapter；
 *  平台包只看到 CdpLike，不感知宿主浏览器生命周期。 */
export function createObsidianPageRunner(browser: DefaultChromeManager): PlatformPageRunner {
  return async <T>(platformId: string, options: Parameters<PlatformPageRunner>[1], handler: (cdp: CdpLike, sessionId: string) => Promise<T>): Promise<T> => {
    void platformId;
    const cdp = await browser.connect();
    const page = await openPage(cdp, options.url, { activate: options.activate ?? true });
    try {
      return await handler(cdp as CdpLike, page.sessionId);
    } finally {
      if (!options.keepOpen) await closePage(cdp, page.targetId);
    }
  };
}
