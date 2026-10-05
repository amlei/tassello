/* platform-runtime —— 把 web 端 shared Chrome pool 注入平台 adapter */
import { withPage } from "@tassello/cdp";
import type { BrowserMode } from "@tassello/cdp";
import type { AdapterCtx, CdpLike } from "@tassello/platform-core";
import { platformAssetStore } from "./platform-assets";
import { fileSecretBox } from "./secrets";

/** Runtime 是唯一浏览器模式决策者；adapter 只描述页面动作，不选择可见性。 */
export function serverAdapterContext(
  platformId: string,
  log: (event: string, payload?: unknown) => void,
  mode: BrowserMode = "headless",
): AdapterCtx {
  return {
    secrets: fileSecretBox,
    assets: platformAssetStore(platformId),
    log,
    runPage: <T>(
      _platformId: string,
      options: Parameters<AdapterCtx["runPage"]>[1],
      handler: (cdp: CdpLike, sessionId: string) => Promise<T>,
    ) => withPage<T>(platformId, { ...options, mode }, handler),
  };
}
