/* 探针 1：打开荔枝创作者后台，dump 登录态 + 页面结构 + SPA 实际请求过的 JSON 接口。
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/lizhi \
 *       bun packages/platforms/lizhi/scripts/probe-home.ts
 * 结论写入 NOTES.md（只记录真实输出，不编造） */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/lizhi`;
import { evaluateScalar, withPage } from "@tassello/cdp";

const URL = process.argv[2] || "https://nj.lizhi.fm/static/newsite/#/manage/sheet";

const r = await withPage("lizhi", { url: URL, keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  // 等 SPA 渲染（hash 路由，等 body 文本非空）
  for (let i = 0; i < 20; i++) {
    await new Promise((res) => setTimeout(res, 1500));
    const ready = await evaluateScalar<boolean>(cdp, sid, `((document.body && document.body.innerText || "").length > 100)`, { timeoutMs: 8000 }).catch(() => false);
    if (ready) break;
  }
  return evaluateScalar<unknown>(
    cdp,
    sid,
    `(async () => {
      const out = {};
      out.href = location.href;
      out.title = document.title;
      out.bodyText = (document.body.innerText || "").slice(0, 3000);
      out.cookies = document.cookie;
      out.localStorageKeys = Object.keys(localStorage);
      out.sessionStorageKeys = Object.keys(sessionStorage);
      // SPA 加载以来请求过的资源（找 JSON 接口）
      out.resources = performance.getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => /json|api|ajax|graphql|xhr/i.test(u))
        .slice(0, 80);
      // 全局变量里常见的用户信息挂点
      out.globals = ["__INIT_STATE__", "__NUXT__", "g_user", "window.user", "userInfo"]
        .filter((k) => { try { return eval("typeof " + k.split(".")[0]) !== "undefined"; } catch { return false; } });
      return JSON.parse(JSON.stringify(out));
    })()`,
    { timeoutMs: 20000 },
  );
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
