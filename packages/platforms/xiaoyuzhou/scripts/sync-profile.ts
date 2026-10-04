/* 把日常 Chrome Default profile 的登录态同步到小宇宙探针专用 profile。
 * 必须在 import @tassello/cdp 之前设置 TASSELLO_CHROME_PROFILE（pool 模块加载时读取）。
 * 用法：bun packages/platforms/xiaoyuzhou/scripts/sync-profile.ts
 * 之后跑本包其他探针脚本都带：
 *   TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou <script>
 * 说明：不走 @tassello/server 入口（会连带注册所有平台适配器，别的平台还在并行开发），
 * 直接相对路径引 profile.ts——它只依赖 @tassello/cdp 和 @tassello/shared。 */
import path from "node:path";
import os from "node:os";

process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE ?? path.join(os.homedir(), ".local/share/tassello/probe-profiles/xiaoyuzhou");

const { syncBrowserProfile } = await import("../../../server/src/profile.ts");
const r = await syncBrowserProfile("chrome");
console.log(JSON.stringify(r));
process.exit(r.ok ? 0 : 1);
