/* 喜马拉雅探针专用 profile 同步：从日常 Chrome Default profile 复制登录态到探针 profile。
 * TASSELLO_CHROME_PROFILE 必须在 import @tassello/cdp 之前设置（pool 在模块加载后按需读取，
 * 但提前设置最稳妥）。之后本包所有探针脚本都带同一环境变量跑，独立 Chrome 实例、独立端口。 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/ximalaya`;
const { syncBrowserProfile } = await import("@tassello/server");
const r = await syncBrowserProfile("chrome");
console.log(JSON.stringify(r));
process.exit(0);
