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
  sleep,
  waitForChromeDebugPort,
} from "./cdp";

/** 应用数据目录：TASSELLO_DATA_DIR 优先，默认 ~/.local/share/tassello。
 *  cdp 不依赖 @tassello/db（避免把 prisma 拖进浏览器层），故此处镜像 packages/db/src/paths.ts 的同一套解析 */
function resolveDataDir(): string {
  const override = process.env.TASSELLO_DATA_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(/*turbopackIgnore: true*/ os.homedir(), ".local", "share", "tassello");
}

/** 专用 Chrome profile：默认落在应用数据目录下（~/.local/share/tassello/chrome-profile），
 *  不放 ~/Library/Application Support；TASSELLO_CHROME_PROFILE 可直接覆盖 profile 路径 */
export function resolveChromeProfileDir(): string {
  const override = process.env.TASSELLO_CHROME_PROFILE?.trim();
  if (override) return path.resolve(override);
  return path.join(resolveDataDir(), "chrome-profile");
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
let connectingMode: BrowserMode = "headless";
let chromeProc: ChildProcess | null = null;
let activeMode: BrowserMode | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let maintenance = false;
const BROWSER_IDLE_CLOSE_MS = Number(process.env.TASSELLO_BROWSER_IDLE_CLOSE_MS ?? 5000);

/** 模式租约：正在执行的 page 和等待人工确认的 visible 批次都会计数。
 *  计数未归零前，相反模式的 acquire 必须等待，绝不能 shutdown 浏览器。 */
const modeLeases: Record<BrowserMode, number> = { headless: 0, visible: 0 };
let acquireQueue: Promise<unknown> = Promise.resolve();

export type BrowserMode = "headless" | "visible";

/** 取共享浏览器连接：已有调试端口就复用，否则拉起。
 *  acquire 会占用一个模式租约；调用方完成后必须 releaseBrowser。 */
export async function acquireConnection(mode: BrowserMode): Promise<CdpConnection> {
  if (maintenance) throw new Error("浏览器正在维护，请稍后重试");
  const acquire = acquireQueue.catch(() => {}).then(async () => {
    if (maintenance) throw new Error("浏览器正在维护，请稍后重试");

    for (;;) {
      if (activeMode && activeMode !== mode && modeLeases[activeMode] > 0) {
        await sleep(100);
        continue;
      }

      if (conn && activeMode === mode) {
        modeLeases[mode] += 1;
        return conn;
      }

      if (connecting && connectingMode === mode) {
        const c = await connecting;
        modeLeases[mode] += 1;
        return c;
      }

      shutdownBrowser();
      connectingMode = mode;
      activeMode = mode;
      connecting = (async () => {
        const profileDir = resolveChromeProfileDir();
        fs.mkdirSync(profileDir, { recursive: true });
        let port = await findExistingChromeDebugPort({ profileDir });
        if (!port) {
          port = await getFreePort();
          chromeProc = await launchChrome({ chromePath: findChrome(), profileDir, port, headless: mode === "headless" });
        }
        const wsUrl = await waitForChromeDebugPort(port, 15_000);
        const c = await CdpConnection.connect(wsUrl, 15_000);
        conn = c;
        return c;
      })();
      try {
        const c = await connecting;
        modeLeases[mode] += 1;
        return c;
      } catch (e) {
        connecting = null;
        activeMode = null;
        throw e;
      }
    }
  });
  acquireQueue = acquire.catch(() => {});
  return acquire;
}

function cancelIdleClose(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleClose(): void {
  if (maintenance || modeLeases.headless > 0 || modeLeases.visible > 0) return;
  cancelIdleClose();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!maintenance && modeLeases.headless === 0 && modeLeases.visible === 0) shutdownBrowser();
  }, Math.max(0, BROWSER_IDLE_CLOSE_MS));
  // Bun/Node 定时器不该阻止桌面应用退出；真正关闭由 Runtime 或进程生命周期兜底。
  idleTimer.unref?.();
}

/** 导入 profile 是维护操作：先拿到 maintenance，才能安全关闭/替换专用 profile。 */
export function beginBrowserMaintenance(): boolean {
  if (modeLeases.headless > 0 || modeLeases.visible > 0) return false;
  maintenance = true;
  cancelIdleClose();
  return true;
}

export function endBrowserMaintenance(): void {
  maintenance = false;
  scheduleIdleClose();
}

/** visible 人工确认批次在 adapter 返回后仍要继续持有浏览器。 */
export function retainBrowser(mode: BrowserMode): void {
  if (activeMode === mode) modeLeases[mode] += 1;
}

export function releaseBrowser(mode: BrowserMode): void {
  modeLeases[mode] = Math.max(0, modeLeases[mode] - 1);
  scheduleIdleClose();
}

/** 导入 profile 前必须阻断：visible 人工批次 / 登录页租约存在时不能杀应用 Chrome。 */
export function hasBrowserLease(): boolean {
  return modeLeases.headless > 0 || modeLeases.visible > 0;
}

/** 包住一个领域动作：外层租约跨过多次 page 调用；可见人工批次可在 fn 内再 retain。 */
export async function withBrowserLease<T>(
  mode: BrowserMode,
  fn: (cdp: CdpConnection) => Promise<T>,
): Promise<T> {
  const cdp = await acquireConnection(mode);
  try {
    return await fn(cdp);
  } finally {
    releaseBrowser(mode);
  }
}

/** 关停本应用的浏览器实例（连接断开 + 进程结束），profile 即可被安全替换 */
export function shutdownBrowser(): void {
  cancelIdleClose();
  try {
    conn?.close();
  } catch {}
  conn = null;
  connecting = null;
  activeMode = null;
  if (chromeProc) {
    try {
      chromeProc.kill("SIGTERM");
    } catch {}
    chromeProc = null;
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
  /** 浏览器运行模式：headless（校验/获取）| visible（发布人工确认），默认 visible */
  mode?: BrowserMode;
};

/** 按平台互斥执行一次页面任务：同平台排队，跨平台并行（各开各的标签页） */
export async function withPage<T>(
  platformId: string,
  opts: PageRunOptions,
  fn: (cdp: CdpConnection, sessionId: string) => Promise<T>,
): Promise<T> {
  const mode = opts.mode ?? "headless";
  const prev = locks.get(platformId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const cdp = await acquireConnection(mode);
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
      releaseBrowser(mode);
    }
  });
  locks.set(
    platformId,
    run.catch(() => {}),
  );
  return run;
}
