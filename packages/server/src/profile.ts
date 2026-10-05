/* profile —— 重新获取账号的底层动作：用日常浏览器的登录态覆盖应用专用 profile。
   应用的登录信息本就取自日常浏览器（见 docs/platforms.md 迁移验证），Cookie 失效后
   重新覆盖复制才是有效解；逐个平台重新扫码没有意义。 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { getDefaultChromeUserDataDirs, beginBrowserMaintenance, endBrowserMaintenance, hasBrowserLease, resolveChromeProfileDir, shutdownBrowser } from "@tassello/cdp";
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

type BrowserProcess = { pid: number; commandLine: string };

function normalizeCommandLine(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function isChildChromeProcess(commandLine: string): boolean {
  return /(^|\s)--type=/.test(normalizeCommandLine(commandLine));
}

function isAppOwnedChromeProcess(commandLine: string): boolean {
  return normalizeCommandLine(commandLine).includes(normalizeCommandLine(resolveChromeProfileDir()));
}

function matchesImportBrowser(commandLine: string, browser: ImportBrowserId): boolean {
  const value = normalizeCommandLine(commandLine);
  if (browser === "edge") {
    return value.includes("microsoft edge") || value.includes("msedge.exe") || value.includes("/microsoft edge");
  }
  return value.includes("google chrome") || value.includes("chrome.exe") || value.includes("google-chrome");
}

async function listBrowserProcesses(): Promise<BrowserProcess[]> {
  if (process.platform === "win32") {
    const script = [
      "$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8;",
      "Get-CimInstance -Query \"SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name='chrome.exe' OR Name='msedge.exe'\" |",
      "Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
    ].join(" ");
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `PowerShell exited ${code}`)));
    });
    if (!output.trim()) return [];
    type RawProcess = { ProcessId?: number | string; CommandLine?: string | null };
    const parsed = JSON.parse(output) as RawProcess[] | RawProcess;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.flatMap((item) => {
      const pid = Number(item.ProcessId);
      return Number.isSafeInteger(pid) && pid > 0 && typeof item.CommandLine === "string"
        ? [{ pid, commandLine: item.CommandLine }]
        : [];
    });
  }

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("ps", process.platform === "darwin" ? ["-axo", "pid=", "-o", "command="] : ["-axo", "pid=", "-o", "args="], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `ps exited ${code}`)));
  });
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    return match ? [{ pid: Number(match[1]), commandLine: match[2]! }] : [];
  });
}

function isMainBrowserProcess(process: BrowserProcess): boolean {
  return !isChildChromeProcess(process.commandLine);
}

async function terminateProcess(pid: number, forceAfterMs = 3000): Promise<void> {
  try { process.kill(pid, "SIGTERM"); } catch { return; }
  const deadline = Date.now() + forceAfterMs;
  for (;;) {
    await sleep(150);
    try { process.kill(pid, 0); } catch { return; }
    if (Date.now() >= deadline) {
      try { process.kill(pid, "SIGKILL"); } catch {}
      return;
    }
  }
}

/** 只结束 Tassello 专用 Chrome；绝不按进程名误伤用户日常 Chrome。 */
async function stopDedicatedChromeProcesses(): Promise<void> {
  shutdownBrowser();
  const processes = (await listBrowserProcesses()).filter((p) =>
    isMainBrowserProcess(p) && isAppOwnedChromeProcess(p.commandLine),
  );
  await Promise.all(processes.map((p) => terminateProcess(p.pid)));
  // 给 SQLite/LevelDB 一点句柄释放时间。
  if (processes.length) await sleep(200);
}

/** 只判断用户选择的日常浏览器主进程；专用 profile 和 Helper 子进程不算。 */
async function sourceBrowserRunning(browser: ImportBrowserId): Promise<boolean> {
  const processes = await listBrowserProcesses();
  return processes.some((p) => isMainBrowserProcess(p) && matchesImportBrowser(p.commandLine, browser) && !isAppOwnedChromeProcess(p.commandLine));
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

  await stopDedicatedChromeProcesses();

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

/** 导入登录态用的入口：把结果折叠成 {ok, message}，失败原因直接给 UI 展示 */
export async function syncBrowserProfile(
  browser: ImportBrowserId,
  options: { keepMaintenance?: boolean } = {},
): Promise<{ ok: boolean; message?: string; code?: "browser_running" }> {
  let maintenanceHeld = false;
  if (!beginBrowserMaintenance()) {
    return { ok: false, code: "browser_running", message: "应用浏览器还有登录页或人工发布批次未完成，无法导入" };
  }
  maintenanceHeld = true;
  try {
    // 先只关闭 Tassello 专用 Chrome；这不会影响用户日常 Chrome。
    await stopDedicatedChromeProcesses();
    // 再检查用户日常浏览器；它运行中时仍必须阻断，禁止绕过锁强行复制。
    if (await sourceBrowserRunning(browser)) {
      endBrowserMaintenance();
      maintenanceHeld = false;
      const b = IMPORT_BROWSERS.find((x) => x.id === browser);
      return { ok: false, code: "browser_running", message: `${b?.name ?? "日常浏览器"}正在运行，无法导入` };
    }
    const { copied } = await refreshAppProfileFromDefault(browser);
    // 调用方要用 maintenance 串住导入后的批量 verify；失败/提前返回时必须释放。
    if (!options.keepMaintenance) {
      endBrowserMaintenance();
      maintenanceHeld = false;
    }
    return { ok: true, message: copied.join("、") };
  } catch (e) {
    if (maintenanceHeld) endBrowserMaintenance();
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
