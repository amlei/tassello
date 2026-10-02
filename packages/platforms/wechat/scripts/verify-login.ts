/* 启动 tassello Chrome → 验证 cookie jar → 导航 mp 首页 → 验证登录态（不发文） */
import { CdpConnection, findChromeExecutable, launchChrome, resolveChromeProfileDir, waitForChromeDebugPort } from "@tassello/cdp";
import { spawnSync } from "node:child_process";

const profileDir = resolveChromeProfileDir();
let port = 9333;
const ps = spawnSync("ps", ["aux"], { encoding: "utf8" });
const line = ps.stdout.split("\n").find((l) => l.includes(profileDir) && l.includes("--remote-debugging-port="));
if (line) {
  port = Number(line.match(/--remote-debugging-port=(\d+)/)![1]);
  console.log("[chrome] 复用已运行实例 port", port);
} else {
  const chromePath = findChromeExecutable({
    candidates: { darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"], win32: [], default: ["/usr/bin/google-chrome"] },
  })!;
  console.log("[chrome] 启动…", profileDir);
  launchChrome({ chromePath, profileDir, port, extraArgs: ["--remote-allow-origins=*", "--window-size=1440,900"] });
  await waitForChromeDebugPort(port, 30_000);
}
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);

// 1. jar 里的 mp cookie
const jar = await cdp.send("Storage.getCookies") as any;
const mp = jar.cookies.filter((c: any) => (c.domain || "").includes("mp.weixin") || (c.domain || "").includes(".weixin"));
console.log("[jar] mp.weixin cookies:", mp.map((c: any) => `${c.name}(${(c.value || "").length})`).join(", ") || "无");

// 2. 导航首页，看登录态
const created = (await cdp.send("Target.createTarget", { url: "https://mp.weixin.qq.com" }) as any);
const sid = (await cdp.send("Target.attachToTarget", { targetId: created.targetId, flatten: true }) as any).sessionId;
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 1800));
  const r2 = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      url: location.href.slice(0, 100),
      token: (location.search.match(/token=(\\d+)/) || [])[1] || null,
      scan: !!document.querySelector(".login__type__container__scan, #scan_qrcode"),
      timeoutPage: document.body.innerText.includes("登录超时"),
    })`,
  }, { sessionId: sid }) as any;
  const v = JSON.parse(r2.result.value);
  if (i === 9 || v.token || v.scan || v.timeoutPage) { console.log("[page]", JSON.stringify(v)); break; }
}
process.exit(0);
