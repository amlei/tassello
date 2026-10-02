/* 探针：filetransfer scene=29 传带音轨 mp4 → 打开 ct5 选择视频弹窗看素材库列表 */
import { evaluateScalar, withPage } from "@tassello/cdp";
import fs from "node:fs";
const mp4 = fs.readFileSync("/tmp/opencode/test-video2.mp4").toString("base64");

await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 7000));
  const up = await evaluateScalar<{ status: number; body: string }>(cdp, sid, `(async () => {
    const b64 = ${JSON.stringify(mp4)};
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type: "video/mp4" }), "probe2.mp4");
    const cd = (window.wx && window.wx.commonData && window.wx.commonData.data) || {};
    const seq = Date.now();
    const url = "/cgi-bin/filetransfer?action=upload_material&f=json&scene=29&writetype=doublewrite&groupid=1"
      + "&ticket_id=" + (cd.ticket_id || "") + "&ticket_token=" + (cd.ticket_token || "")
      + "&svr_time=" + Math.floor(seq / 1000) + "&lang=zh_CN&seq=" + seq;
    const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
    return { status: res.status, body: (await res.text()).slice(0, 300) };
  })()`, { timeoutMs: 180_000 });
  console.log("upload:", JSON.stringify(up.body));
  await new Promise((r) => setTimeout(r, 5000));

  // 进 ct5 编辑器开弹窗
  for (let i = 0; i < 25; i++) {
    const st = await evaluateScalar<{ token: string | null; onEditor: boolean; ready: boolean }>(
      cdp, sid,
      `JSON.parse(JSON.stringify({
        token: (location.search.match(/token=(\\d+)/) || [])[1] || null,
        onEditor: location.href.indexOf("appmsg_edit") >= 0,
        ready: !!document.querySelector("textarea#title"),
      }))`, { timeoutMs: 6000 }).catch(() => null);
    if (st?.onEditor && st.ready) break;
    if (st?.token && !st.onEditor) {
      await cdp.send("Page.navigate", { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=5&token=${st.token}&lang=zh_CN` }, { sessionId: sid }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  const d = await evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
    items: Array.from(document.querySelectorAll(".video-select-dialog li, .more-video__list li")).slice(0, 8).map((e) => ({ cls: (e.className||"").toString().slice(0, 60), text: (e.textContent||"").replace(/\\s+/g," ").slice(0, 70) })),
  }))`, { timeoutMs: 15000 });
  console.log(JSON.stringify(d, null, 2));
});
