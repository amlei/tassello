/* 探针 profile 同步：把日常 Chrome 的 Default profile 登录态复制到荔枝专用探针 profile。
 * 用法：bun packages/platforms/lizhi/scripts/sync-profile.ts
 * 注意：TASSELLO_CHROME_PROFILE 必须在 import @tassello/cdp 前设置（resolveChromeProfileDir 读取时机）。
 * 同步后，本包所有探针脚本都带同一个环境变量跑：
 *   TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/lizhi bun <script>
 */
import path from "node:path";
import os from "node:os";
import process from "node:process";

process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || path.join(os.homedir(), ".local/share/tassello/probe-profiles/lizhi");

const { syncBrowserProfile } = await import("@tassello/server");
const r = await syncBrowserProfile("chrome");
console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);
