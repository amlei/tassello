/* 探针：页面上下文 filetransfer 上传正文图（scene=8），验 ticket 与返回结构 */
import { evaluateScalar, withPage } from "@tassello/cdp";
import fs from "node:fs";
const TOKEN = "853457057";
const URL0 = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=${TOKEN}&lang=zh_CN`;
const b64 = fs.readFileSync("/tmp/opencode/up.png").toString("base64");
await withPage("wechat", { url: URL0, keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 8000));
  const info = await evaluateScalar<{ ticketId: string | null; ticketToken: string | null; uin: string | null }>(
    cdp, sid,
    `JSON.parse(JSON.stringify({
      ticketId: (window.wx && window.wx.commonData && window.wx.commonData.data && window.wx.commonData.data.ticket_id) || null,
      ticketToken: (window.wx && window.wx.commonData && window.wx.commonData.data && window.wx.commonData.data.ticket_token) || null,
      uin: (window.wx && window.wx.commonData && window.wx.commonData.data && window.wx.commonData.data.uin) || null,
    }))`,
    { timeoutMs: 10000 },
  );
  console.log("ticket:", JSON.stringify(info));
  const r = await evaluateScalar<{ status: number; body: string }>(
    cdp, sid,
    `(async () => {
      const b64 = ${JSON.stringify(b64)};
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: "image/png" }), "probe.png");
      const cd = window.wx.commonData.data;
      const seq = Date.now();
      const url = "/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1&ticket_id=" + cd.ticket_id + "&ticket_token=" + cd.ticket_token + "&svr_time=" + Math.floor(seq / 1000) + "&lang=zh_CN&seq=" + seq;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      const txt = await res.text();
      return { status: res.status, body: txt.slice(0, 500) };
    })()`,
    { timeoutMs: 30000 },
  );
  console.log("upload:", JSON.stringify(r, null, 2));
});
