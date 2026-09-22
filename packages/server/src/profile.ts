/* profile —— 重新获取账号的底层动作：用日常 Chrome 的登录态覆盖应用专用 profile。
   应用的登录信息本就取自日常 Chrome（见 docs/platforms.md 迁移验证），Cookie 失效后
   重新覆盖复制才是有效解；逐个平台重新扫码没有意义。 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getDefaultChromeUserDataDirs, resolveChromeProfileDir, resetConnection } from "@tassello/cdp";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 登录信息源头：日常 Chrome 的 profile。多 profile 用户用 TASSELLO_SOURCE_CHROME_PROFILE 指定 */
function sourceProfileDir(): string {
  if (process.env.TASSELLO_SOURCE_CHROME_PROFILE) {
    return path.resolve(process.env.TASSELLO_SOURCE_CHROME_PROFILE);
  }
  return path.join(getDefaultChromeUserDataDirs()[0]!, "Default");
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

/** 用日常 Chrome 的 Default profile 覆盖应用专用 profile 的登录态文件。
 *  返回复制了的相对路径清单；源不存在/没有 Cookies 时抛错（调用方走人工登录兜底） */
export async function refreshAppProfileFromDefault(): Promise<{ copied: string[] }> {
  const src = sourceProfileDir();
  if (!fs.existsSync(src)) {
    throw new Error(`日常 Chrome 的 profile 不存在：${src}`);
  }
  const dstRoot = resolveChromeProfileDir();
  const dstProfile = path.join(dstRoot, "Default");
  fs.mkdirSync(dstProfile, { recursive: true });

  await stopAppChrome();

  const copied: string[] = [];
  const cpFile = (rel: string) => {
    const from = path.join(src, rel);
    if (!fs.existsSync(from)) return;
    const to = path.join(dstProfile, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.push(rel);
  };
  const cpDir = (rel: string) => {
    const from = path.join(src, rel);
    if (!fs.existsSync(from)) return;
    fs.cpSync(from, path.join(dstProfile, rel), { recursive: true, force: true });
    copied.push(`${rel}/`);
  };

  // Local State：os_crypt 的密钥绑定（macOS 走 Keychain，同机同用户可解）
  const localState = path.join(path.dirname(src), "Local State");
  if (fs.existsSync(localState)) {
    fs.copyFileSync(localState, path.join(dstRoot, "Local State"));
    copied.push("Local State");
  }
  // 登录态：Cookies（Chrome 96+ 在 Network/ 下）+ Local Storage + Session Storage
  for (const rel of ["Network/Cookies", "Network/Cookies-journal", "Network/Cookies-wal", "Cookies", "Cookies-journal", "Cookies-wal"]) {
    cpFile(rel);
  }
  cpDir("Local Storage");
  cpDir("Session Storage");

  if (!copied.some((c) => c.includes("Cookies"))) {
    throw new Error("日常 Chrome 的 profile 里没有可复制的 Cookies");
  }
  return { copied };
}

/** acquire 用的入口：把结果折叠成 {ok, message}，失败原因直接给 UI 展示 */
export async function syncBrowserProfile(): Promise<{ ok: boolean; message?: string }> {
  try {
    const { copied } = await refreshAppProfileFromDefault();
    return { ok: true, message: copied.join("、") };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
