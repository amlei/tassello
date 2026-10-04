/* 蜻蜓FM e2e 测试残留清理：列出账号专辑里含 tassello 测试标题的节目并报告。
 *
 * 说明：publish 链路是「草稿为止」语义（绝不点「发 布」），未提交前平台侧不会产生节目记录，
 * 平时无残留。只有人工在页面上点过「发 布」后才会出现真实节目——蜻蜓网页后台的
 * 「删除节目」接口未在真机页面流量中观察到（证据不足，不编造端点），因此这里只做
 * 「发现并报告」，不做自动删除；删除请在上传页/专辑管理页人工操作。
 * 用法：bun packages/platforms/qingting/scripts/cleanup-e2e.ts */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { withPage, evaluateScalar } from "@tassello/cdp";

const r = await withPage(
  "qingting",
  { url: "https://admin.qingting.fm/content/channels", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    for (let i = 0; i < 15; i++) {
      await new Promise((res) => setTimeout(res, 2_000));
      const url = await evaluateScalar<string>(cdp, sid, "location.href", { timeoutMs: 8_000 });
      if (String(url).includes("/login")) return { loggedIn: false as const };
      // 等页面自己发出带 token 的业务请求（verify 同款凭据来源）
      const has = await evaluateScalar<boolean>(
        cdp,
        sid,
        `performance.getEntriesByType("resource").map(e => e.name).some(u => u.includes("papi.qingting.fm") && u.includes("user_token="))`,
        { timeoutMs: 8_000 },
      );
      if (has) break;
    }
    return evaluateScalar(
      cdp,
      sid,
      `(async () => {
        const entry = performance.getEntriesByType("resource").map(e => e.name).find(u => u.includes("papi.qingting.fm") && u.includes("user_token="));
        if (!entry) return { loggedIn: false };
        const u = new URL(entry);
        const uid = u.searchParams.get("user_id"), tok = u.searchParams.get("user_token"), dev = u.searchParams.get("device_id") || "";
        const common = "device_type=unknown&client_type=pod_web&wv=unknown&ut=1";
        const ch = await (await fetch("https://papi.qingting.fm/papi/podcasters/" + uid + "/channels_for_page?order=" + encodeURIComponent("create_time desc") + "&page=1&pagesize=100&filter=" + encodeURIComponent(JSON.stringify({ channel_type: "" })) + "&device_type=unknown&client_type=pod_web&wv=unknown&pt=ChannelManagement&user_id=" + uid + "&device_id=" + dev + "&user_token=" + tok, { credentials: "include" })).json();
        if (!ch || ch.errcode !== 0) return { loggedIn: false, reason: "channels-err" };
        const out = [];
        for (const c of (ch.data.items || [])) {
          // 节目列表端点未在真机页面流量中确认（专辑页数据可能是 SSR/其他接口带回），探测性调用、失败则跳过
          const pr = await (await fetch("https://papi.qingting.fm/papi/channels/" + c.id + "/programs?page=1&pagesize=50&order=" + encodeURIComponent("create_time desc") + "&device_type=unknown&client_type=pod_web&wv=unknown&pt=ChannelManagement&user_id=" + uid + "&device_id=" + dev + "&user_token=" + tok, { credentials: "include" })).json().catch(() => null);
          const items = pr && pr.errcode === 0 && pr.data && Array.isArray(pr.data.items) ? pr.data.items : [];
          out.push({ channel: c.title, channelId: String(c.id), probed: pr != null, found: items.filter(p => /tassello/i.test(p.title || "")).map(p => ({ id: String(p.id), title: p.title, createTime: p.create_time ?? null })) });
        }
        return { loggedIn: true, channels: out };
      })()`,
      { timeoutMs: 30_000 },
    );
  },
);
console.log(JSON.stringify(r, null, 2));
if (r && typeof r === "object" && "loggedIn" in r && r.loggedIn === false) {
  console.log("登录态不可用：无平台侧可检查的残留（或需人工登录后重跑）。");
} else {
  console.log("以上为「发现并报告」结果；如发现 tassello 测试节目，请在蜻蜓后台人工删除。");
}
process.exit(0);
