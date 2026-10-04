/* 探针：登录态下抓主播公众平台真实业务接口的 JSON 结构（标量出页面）。
 * 端点来源：probe-live.ts 的 performance resource 记录（2026-10-02 已登录真机）：
 * - 账号：GET https://papi.qingting.fm/papi/podcasters/{uid}/info?filter={"details":1}&...
 * - 专辑：GET https://papi.qingting.fm/papi/podcasters/{uid}/channels_for_page?order=create_time desc&page=1&pagesize=10&filter={"channel_type":""}&...
 * uid/user_token 从页面 localStorage 取（页面自己拼 URL 的方式）。
 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { withPage, evaluateScalar } from "@tassello/cdp";

const r = await withPage(
  "qingting-probe",
  { url: "https://admin.qingting.fm/content/channels", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 6_000));
    return evaluateScalar(
      cdp,
      sid,
      `(async () => {
        const redact = (o) => JSON.parse(JSON.stringify(o, (k, v) => /token|secret|password/i.test(k) ? "<redacted>" : v));
        const out = { ls: {}, info: null, channels: null, errors: [] };
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (/qingting|podcast|user|token/i.test(k)) out.ls[k] = String(localStorage.getItem(k)).slice(0, 200);
          }
          // 从已发请求里找 user_id / user_token（页面拼 URL 的来源）
          const entry = performance.getEntriesByType("resource").map(e => e.name).find(u => u.includes("channels_for_page"));
          const u = new URL(entry);
          const uid = u.searchParams.get("user_id");
          const tok = u.searchParams.get("user_token");
          const dev = u.searchParams.get("device_id");
          const common = "device_type=unknown&client_type=pod_web&wv=unknown&ut=1";
          const f = async (url) => { const r = await fetch(url, { credentials: "include" }); return { status: r.status, body: await r.json() }; };
          out.info = redact(await f("https://papi.qingting.fm/papi/podcasters/" + uid + "/info?filter=" + encodeURIComponent(JSON.stringify({ details: 1 })) + "&" + common + "&user_id=" + uid + "&device_id=" + dev + "&user_token=" + tok));
          out.channels = redact(await f("https://papi.qingting.fm/papi/podcasters/" + uid + "/channels_for_page?order=" + encodeURIComponent("create_time desc") + "&page=1&pagesize=10&filter=" + encodeURIComponent(JSON.stringify({ channel_type: "" })) + "&device_type=unknown&client_type=pod_web&wv=unknown&pt=ChannelManagement&user_id=" + uid + "&device_id=" + dev + "&user_token=" + tok));
        } catch (e) { out.errors.push(String(e)); }
        return JSON.stringify(out).slice(0, 12000);
      })()`,
      { timeoutMs: 25_000 },
    );
  },
);
console.log(r);
process.exit(0);
