/* 临时探针：小红书发布页结构（headless，只读不发布） */
import { evaluateScalar, withPage } from "@tassello/cdp";
import { XHS_PUBLISH_URL } from "../src/index";
const r = await withPage("xhs", { url: XHS_PUBLISH_URL, keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 6000));
  return evaluateScalar<any>(cdp, sid, `(() => {
    const text = (document.body && document.body.innerText) || "";
    const tabs = ["上传视频", "上传图文", "写长文"].map((t) => ({ tab: t, present: text.indexOf(t) >= 0 }));
    const fileInputs = Array.from(document.querySelectorAll("input[type=file]")).map((i) => ({ cls: i.className, accept: i.accept }));
    const titleInput = !!document.querySelector('input[placeholder*="标题"], #title-input');
    const editable = Array.from(document.querySelectorAll('[contenteditable="true"]')).map((e) => ({ id: e.id, cls: String(e.className).slice(0, 60), h: e.offsetHeight }));
    const publishBtns = Array.from(document.querySelectorAll("button")).filter((b) => /发布/.test((b.textContent || "").trim())).map((b) => ({ t: (b.textContent || "").trim(), cls: String(b.className).slice(0, 80), disabled: b.disabled }));
    return JSON.parse(JSON.stringify({ url: location.href, title: document.title, tabs, fileInputs, titleInput, editable, publishBtns, hasPostTextarea: !!document.querySelector("#post-textarea") }));
  })()`, { timeoutMs: 15000 });
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
