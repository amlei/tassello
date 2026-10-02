/* 探针 v3：bringToFront + hasFocus + 点击后 DOM/iframe 变化 */
import { evaluateScalar, withPage } from "@tassello/cdp";

await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: true, activate: true, mode: "visible" }, async (cdp, sid) => {
  let token: string | null = null;
  for (let i = 0; i < 20; i++) {
    const st = await evaluateScalar<{ token: string | null }>(cdp, sid, `JSON.parse(JSON.stringify({ token: (location.search.match(/token=(\\d+)/) || [])[1] || null }))`, { timeoutMs: 5000 }).catch(() => null);
    if (st?.token) { token = st.token; break; }
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (!token) { console.error("no token"); return; }
  await cdp.send("Page.navigate", { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=5&token=${token}&lang=zh_CN` }, { sessionId: sid });
  await new Promise((r) => setTimeout(r, 9000));
  await cdp.send("Page.bringToFront", {}, { sessionId: sid });

  const events: string[] = [];
  cdp.on("Page.fileChooserOpened", (p) => events.push("opened: " + JSON.stringify(p).slice(0, 160)));
  await cdp.send("Page.enable", {}, { sessionId: sid });
  await cdp.send("Page.setInterceptFileChooserDialog", { enabled: true }, { sessionId: sid });

  const info = await evaluateScalar<{ focus: boolean; visible: boolean; iframes: number; rect: { x: number; y: number; w: number; h: number } | null }>(cdp, sid, `(async () => {
    const tabs = Array.from(document.querySelectorAll("a, li, div, span")).filter((e) => e.offsetHeight > 0 && (e.textContent || "").trim() === "本地上传");
    if (tabs.length) { tabs[0].click(); await new Promise((r) => setTimeout(r, 1500)); }
    const btn = Array.from(document.querySelectorAll("button")).filter((b) => b.offsetHeight > 0 && (b.textContent || "").trim() === "本地上传")[0];
    if (!btn) return { focus: document.hasFocus(), visible: document.visibilityState === "visible", iframes: document.querySelectorAll("iframe").length, rect: null };
    btn.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 600));
    const r = btn.getBoundingClientRect();
    return { focus: document.hasFocus(), visible: document.visibilityState === "visible", iframes: document.querySelectorAll("iframe").length, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  })()`, { timeoutMs: 20000 });
  console.log("info:", JSON.stringify(info));

  if (info.rect && info.rect.w > 0) {
    const cx = Math.round(info.rect.x + info.rect.w / 2);
    const cy = Math.round(info.rect.y + info.rect.h / 2);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 }, { sessionId: sid });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 }, { sessionId: sid });
    await new Promise((r) => setTimeout(r, 5000));
  }
  const after = await evaluateScalar<{ iframes: number; inputs: number; dlgText: string }>(cdp, sid, `JSON.parse(JSON.stringify({
    iframes: document.querySelectorAll("iframe").length,
    inputs: document.querySelectorAll("input[type=file]").length,
    dlgText: ((document.querySelector(".more-video__lib") || {}).textContent || "").replace(/\\s+/g, " ").slice(0, 150),
  }))`, { timeoutMs: 10000 });
  console.log(JSON.stringify({ events, after }, null, 2));
  await cdp.send("Page.setInterceptFileChooserDialog", { enabled: false }, { sessionId: sid }).catch(() => {});
});
