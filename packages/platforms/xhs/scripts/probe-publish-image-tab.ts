/* 临时探针2：切「上传图文」tab 后的结构（headless，只读不发布） */
import { evaluateScalar, withPage } from "@tassello/cdp";
import { XHS_PUBLISH_URL } from "../src/index";
const r = await withPage("xhs", { url: XHS_PUBLISH_URL, keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 5000));
  await evaluateScalar<boolean>(cdp, sid, `(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"], li, div, span'))
      .filter((el) => (el.textContent || "").trim() === "上传图文" && el.offsetParent !== null && el.children.length <= 2);
    const el = tabs[tabs.length - 1];
    if (!el) return false;
    el.click();
    return true;
  })()`, { timeoutMs: 10000 });
  await new Promise((res) => setTimeout(res, 3000));
  return evaluateScalar<any>(cdp, sid, `(() => {
    const fileInputs = Array.from(document.querySelectorAll("input[type=file]")).map((i) => ({ cls: i.className, accept: String(i.accept).slice(0, 60) }));
    const titleInput = Array.from(document.querySelectorAll("input")).filter((i) => /标题/.test(i.placeholder || "")).map((i) => ({ placeholder: i.placeholder, cls: String(i.className).slice(0, 60), id: i.id }));
    const editable = Array.from(document.querySelectorAll('[contenteditable="true"]')).map((e) => ({ id: e.id, cls: String(e.className).slice(0, 60), h: e.offsetHeight }));
    const publishBtns = Array.from(document.querySelectorAll("button")).filter((b) => /发布/.test((b.textContent || "").trim())).map((b) => ({ t: (b.textContent || "").trim(), cls: String(b.className).slice(0, 80), disabled: b.disabled }));
    return JSON.parse(JSON.stringify({ fileInputs, titleInput, editable, publishBtns, hasPostTextarea: !!document.querySelector("#post-textarea") }));
  })()`, { timeoutMs: 15000 });
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
