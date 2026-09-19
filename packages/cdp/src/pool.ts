/* pool —— 浏览器会话池：共享 Chrome profile，按平台互斥占用 page session */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import {
  CdpConnection,
  findChromeExecutable,
  findExistingChromeDebugPort,
  getFreePort,
  launchChrome,
  openPageSession,
  waitForChromeDebugPort,
} from "./cdp";

/** 专用 Chrome profile（生产位置；TASSELLO_CHROME_PROFILE 可覆盖） */
export function resolveChromeProfileDir(): string {
  return (
    process.env.TASSELLO_CHROME_PROFILE ??
    path.join(/*turbopackIgnore: true*/ os.homedir(), "Library", "Application Support", "tassello", "chrome-profile")
  );
}

function findChrome(): string {
  const found = findChromeExecutable({
    candidates: {
      darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
      win32: ["C:/Program Files/Google/Chrome/Application/chrome.exe"],
      default: ["/usr/bin/google-chrome"],
    },
  });
  if (!found) throw new Error("Chrome not found; set CHROME_PATH? (findChromeExecutable env override)");
  return found;
}

let conn: CdpConnection | null = null;
let connecting: Promise<CdpConnection> | null = null;
let chromeProc: ChildProcess | null = null;

/** 取共享浏览器连接：已有调试端口就复用，否则拉起可见 Chrome（CDP 发布需要真实窗口做人工确认） */
export async function getConnection(): Promise<CdpConnection> {
  if (conn) return conn;
  if (connecting) return connecting;
  connecting = (async () => {
    const profileDir = resolveChromeProfileDir();
    fs.mkdirSync(profileDir, { recursive: true });
    let port = await findExistingChromeDebugPort({ profileDir });
    if (!port) {
      port = await getFreePort();
      chromeProc = await launchChrome({ chromePath: findChrome(), profileDir, port });
    }
    const wsUrl = await waitForChromeDebugPort(port, 15_000);
    const c = await CdpConnection.connect(wsUrl, 15_000);
    conn = c;
    return c;
  })();
  try {
    return await connecting;
  } catch (e) {
    connecting = null;
    throw e;
  }
}

/** 连接坏了（Chrome 被关掉等）就重置，下次 getConnection 重新拉起 */
export function resetConnection(): void {
  try {
    conn?.close();
  } catch {}
  conn = null;
  connecting = null;
}

const locks = new Map<string, Promise<unknown>>();

export type PageRunOptions = {
  url: string;
  /** true = 执行完不关标签页（人工确认场景：留给用户检查点发布） */
  keepOpen?: boolean;
  activate?: boolean;
};

/** 按平台互斥执行一次页面任务：同平台排队，跨平台并行（各开各的标签页） */
export async function withPage<T>(
  platformId: string,
  opts: PageRunOptions,
  fn: (cdp: CdpConnection, sessionId: string) => Promise<T>,
): Promise<T> {
  const prev = locks.get(platformId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const cdp = await getConnection();
    const session = await openPageSession({
      cdp,
      reusing: true,
      url: opts.url,
      matchTarget: () => false,
      enablePage: true,
      enableRuntime: true,
      activateTarget: opts.activate ?? true,
    });
    try {
      return await fn(cdp, session.sessionId);
    } finally {
      if (!opts.keepOpen) {
        await cdp
          .send("Target.closeTarget", { targetId: session.targetId })
          .catch(() => resetConnection());
      }
    }
  });
  locks.set(
    platformId,
    run.catch(() => {}),
  );
  return run;
}
