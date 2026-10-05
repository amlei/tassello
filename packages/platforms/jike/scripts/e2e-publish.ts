/* e2e：即刻发动态全链路（文字 + 图片 → 回执链接 → 删探针动态清理） */
import { evaluateScalar } from "@tassello/cdp";
import { CdpConnection, waitForChromeDebugPort } from "@tassello/cdp";
import { jikeAdapter, JIKE_API_BASE } from "../src/index";

const PROBE_PORT = 9341;

// 1) 从 probe Chrome 导入登录态
const wsUrl = await waitForChromeDebugPort(PROBE_PORT, 10_000);
const cdp = await CdpConnection.connect(wsUrl, 10_000);
const targets = await cdp.send<{ targetInfos: { targetId: string; type: string; url: string }[] }>("Target.getTargets");
const page = targets.targetInfos.find((t) => t.type === "page" && t.url.includes("okjike.com"));
if (!page) throw new Error("probe Chrome 里没有 web.okjike.com 标签页");
const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const token = await evaluateScalar<string>(cdp, sessionId, `localStorage.getItem("JK_ACCESS_TOKEN") || ""`, { timeoutMs: 10_000 });
cdp.close();
if (!token) throw new Error("probe Chrome 未登录即刻");
const box = new Map<string, string>([["jike:e2e:accessToken", token]]);
const ctx = {
  runPage: async () => { throw new Error("此脚本已预置 token，不应注入浏览器"); },
  secrets: { get: async (k: string) => box.get(k) ?? null, set: async (k: string, v: string) => { box.set(k, v); } },
  log: (e: string, p?: unknown) => console.log("[log]", e, p ?? ""),
};
const onStage = (s: { stage: number; progress: number; message?: string | null }) => console.log("[stage]", s.stage, s.progress, s.message ?? "");

// 2) 造一张本地测试图（32x32 纯色 PNG，base64）
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8z8Dwn4EIwESMolGgAQBbEAGoLwNC6gAAAABJRU5ErkJggg==",
  "base64",
);
await Bun.write("/tmp/tassello-jike-e2e.png", png);

const acct = { id: "e2e", uid: null, profile: undefined as never };
const post = {
  id: "e2e",
  type: "article",
  title: "tassello e2e 探针",
  body: "tassello 即刻通道 e2e 测试动态（含配图），发送后自动删除。",
  bodyHtml: "",
  durationSec: null,
  assets: [{ id: "a1", kind: "image", path: "/tmp/tassello-jike-e2e.png" }],
};
const r = await jikeAdapter.publish(post as never, acct as never, ctx, onStage);
console.log("publish:", JSON.stringify(r));
if (!r.url) process.exit(1);

// 3) 校验回执可读，然后删除探针动态（清理）
const id = r.receipt!.postId!;
const g = await fetch(`${JIKE_API_BASE}/1.0/originalPosts/get?id=${id}`, {
  headers: { "x-jike-access-token": token, platform: "web" },
});
console.log("receipt readable:", g.status);
const d = await fetch(`${JIKE_API_BASE}/1.0/originalPosts/remove`, {
  method: "POST",
  headers: { "x-jike-access-token": token, platform: "web", "content-type": "application/json" },
  body: JSON.stringify({ id }),
});
console.log("cleanup remove:", d.status, (await d.text()).slice(0, 100));
process.exit(0);
