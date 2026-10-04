/* 探针 5：看 njnew 请求实际带出的 Cookie（Network.requestWillBeSentExtraInfo）+ 响应 Set-Cookie。
 * 判断 hash cookie 是否被发送/被服务端认可。 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/lizhi`;
import { withPage } from "@tassello/cdp";

await withPage("lizhi", { url: "about:blank", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await cdp.send("Network.enable", {}, { sessionId: sid });
  const cookieLines: string[] = [];
  (cdp as unknown as { on: (e: string, f: (p: never) => void) => void }).on("Network.requestWillBeSentExtraInfo", (raw: never) => {
    const p = raw as { associatedCookies?: { blockedReasons?: string[]; cookie: { name: string; domain: string } }[] };
    for (const c of p.associatedCookies ?? []) {
      if (c.cookie.domain.includes("lizhi")) {
        cookieLines.push(`${c.cookie.name} ${c.cookie.domain} blocked:${JSON.stringify(c.blockedReasons ?? [])}`);
      }
    }
  });
  await cdp.send("Page.navigate", { url: "https://nj.lizhi.fm/static/newsite/#/manage/sheet" }, { sessionId: sid });
  await new Promise((res) => setTimeout(res, 10000));
  console.log([...new Set(cookieLines)].join("\n"));
});
process.exit(0);
