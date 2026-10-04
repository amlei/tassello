/* 探针共用库：连接本任务专用的隔离 Chrome（端口 9341，独立 profile），不碰共享 CDP 池 */
import { CdpConnection, openPageSession, waitForChromeDebugPort } from "@tassello/cdp";

export const PROBE_PORT = 9341;
export const JIKE_HOME = "https://web.okjike.com/";

export async function connectProbe(): Promise<CdpConnection> {
  const wsUrl = await waitForChromeDebugPort(PROBE_PORT, 10_000);
  return CdpConnection.connect(wsUrl, 10_000);
}

/** 打开（或复用）一个 web.okjike.com 标签页并附上 session */
export async function openJikeTab(cdp: CdpConnection, url = JIKE_HOME) {
  return openPageSession({
    cdp,
    reusing: false,
    url,
    matchTarget: () => false,
    enablePage: true,
    enableRuntime: true,
    activateTarget: false,
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
