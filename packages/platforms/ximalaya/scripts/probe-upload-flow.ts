/* 探针 7：真实上传流程（会用测试音频！）——喂 file input，抓 Network 域请求，dump 上传后的表单 DOM。
 * 只上传，不点任何"发布/提交审核"按钮。 */
import { evaluateScalar, withPage } from "@tassello/cdp";

const FILE = process.argv[2] || "/tmp/ximalaya-test.m4a";

await withPage(
  "ximalaya",
  { url: "https://www.ximalaya.com/reform-upload/page/webCenter/upload", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await cdp.send("Network.enable", {}, { sessionId: sid });
    const requests: { url: string; method: string; status?: number }[] = [];
    // Network 域事件（会话级：本探针只开了一个页面会话）
    (cdp as unknown as { on: (method: string, handler: (p: unknown) => void) => void }).on(
      "Network.requestWillBeSent",
      (p) => {
        const { url, method } = (p as { request: { url: string; method: string } }).request;
        if (!/mermaid|sentry|\.js|\.css|\.png|\.jpg|\.webp|\.gif|\.woff|\.svg/.test(url)) {
          requests.push({ url: url.slice(0, 200), method });
        }
      },
    );
    (cdp as unknown as { on: (method: string, handler: (p: unknown) => void) => void }).on(
      "Network.responseReceived",
      (p) => {
        const { url, status } = p as { response: { url: string; status: number } };
        const hit = requests.find((r) => r.url === url.slice(0, 200));
        if (hit) hit.status = status;
      },
    );

    await new Promise((res) => setTimeout(res, 6000));
    // 喂文件
    await cdp.send("DOM.enable", {}, { sessionId: sid });
    const doc = (await cdp.send("DOM.getDocument", {}, { sessionId: sid })) as { root?: { nodeId?: number } };
    const q = (await cdp.send(
      "DOM.querySelectorAll",
      { nodeId: doc.root?.nodeId, selector: "input[type=file]" },
      { sessionId: sid },
    )) as { nodeIds?: number[] };
    const nodeId = q.nodeIds?.[0];
    if (!nodeId) throw new Error("未找到上传 file input");
    await cdp.send("DOM.setFileInputFiles", { files: [FILE], nodeId }, { sessionId: sid });
    console.log("[probe] file attached, waiting for upload...");

    // 等上传 + 表单出现
    let form = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((res) => setTimeout(res, 3000));
      form = await evaluateScalar<any>(
        cdp,
        sid,
        `(() => {
          const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          const inputs = Array.from(document.querySelectorAll("input[type=text], textarea")).filter(vis).map(i => ({ tag: i.tagName, ph: i.placeholder, name: i.name, cls: String(i.className).slice(0,50), v: (i.value||"").slice(0,30) }));
          const selects = Array.from(document.querySelectorAll("select")).filter(vis).map(s => ({ name: s.name, opts: Array.from(s.options).slice(0,5).map(o => ({ v: o.value, t: o.textContent.trim() })) }));
          const btns = Array.from(document.querySelectorAll("button, [class*=btn]")).filter(vis).map(b => ({ tag: b.tagName, cls: String(b.className).slice(0,60), t: (b.textContent||"").trim().slice(0,30) }));
          const albums = Array.from(document.querySelectorAll("[class*=album],[class*=Album]")).filter(vis).map(e => ({ cls: String(e.className).slice(0,50), t: (e.textContent||"").trim().slice(0,40) })).slice(0, 15);
          return JSON.parse(JSON.stringify({ url: location.href, inputs, selects, btns: btns.slice(0, 25), albums, text: ((document.body&&document.body.innerText)||"").slice(0, 2000) }));
        })()`,
        { timeoutMs: 15000 },
      ).catch(() => null);
      if (form && (form.inputs?.length || /标题|简介|专辑/.test(form.text || ""))) break;
    }
    console.log("FORM:", JSON.stringify(form, null, 2));
    console.log("REQUESTS:", JSON.stringify(requests.filter((r) => /upload|ximalaya\.com/.test(r.url) && !/reform-upload\/page/.test(r.url)), null, 2));
  },
);
process.exit(0);
