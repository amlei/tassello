/* 冒烟：即刻 verify（token 从专用 probe Chrome 的 localStorage 导入，模拟 SecretBox） */
import { evaluateScalar } from "@tassello/cdp";
import { CdpConnection, waitForChromeDebugPort } from "@tassello/cdp";
import { jikeAdapter } from "../src/index";

const PROBE_PORT = 9341;
const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };

// 从 probe Chrome 拿 token（该 profile 里的登录态由人工扫码登录产生）
const wsUrl = await waitForChromeDebugPort(PROBE_PORT, 10_000);
const cdp = await CdpConnection.connect(wsUrl, 10_000);
const targets = await cdp.send<{ targetInfos: { targetId: string; type: string; url: string }[] }>("Target.getTargets");
const page = targets.targetInfos.find((t) => t.type === "page" && t.url.includes("okjike.com"));
if (!page) throw new Error("probe Chrome 里没有 web.okjike.com 标签页（先打开并登录）");
const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const token = await evaluateScalar<string>(cdp, sessionId, `localStorage.getItem("JK_ACCESS_TOKEN") || ""`, { timeoutMs: 10_000 });
cdp.close();
if (!token) throw new Error("probe Chrome 未登录即刻");

// 模拟 SecretBox：token 已入库
const box = new Map<string, string>([["jike:t:accessToken", token], ["jike:t:refreshToken", ""]]);
const sctx = { runPage: async () => { throw new Error("此脚本已预置 token，不应注入浏览器"); }, secrets: { get: async (k: string) => box.get(k) ?? null, set: async (k: string, v: string) => { box.set(k, v); } }, log: ctx.log };
const r = await jikeAdapter.account.verify({ id: "t", uid: null, profile: undefined as never }, sctx);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
