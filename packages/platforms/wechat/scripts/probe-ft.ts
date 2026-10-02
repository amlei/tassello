/* 探针：filetransfer 不同 scene 上传音频/视频素材（找可用的 scene） */
import { evaluateScalar, withPage } from "@tassello/cdp";
import fs from "node:fs";
const mp3 = fs.readFileSync("/tmp/opencode/test-audio.mp3").toString("base64");
const mp4 = fs.readFileSync("/tmp/opencode/test-video.mp4").toString("base64");

await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 7000));
  const tryUpload = (b64: string, fname: string, ftype: string, scene: number, extra = "") =>
    evaluateScalar<{ status: number; body: string }>(cdp, sid, `(async () => {
      const b64 = ${JSON.stringify(b64)};
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: ${JSON.stringify(ftype)} }), ${JSON.stringify(fname)});
      const cd = (window.wx && window.wx.commonData && window.wx.commonData.data) || {};
      const seq = Date.now();
      const url = "/cgi-bin/filetransfer?action=upload_material&f=json&scene=${scene}&writetype=doublewrite&groupid=1"
        + "&ticket_id=" + (cd.ticket_id || "") + "&ticket_token=" + (cd.ticket_token || "")
        + "&svr_time=" + Math.floor(seq / 1000) + "&lang=zh_CN&seq=" + seq ${extra ? "+ " + JSON.stringify(extra) : ""};
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      return { status: res.status, body: (await res.text()).slice(0, 300) };
    })()`, { timeoutMs: 120_000 });

  console.log("mp3 scene=4:", JSON.stringify(await tryUpload(mp3, "probe.mp3", "audio/mpeg", 4)));
  console.log("mp3 scene=26:", JSON.stringify(await tryUpload(mp3, "probe.mp3", "audio/mpeg", 26)));
  console.log("mp4 scene=29:", JSON.stringify(await tryUpload(mp4, "probe.mp4", "video/mp4", 29)));
});
