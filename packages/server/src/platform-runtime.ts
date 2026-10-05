/* platform-runtime —— 把 web 端 shared Chrome pool 注入平台 adapter */
import { withPage } from "@tassello/cdp";
import type { AdapterCtx, CdpLike } from "@tassello/platform-core";
import { fileSecretBox } from "./secrets";

export function serverAdapterContext(
  log: (event: string, payload?: unknown) => void,
): AdapterCtx {
  return {
    secrets: fileSecretBox,
    log,
    runPage: <T>(
      platformId: string,
      options: Parameters<AdapterCtx["runPage"]>[1],
      handler: (cdp: CdpLike, sessionId: string) => Promise<T>,
    ) => withPage<T>(platformId, options, handler),
  };
}
