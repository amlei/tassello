/**
 * check-draft-body —— 打开草稿编辑页，读回服务端标题/正文/图片数（验证保存结果）
 *
 * 用法：bun scripts/check-draft-body.ts --appmsgid <id> [--token <t>] [--itemidx 1]
 */
import { CdpConnection, findExistingChromeDebugPort, launchChrome, findChromeExecutable, resolveChromeProfileDir, waitForChromeDebugPort } from "@tassello/cdp";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const appmsgid = arg("appmsgid");
const itemidx = arg("itemidx") ?? "1";
let token = arg("token") ?? null;
if (!appmsgid) {
  console.error("用法：bun scripts/check-draft-body.ts --appmsgid <id> [--token <t>] [--itemidx 1]");
  process.exit(1);
}

const profileDir = resolveChromeProfileDir();
let port = await findExistingChromeDebugPort({ profileDir }) ?? 0;
if (!port) {
  const chromePath = findChromeExecutable({
    candidates: { darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"], win32: [], default: ["/usr/bin/google-chrome"] },
  })!;
  port = 9333;
  launchChrome({ chromePath, profileDir, port, extraArgs: ["--remote-allow-origins=*", "--window-size=1440,900"] });
  await waitForChromeDebugPort(port, 30_000);
}
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);

const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" }) as any;
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true }) as any;
const ev = async <T = any>(expr: string, timeoutMs = 10_000): Promise<T> => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, { sessionId, timeoutMs } as any) as any;
  return r?.result?.value as T;
};

const draftUrl = (t: string) =>
  `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&appmsgid=${appmsgid}&itemId=${itemidx}&token=${t}&lang=zh_CN`;

await cdp.send("Page.enable", {}, { sessionId });
await cdp.send("Runtime.enable", {}, { sessionId });

// 先从一个已打开的 mp 标签里拿 token；没有就先开首页
if (!token) {
  const targets = (await cdp.send("Target.getTargets") as any).targetInfos.filter((t: any) => t.type === "page" && t.url.includes("mp.weixin.qq.com"));
  for (const t of targets) {
    const s = (await cdp.send("Target.attachToTarget", { targetId: t.targetId, flatten: true }) as any).sessionId;
    const r = await cdp.send("Runtime.evaluate", { expression: `(location.search.match(/token=(\\d+)/)||[])[1]||""` }, { sessionId: s }) as any;
    if (r.result?.value) { token = r.result.value; break; }
  }
}
if (!token) {
  await cdp.send("Page.navigate", { url: "https://mp.weixin.qq.com" }, { sessionId });
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    const r = await ev(`(location.search.match(/token=(\\d+)/)||[])[1]||""`).catch(() => "");
    if (r) { token = r; break; }
  }
}
if (!token) { console.error("拿不到 mp token（未登录？）"); process.exit(2); }

await cdp.send("Page.navigate", { url: draftUrl(token) }, { sessionId });
let last: any = null;
for (let i = 0; i < 14; i++) {
  await sleep(2000);
  last = await ev(`JSON.parse(JSON.stringify((() => {
    const title = (document.querySelector("textarea#title") || {}).value || "";
    const pms = Array.from(document.querySelectorAll(".ProseMirror")).map((e) => ({
      h: e.offsetHeight,
      text: e.innerText.replace(/\\s+/g, "").length,
      imgs: e.querySelectorAll("img").length,
    }));
    return { title, pms: pms.filter((p) => p.h > 0) };
  })()))`).catch(() => null);
  if (last && last.title && last.pms.some((p: any) => p.text > 200 || p.imgs > 0)) break;
}
await cdp.send("Target.closeTarget", { targetId });
console.log(JSON.stringify(last, null, 2));
const body = (last?.pms || []).filter((p: any) => p.h > 100).sort((a: any, b: any) => b.h - a.h)[0];
if (body && (body.text > 500 || body.imgs >= 3)) {
  console.log(`OK：正文已持久化（文字 ${body.text} 字符 / 图片 ${body.imgs} 张）`);
} else {
  console.log("FAIL：草稿正文疑似为空，请打开草稿确认");
  process.exit(3);
}
