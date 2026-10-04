/* 清理 e2e/探针发布内容：按 id 删除知乎想法/文章（裸 fetch DELETE，同发布通道）
 * 用法：bun packages/platforms/zhihu/scripts/cleanup-e2e.ts pin:<id> article:<id> ...
 * 不带参数时删除本文件里记录的全部探针 id */
import { CdpConnection, openPageSession, waitForChromeDebugPort, sleep, evaluateScalar } from "@tassello/cdp";

const DEFAULT_IDS = [
  "pin:2089339770379964523",
  "article:2089339781792768580",
  "pin:2089340642799589376",
  "article:2089340850706853943",
  "article:2089340892951926115",
  "pin:2089340838572827555",
  "pin:2089340881736295116",
];
const args = process.argv.slice(2);
const entries = (args.length ? args : DEFAULT_IDS).map((s) => {
  const [kind, id] = s.includes(":") ? s.split(":") : ["pin", s];
  return { kind: kind === "pin" ? "pins" : kind === "article" ? "articles" : kind, id };
});

const ws = await waitForChromeDebugPort(9342, 10_000);
const cdp = await CdpConnection.connect(ws, 15_000);
const zh = await openPageSession({
  cdp, reusing: true, url: "https://www.zhihu.com/creator",
  matchTarget: (t) => /zhihu\.com/.test(t.url), enableRuntime: true,
});
await sleep(5_000);
for (const { kind, id } of entries) {
  const r = await evaluateScalar<{ status: number; body: string }>(cdp, zh.sessionId, `(async () => {
    const xsrf = (document.cookie.match(/_xsrf=([^;]+)/) || [])[1] || "";
    const r = await fetch("https://www.zhihu.com/api/v4/${kind}/${id}", { method: "DELETE", credentials: "include", headers: { "x-requested-with": "fetch", "x-xsrftoken": xsrf } });
    return JSON.parse(JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 200) }));
  })()`, { timeoutMs: 20_000 });
  console.log(kind, id, r.status, r.body);
}
process.exit(0);
