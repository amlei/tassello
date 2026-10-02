/* 探针：草稿编辑页封面区 DOM 探查。用法：bun scripts/probe-cover.ts [draftEditUrl] */
import { CdpConnection, findChromeExecutable, launchChrome, resolveChromeProfileDir, waitForChromeDebugPort } from "@tassello/cdp";
import { spawnSync } from "node:child_process";

const profileDir = resolveChromeProfileDir();
let port = 9333;
const ps = spawnSync("ps", ["aux"], { encoding: "utf8" });
const line = ps.stdout.split("\n").find((l) => l.includes(profileDir) && l.includes("--remote-debugging-port="));
if (line) {
  port = Number(line.match(/--remote-debugging-port=(\d+)/)![1]);
} else {
  const chromePath = findChromeExecutable({
    candidates: { darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"], win32: [], default: ["/usr/bin/google-chrome"] },
  })!;
  launchChrome({ chromePath, profileDir, port, headless: true, extraArgs: ["--remote-allow-origins=*"] });
  await waitForChromeDebugPort(port, 20_000);
}
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);

const draftUrl = process.argv[2] ?? "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&appmsgid=100002526&itemId=1&token=1653354518&lang=zh_CN";
const created = (await cdp.send("Target.createTarget", { url: draftUrl }) as any);
const sid = (await cdp.send("Target.attachToTarget", { targetId: created.targetId, flatten: true }) as any).sessionId;
await new Promise((r) => setTimeout(r, 6000));

const EXPR = `(() => {
  const out = { url: location.href.slice(90, 150), titleFilled: false, coverEls: [], inputs: [], dialogs: [] };
  const t = document.querySelector("textarea#title");
  out.titleFilled = !!(t && t.value);
  const els = Array.from(document.querySelectorAll("[class*=cover], [class*=Cover], [id*=cover]")).filter((e) => e.offsetHeight > 0 && e.offsetHeight < 400);
  out.coverEls = els.slice(0, 15).map((e) => ({
    tag: e.tagName, cls: String(e.className).slice(0, 70), id: e.id || null,
    text: (e.innerText || "").replace(/\\n/g, "/").slice(0, 60),
  }));
  out.inputs = Array.from(document.querySelectorAll("input[type=file]")).map((f, i) => ({
    i, accept: f.accept, multiple: !!f.multiple, visible: !!(f.offsetWidth || f.offsetHeight),
  }));
  out.dialogs = Array.from(document.querySelectorAll(".weui-desktop-dialog, [class*=dialog]"))
    .filter((d) => d.offsetHeight > 0)
    .map((d) => ({ cls: String(d.className).slice(0, 50), text: (d.textContent || "").replace(/\\s+/g, " ").slice(0, 120) }));
  return JSON.stringify(out);
})()`;

let dumpVal: string | null = null;
for (let i = 0; i < 15 && !dumpVal; i++) {
  const r = await cdp.send("Runtime.evaluate", { expression: EXPR, awaitPromise: true }, { sessionId: sid }) as any;
  const v = r?.result?.value;
  if (typeof v === "string" && v !== "undefined") dumpVal = v;
  else await new Promise((res) => setTimeout(res, 2000));
}
if (!dumpVal) { console.error("dump failed"); process.exit(1); }
console.log(JSON.stringify(JSON.parse(dumpVal), null, 1));
process.exit(0);
