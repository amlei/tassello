/* profile —— 重新获取账号的底层动作：用日常浏览器的登录态覆盖应用专用 profile。
   应用的登录信息本就取自日常浏览器（见 docs/platforms.md 迁移验证），Cookie 失效后
   重新覆盖复制才是有效解；逐个平台重新扫码没有意义。 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getDefaultChromeUserDataDirs, resolveChromeProfileDir, resetConnection } from "@tassello/cdp";
import { IMPORT_BROWSERS, type ImportBrowserDTO, type ImportBrowserId } from "@tassello/shared";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 候选浏览器的 user-data 目录（按平台解析；Edge 是 Chromium，目录规律与 Chrome 一致） */
function browserUserDataDir(browser: ImportBrowserId): string {
  const home = os.homedir();
  if (browser === "edge") {
    if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Microsoft Edge");
    if (process.platform === "win32") {
      return path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Microsoft Edge", "User Data");
    }
    return path.join(home, ".config", "microsoft-edge");
  }
  return getDefaultChromeUserDataDirs()[0]!;
}

/** 登录信息源头：日常浏览器的 Default profile。多 profile 用户用 TASSELLO_SOURCE_CHROME_PROFILE 指定；
 *  否则按设置里的 importBrowser 选 Chrome / Edge */
function sourceProfileDir(browser: ImportBrowserId): string {
  if (process.env.TASSELLO_SOURCE_CHROME_PROFILE) {
    return path.resolve(process.env.TASSELLO_SOURCE_CHROME_PROFILE);
  }
  return path.join(browserUserDataDir(browser), "Default");
}

/** 设置里的浏览器选择：报告各候选浏览器的检测状态（profile 目录存在即认为可用） */
export function listImportBrowsers(): ImportBrowserDTO[] {
  return IMPORT_BROWSERS.map((b) => ({
    ...b,
    detected: fs.existsSync(sourceProfileDir(b.id)),
  }));
}

/** 应用专用 profile（CDP 发布用的那个）里跑着的 Chrome 必须先停：
 *  Cookie 是 SQLite 文件锁着的，且 Chrome 退出时会回写，覆盖结果会被冲掉 */
async function stopAppChrome(): Promise<void> {
  resetConnection();
  spawnSync("pkill", ["-f", `--user-data-dir=${resolveChromeProfileDir()}`]);
  // 等进程真正退出、文件锁释放
  for (let i = 0; i < 10; i += 1) {
    const alive = spawnSync("pgrep", ["-f", `--user-data-dir=${resolveChromeProfileDir()}`]);
    if (alive.status !== 0) return;
    await sleep(200);
  }
}

/** 拷贝 Default/ 时跳过的体积/状态目录（缓存可重建，且与登录态无关） */
const COPY_SKIP_DIRS = new Set([
  "Cache", "Code Cache", "GPUCache", "GrShaderCache", "ShaderCache",
  "Service Worker", "CrashpadMetrics", "CrashpadReports",
]);

/** 用日常浏览器的 Default profile 覆盖应用专用 profile 的登录态文件。
 *
 *  2026-10-03 改为「整目录拷贝（排除缓存）」：原先只挑 Cookies/Local Storage/Session Storage
 *  的选择性拷贝在即刻上暴露了两个问题——
 *  ① Local Storage 是 leveldb，**日常 Chrome 运行中**选择性读取容易拿到不完整状态
 *     （LOCK/未 compaction 的 .log），token 类登录态（如即刻 JK_ACCESS_TOKEN）会整段丢失；
 *  ② 平台各有各的登录态载体（cookie / localStorage / IndexedDB…），逐项挑文件等于把
 *     「平台清单」硬编码进导入逻辑，新增平台就要改这里。
 *  整目录拷贝与 docs/platforms.md §3 的探针验证方式一致，以源目录为准、不再维护白名单。
 *  返回复制了的顶层条目清单；源不存在/没有 Cookies 时抛错（调用方走人工登录兜底） */
export async function refreshAppProfileFromDefault(browser: ImportBrowserId): Promise<{ copied: string[] }> {
  const src = sourceProfileDir(browser);
  if (!fs.existsSync(src)) {
    throw new Error(`日常浏览器的 profile 不存在：${src}`);
  }
  const dstRoot = resolveChromeProfileDir();
  const dstProfile = path.join(dstRoot, "Default");
  fs.mkdirSync(dstProfile, { recursive: true });

  await stopAppChrome();

  const copied: string[] = [];
  // Local State：os_crypt 的密钥绑定（macOS 走 Keychain，同机同用户可解）
  const localState = path.join(path.dirname(src), "Local State");
  if (fs.existsSync(localState)) {
    fs.copyFileSync(localState, path.join(dstRoot, "Local State"));
    copied.push("Local State");
  }
  // Default/ 整目录覆盖（排除缓存目录），cookies/localStorage/IndexedDB 等登录态全量随行
  fs.cpSync(src, dstProfile, {
    recursive: true,
    force: true,
    filter: (from) => {
      const rel = path.relative(src, from);
      const top = rel.split(path.sep)[0] ?? "";
      return !COPY_SKIP_DIRS.has(top);
    },
  });
  for (const name of fs.readdirSync(dstProfile)) {
    if (!COPY_SKIP_DIRS.has(name)) copied.push(name);
  }

  if (!fs.existsSync(path.join(dstProfile, "Network", "Cookies")) && !fs.existsSync(path.join(dstProfile, "Cookies"))) {
    throw new Error("日常浏览器的 profile 里没有可复制的 Cookies");
  }
  return { copied };
}

/** 检测日常浏览器是否正在运行（profile 被 leveldb/SQLite 锁着的唯一信号）。
 *  运行中导入会拿到不完整的登录态（即刻的 localStorage token 实测就是这么丢的），
 *  所以导入前必须拦截，让用户退出浏览器后重试——不做带锁拷贝的回退，保证执行确定 */
export function sourceBrowserRunning(browser: ImportBrowserId): boolean {
  const find = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
  if (process.platform === "win32") {
    const exe = browser === "edge" ? "msedge.exe" : "chrome.exe";
    // tasklist 找不到进程时输出「信息: 没有运行的任务…」，有进程时 CSV 行里带 exe 名
    const out = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${exe}`, "/FO", "csv"], { encoding: "utf8" }).stdout ?? "";
    return out.includes(exe);
  }
  // macOS / Linux：主进程名（macOS 的 Helper 子进程同名校不准，-x 精确匹配主程序名即可）
  const names = browser === "edge"
    ? (process.platform === "darwin" ? ["Microsoft Edge"] : ["msedge", "microsoft-edge"])
    : (process.platform === "darwin" ? ["Google Chrome"] : ["chrome", "google-chrome"]);
  return names.some((n) => find("pgrep", ["-x", n]));
}

/** 导入登录态用的入口：把结果折叠成 {ok, message}，失败原因直接给 UI 展示 */
export async function syncBrowserProfile(browser: ImportBrowserId): Promise<{ ok: boolean; message?: string; code?: "browser_running" }> {
  try {
    // 日常浏览器运行中 → 直接阻断，让用户退出后重试；不带锁拷贝，保证导入要么完整要么不发生
    if (sourceBrowserRunning(browser)) {
      const b = IMPORT_BROWSERS.find((x) => x.id === browser);
      return { ok: false, code: "browser_running", message: `${b?.name ?? "日常浏览器"}正在运行，无法导入` };
    }
    const { copied } = await refreshAppProfileFromDefault(browser);
    return { ok: true, message: copied.join("、") };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
