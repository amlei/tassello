/* 探针：查草稿箱是否有目标草稿（新版草稿接口 appmsgdraft list_ex） */
import { CdpConnection, findChromeExecutable, launchChrome, resolveChromeProfileDir, waitForChromeDebugPort } from "@tassello/cdp";
import { spawnSync } from "node:child_process";
import path from "node:path";

const profileDir = resolveChromeProfileDir();
let port = 9333;
// 复用/拉起（headless 查询即可）
const ps = spawnSync("ps", ["aux"], { encoding: "utf8" });
const running = ps.stdout.split("\n").some((l) => l.includes(profileDir) && l.includes("--remote-debugging-port="));
if (!running) {
  const chromePath = findChromeExecutable({
    candidates: { darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"], win32: [], default: ["/usr/bin/google-chrome"] },
  })!;
  launchChrome({ chromePath, profileDir, port, headless: true, extraArgs: ["--remote-allow-origins=*"] });
  await waitForChromeDebugPort(port, 20_000);
} else {
  const m = ps.stdout.split("\n").find((l) => l.includes(profileDir))!.match(/--remote-debugging-port=(\d+)/)!;
  port = Number(m[1]);
}
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const session = (await cdp.send("Target.createTarget", { url: "about:blank" }) as any);
const sid = (await cdp.send("Target.attachToTarget", { targetId: session.targetId, flatten: true }) as any).sessionId;

// 拿 token
let token: string | null = null;
await cdp.send("Page.navigate", { url: "https://mp.weixin.qq.com" }, { sessionId: sid });
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const st = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({token:(location.search.match(/token=(\\d+)/)||[])[1]||null, scan: !!document.querySelector(".login__type__container__scan, #scan_qrcode")})`,
  }, { sessionId: sid }) as any;
  const v = JSON.parse(st.result.value);
  if (v.scan) { console.error("NOT_LOGGED_IN"); process.exit(2); }
  if (v.token) { token = v.token; break; }
}
if (!token) { console.error("no token"); process.exit(1); }
console.log("token:", token);

// 查草稿（新旧两个接口都试）
for (const api of [
  `/cgi-bin/appmsgdraft?action=list_ex&begin=0&count=20&f=json&token=${token}&lang=zh_CN&query=&hasRemark=0&freePublishType=0&platform=4`,
  `/cgi-bin/appmsg?action=list_ex&begin=0&count=20&type=77&f=json&token=${token}&lang=zh_CN`,
]) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: `fetch("${api}", {credentials:"include"}).then(r=>r.text()).then(t=>t.slice(0,3000))`,
    awaitPromise: true,
  }, { sessionId: sid }) as any;
  console.log("=== ", api.slice(0, 60));
  console.log(String(r.result.value).slice(0, 1500));
}
process.exit(0);
