/* profile —— 浏览器登录态导入：把用户已登录的 Chrome Profile 复制到本应用的专用 Profile。
   登录永远发生在用户自己的浏览器里，本应用不承担登录；导入后校验/发布直接使用其中的 Cookie */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveChromeProfileDir, shutdownBrowser } from "@tassello/cdp";

/** 用户日常浏览器（Chrome）的 User Data 目录，可用环境变量覆盖 */
function sourceUserdataDir(): string {
  if (process.env.TASSELLO_SOURCE_CHROME_DIR) return process.env.TASSELLO_SOURCE_CHROME_DIR;
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "Google", "Chrome");
    case "win32":
      return path.join(home, "AppData", "Local", "Google", "Chrome", "User Data");
    default:
      return path.join(home, ".config", "google-chrome");
  }
}

/** 拷贝时跳过的缓存目录（体积大头，与登录态无关） */
const SKIP_DIRS = new Set([
  "Cache", "Cache_Data", "Code Cache", "GPUCache", "GrShaderCache", "ShaderCache",
  "Service Worker", "Media Cache", "optimization_guide_model_store", "Crashpad", "Safe Browsing",
]);

function copyProfileContents(src: string, dest: string): void {
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (from) => {
      const rel = path.relative(src, from);
      if (!rel) return true;
      const top = rel.split(path.sep)[0]!;
      // User Data 根层只保留 Local State（Cookie 解密密钥所在）与 Default 目录
      if (top !== "Default" && top !== "Local State") return false;
      return !SKIP_DIRS.has(path.basename(from));
    },
  });
}

/** 导入：关停本应用浏览器 → 清空专用 Profile → 复制用户 Chrome 的 Local State + Default Profile */
export async function syncBrowserProfile(): Promise<{ ok: boolean; message?: string }> {
  const src = sourceUserdataDir();
  const dest = resolveChromeProfileDir();
  if (!fs.existsSync(path.join(src, "Local State")) || !fs.existsSync(path.join(src, "Default"))) {
    return { ok: false, message: "未找到已登录的 Chrome Profile（需要本机装有 Chrome 并登录过平台）" };
  }
  // 同一 Profile 只能被一个 Chrome 实例占用：先关停本应用的浏览器
  shutdownBrowser();
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    copyProfileContents(src, dest);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `导入 Profile 失败：${e instanceof Error ? e.message : String(e)}` };
  }
}
