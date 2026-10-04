/* 探针：接口直传图片 + 建画廊/混排草稿（真机，验后删除） */
import { evaluateScalar, withPage } from "@tassello/cdp";
import fs from "node:fs";
const pngB64 = fs.readFileSync("/tmp/dbn-test.png").toString("base64");
const r = await withPage("douban", { url: "https://www.douban.com/", keepOpen: false, activate: false, mode: "visible" }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 6000));
  return evaluateScalar<any>(cdp, sid, `(async () => {
    const out = {};
    const ck = (document.cookie.match(/(?:^|;\\s*)ck=([^;]+)/) || [])[1] || "";
    const authToken = (window.__INIT_STATE__ || {}).upload_auth_token || "";
    out.authToken = authToken.slice(0, 20);
    // 1) 上传
    const bin = atob("${pngB64}");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fd = new FormData();
    fd.append("ck", ck);
    fd.append("image_file", new File([bytes], "probe.png", { type: "image/png" }));
    fd.append("primary_color", "");
    fd.append("upload_auth_token", authToken);
    const up = await fetch("https://upload.douban.com/j/group/topic/add_photo", { method: "POST", credentials: "include", body: fd });
    const uj = await up.json().catch(() => null);
    out.upload = { s: up.status, r: uj && uj.r, photoId: uj && uj.photo && uj.photo.id, url: uj && uj.photo && uj.photo.url ? String(uj.photo.url).slice(0, 80) : null, w: uj && uj.photo && uj.photo.width, h: uj && uj.photo && uj.photo.height };
    if (!(uj && uj.photo)) { out.upload.raw = JSON.stringify(uj).slice(0, 300); return out; }
    const photo = uj.photo;
    // 2) 画廊草稿（horizontal）
    const galleryProps = JSON.stringify({ title: "tassello 画廊草稿", content: { blocks: [], entityMap: {} }, image_ids: [photo.id], image_layout: "horizontal", topic_tag_ids: [], subtype: "personal" });
    const g = await fetch("https://m.douban.com/rexxar/api/v2/dwarf/drafts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft_props: galleryProps }) });
    const gj = await g.json().catch(() => null);
    out.gallery = { s: g.status, id: gj && gj.id, image_ids: gj && gj.image_ids, layout: gj && gj.image_layout };
    // 3) 混排草稿（vertical）：文字段 + 图片 block 交错
    const entKey = "e1";
    const mixedProps = JSON.stringify({
      title: "tassello 混排草稿",
      content: {
        blocks: [
          { key: "p1", text: "图片前面的一段。", type: "unstyled", depth: 0, inlineStyleRanges: [], entityRanges: [], data: { align: "" } },
          { key: "img1", text: " ", type: "atomic", depth: 0, inlineStyleRanges: [], entityRanges: [{ key: entKey, offset: 0, length: 1 }], data: { align: "" } },
          { key: "p2", text: "图片后面的一段。", type: "unstyled", depth: 0, inlineStyleRanges: [], entityRanges: [], data: { align: "" } },
        ],
        entityMap: { [entKey]: { type: "IMAGE", mutability: "IMMUTABLE", data: { src: photo.url, width: photo.width, height: photo.height, id: photo.id } } },
      },
      image_ids: [photo.id],
      image_layout: "vertical",
      topic_tag_ids: [],
      subtype: "personal",
    });
    const m = await fetch("https://m.douban.com/rexxar/api/v2/dwarf/drafts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft_props: mixedProps }) });
    const mj = await m.json().catch(() => null);
    out.mixed = { s: m.status, id: mj && mj.id, layout: mj && mj.image_layout };
    out.ids = { gallery: gj && gj.id, mixed: mj && mj.id };
    return out;
  })()`, { timeoutMs: 60000 });
});
console.log(JSON.stringify(r, null, 1));
process.exit(0);
