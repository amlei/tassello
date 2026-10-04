import { CdpConnection, dispatchClick, evaluateScalar, openPage, setFileInput, sleep, waitFor } from "../browser/cdp";
import type { PlatformPayload, RenderedPlatform } from "../render/renderers";
import type { SourceDraft } from "../types";

export type PublishProgress = (stage: number, progress: number, message?: string) => void;

export type PublishedPage = {
  pageUrl: string | null;
  targetId: string | null;
  /** true = 平台已代为点击发送，任务直接 success */
  autoSent?: boolean;
};

const WEIBO_HOME = "https://weibo.com";
const ZHIHU_WRITE = "https://zhuanlan.zhihu.com/write";
const ZHIHU_DRAFTS = "https://www.zhihu.com/creator/manage/creation/draft?type=pin";
const XHS_PUBLISH = "https://creator.xiaohongshu.com/publish/publish?source=official";

function jsValue(value: unknown): string {
  return JSON.stringify(value);
}

async function navigate(connection: CdpConnection, sessionId: string, url: string): Promise<void> {
  await connection.send("Page.navigate", { url }, { sessionId, timeoutMs: 20_000 });
}

async function currentUrl(connection: CdpConnection, sessionId: string): Promise<string | null> {
  try {
    return await evaluateScalar<string | null>(connection, sessionId, "location.href", 5000);
  } catch {
    return null;
  }
}

async function pageExists(
  connection: CdpConnection,
  sessionId: string,
  expression: string,
  timeoutMs = 8000,
): Promise<boolean> {
  return evaluateScalar<boolean>(connection, sessionId, expression, timeoutMs);
}

/* ---------------------------- Weibo ---------------------------- */

async function weiboReady(connection: CdpConnection, sessionId: string): Promise<void> {
  await waitFor(async () => {
    try {
      const value = await evaluateScalar<{ ready: boolean; passport: boolean }>(
        connection,
        sessionId,
        'JSON.parse(JSON.stringify({ready:!!(window.$CONFIG&&window.$CONFIG.uid),passport:location.host.includes("passport")}))',
        5000,
      );
      if (value.passport) throw new Error("微博登录态已失效，请在 Chrome 中重新登录");
      return value.ready;
    } catch (error) {
      if (error instanceof Error && error.message.includes("登录态")) throw error;
      return false;
    }
  }, 30_000);
  await sleep(1200);
}

async function fillWeiboComposer(connection: CdpConnection, sessionId: string, body: string): Promise<void> {
  const filled = await evaluateScalar<boolean>(
    connection,
    sessionId,
    `(() => {
      const text=${jsValue(body)};
      const ta=document.querySelector('textarea[placeholder*="分享"], textarea');
      const apply=(el)=>{const desc=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value");el.focus();if(desc&&desc.set)desc.set.call(el,text);else el.value=text;el.dispatchEvent(new Event("input",{bubbles:true}));};
      if(ta){apply(ta);return true;}
      const el=Array.from(document.querySelectorAll('[contenteditable="true"]')).find(e=>e.offsetHeight>20);
      if(!el)return false;el.focus();el.textContent=text;el.dispatchEvent(new InputEvent("input",{bubbles:true}));return true;
    })()`,
    8000,
  );
  if (!filled) throw new Error("未找到微博编辑器（页面结构可能变更）");
  await sleep(700);
  const verified = await evaluateScalar<boolean>(
    connection,
    sessionId,
    `(()=>{const ta=document.querySelector('textarea');if(ta)return !!ta.value;const el=Array.from(document.querySelectorAll('[contenteditable="true"]')).find(e=>e.offsetHeight>20);return !!(el&&el.textContent)})()`,
    5000,
  );
  if (!verified) throw new Error("微博编辑器拒绝了填充");
}

async function publishWeibo(
  connection: CdpConnection,
  payload: Extract<PlatformPayload, { kind: "weibo-post" | "weibo-article" }>,
  progress: PublishProgress,
): Promise<PublishedPage> {
  // 微博只有首页 composer 直发一种通道（普通微博），兼容旧 article payload
  const body = payload.body;
  const imagePaths = payload.kind === "weibo-post" ? payload.imagePaths : [];

  progress(0, 15, "打开微博");
  const page = await openPage(connection, WEIBO_HOME, { activate: true });
  progress(0, 35, "检查微博登录态");
  await weiboReady(connection, page.sessionId);

  if (imagePaths.length) {
    progress(1, 25, `交给微博上传 ${imagePaths.length} 张图片`);
    await setFileInput(connection, page.sessionId, "input[type=file]", imagePaths);
    await sleep(2500 + imagePaths.length * 1200);
    progress(1, 80, "图片已交给微博处理");
  }

  progress(2, 45, "填充微博正文");
  await fillWeiboComposer(connection, page.sessionId, body);

  // 平台发布规则：用户点过发布后必须自动发送，不弹二次确认。
  // 发送受阻（按钮禁用/点击无效）才退回人工确认。
  progress(3, 90, "自动发送");
  const sent = await waitFor(async () => {
    try {
      return await evaluateScalar<boolean>(
        connection,
        page.sessionId,
        `(()=>{const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='发送'&&!b.disabled);if(!btn)return false;btn.click();return true})()`,
        5000,
      );
    } catch {
      return false;
    }
  }, 10_000, 1500).catch(() => false);

  if (sent) {
    // 发送成功判据：composer 被清空（微博发送后重置输入框）
    const cleared = await waitFor(async () => {
      try {
        return await evaluateScalar<boolean>(
          connection,
          page.sessionId,
          '(()=>{const ta=document.querySelector(\'textarea[placeholder*="分享"]\');if(ta)return !ta.value;const el=Array.from(document.querySelectorAll(\'[contenteditable="true"]\')).find(e=>e.offsetHeight>20);return !!(el&&!el.textContent.trim())})()',
          5000,
        );
      } catch {
        return false;
      }
    }, 15_000, 1500).catch(() => false);
    if (cleared) {
      progress(3, 100, "微博已发送");
      return { pageUrl: await currentUrl(connection, page.sessionId), targetId: page.targetId, autoSent: true };
    }
  }

  progress(3, 100, "发送未确认；请在微博页面手动点击发送");
  return { pageUrl: await currentUrl(connection, page.sessionId), targetId: page.targetId };
}

/* ---------------------------- Zhihu ---------------------------- */

async function zhihuLoggedIn(connection: CdpConnection, sessionId: string): Promise<void> {
  await waitFor(async () => {
    try {
      return await evaluateScalar<boolean>(
        connection,
        sessionId,
        `(async()=>{try{const r=await fetch("https://www.zhihu.com/api/v4/me",{credentials:"include",headers:{Accept:"application/json"}});return r.status===200}catch{return false}})()`,
        8000,
      );
    } catch {
      return false;
    }
  }, 30_000, 1200).catch(() => {
    throw new Error("知乎登录态不可用，请在 Chrome 中重新登录");
  });
}

async function zhihuPinDraft(
  connection: CdpConnection,
  sessionId: string,
  body: string,
): Promise<string | null> {
  const response = await evaluateScalar<{ status: number; body: string; error?: string }>(
    connection,
    sessionId,
    `(async()=>{try{const payload={action:"pin",data:{publish:{traceId:String(Date.now())},commentsPermission:{comment_permission:"all"},extra_info:{view_permission:"all",publisher:"pc"},draft:{disabled:0},hybrid:{html:${jsValue(`<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)},textLength:${body.length}}};const r=await fetch("https://api.zhihu.com/content/drafts",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","x-requested-with":"fetch","x-xsrftoken":(document.cookie.match(/_xsrf=([^;]+)/)||[])[1]||""},body:JSON.stringify(payload)});return JSON.parse(JSON.stringify({status:r.status,body:(await r.text()).slice(0,3000)}))}catch(e){return JSON.parse(JSON.stringify({status:0,body:"",error:String(e)}))}})()`,
    20000,
  );
  const id = response.body.match(/"id"\s*:\s*"?(\d{10,25})"?/)?.[1];
  if (response.status < 200 || response.status >= 300 || !id) {
    throw new Error(`知乎想法草稿创建失败（HTTP ${response.status}）：${response.body.slice(0, 180) || response.error || ""}`);
  }
  return id;
}

async function publishZhihu(
  connection: CdpConnection,
  payload: Extract<PlatformPayload, { kind: "zhihu-article" | "zhihu-pin" }>,
  progress: PublishProgress,
): Promise<PublishedPage> {
  if (payload.kind === "zhihu-pin") {
    progress(0, 20, "打开知乎创作页");
    const page = await openPage(connection, "https://www.zhihu.com/creator", { activate: false });
    progress(0, 40, "检查知乎登录态");
    await zhihuLoggedIn(connection, page.sessionId);
    progress(1, 65, "创建知乎想法草稿");
    await zhihuPinDraft(connection, page.sessionId, payload.body);
    progress(3, 95, "打开知乎草稿箱");
    await navigate(connection, page.sessionId, ZHIHU_DRAFTS);
    await connection.send("Target.activateTarget", { targetId: page.targetId }, { timeoutMs: 5000 });
    progress(3, 100, "想法草稿已创建；请检查后手动发布");
    return { pageUrl: ZHIHU_DRAFTS, targetId: page.targetId };
  }

  progress(0, 20, "打开知乎专栏写作页");
  const page = await openPage(connection, ZHIHU_WRITE, { activate: false });
  progress(0, 40, "检查知乎登录态");
  await zhihuLoggedIn(connection, page.sessionId);

  progress(1, 60, "创建知乎文章草稿");
  const created = await evaluateScalar<{ status: number; body: string; error?: string }>(
    connection,
    page.sessionId,
    `(async()=>{try{const r=await fetch("https://zhuanlan.zhihu.com/api/articles/drafts",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","x-requested-with":"fetch","x-xsrftoken":(document.cookie.match(/_xsrf=([^;]+)/)||[])[1]||""},body:JSON.stringify({title:${jsValue(payload.title)},delta_time:0,can_reward:true})});return JSON.parse(JSON.stringify({status:r.status,body:(await r.text()).slice(0,3000)}))}catch(e){return JSON.parse(JSON.stringify({status:0,body:"",error:String(e)}))}})()`,
    20000,
  );
  let draftId: string | null = null;
  try {
    draftId = String(JSON.parse(created.body).id);
  } catch {
    draftId = created.body.match(/"id"\s*:\s*"?(\d{5,25})"?/)?.[1] ?? null;
  }
  if (created.status < 200 || created.status >= 300 || !draftId) {
    throw new Error(`知乎文章草稿创建失败（HTTP ${created.status}）：${created.body.slice(0, 180) || created.error || ""}`);
  }

  progress(1, 80, "保存文章正文");
  const patched = await evaluateScalar<{ status: number; body: string; error?: string }>(
    connection,
    page.sessionId,
    `(async()=>{try{const r=await fetch("https://zhuanlan.zhihu.com/api/articles/${draftId}/draft",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json","x-requested-with":"fetch","x-xsrftoken":(document.cookie.match(/_xsrf=([^;]+)/)||[])[1]||""},body:JSON.stringify({content:${jsValue(payload.html)},table_of_contents:false,delta_time:1,can_reward:true})});return JSON.parse(JSON.stringify({status:r.status,body:(await r.text()).slice(0,1000)}))}catch(e){return JSON.parse(JSON.stringify({status:0,body:"",error:String(e)}))}})()`,
    25000,
  );
  if (patched.status < 200 || patched.status >= 300) {
    throw new Error(`知乎草稿正文保存失败（HTTP ${patched.status}）：${patched.body.slice(0, 180)}`);
  }

  const editUrl = `https://zhuanlan.zhihu.com/p/${draftId}/edit`;
  progress(3, 95, "打开知乎文章草稿");
  await navigate(connection, page.sessionId, editUrl);
  await connection.send("Target.activateTarget", { targetId: page.targetId }, { timeoutMs: 5000 });
  progress(3, 100, "文章草稿已创建；请检查后手动发布");
  return { pageUrl: editUrl, targetId: page.targetId };
}

/* ---------------------------- Xiaohongshu ---------------------------- */

async function xhsReady(connection: CdpConnection, sessionId: string): Promise<void> {
  await waitFor(async () => {
    try {
      return await evaluateScalar<boolean>(
        connection,
        sessionId,
        `(async()=>{try{const r=await fetch("/api/galaxy/user/info",{credentials:"include"});const j=await r.json();return !!j&&j.code===0&&!!j.data}catch{return false}})()`,
        7000,
      );
    } catch {
      return false;
    }
  }, 30_000, 1200).catch(() => {
    throw new Error("小红书创作者登录态不可用，请在 Chrome 中重新登录");
  });
}

async function clickInnerText(
  connection: CdpConnection,
  sessionId: string,
  text: string,
): Promise<boolean> {
  return evaluateScalar<boolean>(
    connection,
    sessionId,
    `(()=>{const needle=${jsValue(text)};const els=Array.from(document.querySelectorAll('[role="tab"],li,div,span,button')).filter(el=>(el.textContent||"").trim()===needle&&el.offsetParent!==null&&el.children.length<=2);const el=els.at(-1);if(!el)return false;el.click();return true})()`,
    7000,
  );
}

async function enlargeViewport(connection: CdpConnection, sessionId: string): Promise<void> {
  await connection.send("Emulation.setDeviceMetricsOverride", {
    width: 1400,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  }, { sessionId });
  await sleep(700);
}

async function fillXhsForm(
  connection: CdpConnection,
  sessionId: string,
  title: string,
  body: string,
): Promise<void> {
  await waitFor(async () => pageExists(connection, sessionId, '!!document.querySelector(\'input[placeholder*="标题"]\')', 5000), 70_000, 1200);
  const titleFilled = await evaluateScalar<boolean>(
    connection,
    sessionId,
    `(()=>{const el=document.querySelector('input[placeholder*="标题"]');if(!el)return false;const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");el.focus();if(d&&d.set)d.set.call(el,${jsValue(title)});else el.value=${jsValue(title)};el.dispatchEvent(new Event("input",{bubbles:true}));return true})()`,
    7000,
  );
  if (!titleFilled) throw new Error("未找到小红书标题输入框");

  const bodyFocused = await evaluateScalar<boolean>(
    connection,
    sessionId,
    '(()=>{const el=document.querySelector(".tiptap.ProseMirror,.ProseMirror");if(!el)return false;el.focus();return document.activeElement===el})()',
    7000,
  );
  if (!bodyFocused) throw new Error("未找到小红书正文编辑器");
  const paragraphs = body.split(/\n+/).map((value) => value.trim()).filter(Boolean);
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index > 0) {
      await connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, { sessionId });
      await connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, { sessionId });
    }
    await connection.send("Input.insertText", { text: paragraph }, { sessionId });
  }
}

async function findShadowPoint(
  connection: CdpConnection,
  sessionId: string,
  text: string,
): Promise<[number, number]> {
  await connection.send("DOM.enable", {}, { sessionId });
  const doc = await connection.send<{ root?: { nodeId?: number } }>(
    "DOM.getDocument",
    { pierce: true },
    { sessionId },
  );
  const search = await connection.send<{ searchId?: string; resultCount?: number }>(
    "DOM.performSearch",
    { nodeId: doc.root?.nodeId, query: text },
    { sessionId },
  );
  if (!search.searchId || !search.resultCount) throw new Error(`未找到「${text}」按钮`);

  const nodes = await connection.send<{ nodeIds?: number[] }>(
    "DOM.getSearchResults",
    { searchId: search.searchId, fromIndex: 0, toIndex: 1 },
    { sessionId },
  );
  const nodeId = nodes.nodeIds?.[0];
  if (!nodeId) throw new Error(`未能定位「${text}」按钮`);

  const box = await connection.send<{ model?: { content?: [number, number, number, number] } }>(
    "DOM.getBoxModel",
    { nodeId },
    { sessionId },
  );
  const content = (box.model?.content ?? []) as unknown as number[];
  if (content.length < 8) throw new Error(`未能读取「${text}」按钮位置`);
  return [(content[0]! + content[4]!) / 2, (content[1]! + content[5]!) / 2];
}

async function publishXhs(
  connection: CdpConnection,
  payload: Extract<PlatformPayload, { kind: "xhs-note" | "xhs-article" }>,
  progress: PublishProgress,
): Promise<PublishedPage> {
  progress(0, 15, "打开小红书创作者中心");
  const page = await openPage(connection, XHS_PUBLISH, { activate: true });
  await enlargeViewport(connection, page.sessionId);
  progress(0, 35, "检查创作者登录态");
  await xhsReady(connection, page.sessionId);

  if (payload.kind === "xhs-note") {
    progress(1, 20, "切换到上传图文");
    if (!(await clickInnerText(connection, page.sessionId, "上传图文"))) {
      throw new Error("未找到「上传图文」入口");
    }
    progress(1, 35, `上传 ${payload.imagePaths.length} 张图片`);
    await setFileInput(connection, page.sessionId, "input[type=file].upload-input,input[type=file]", payload.imagePaths);
    await waitFor(async () => pageExists(
      connection,
      page.sessionId,
      '!!document.querySelector(\'input[placeholder*="标题"]\')',
      5000,
    ), 120_000, 1500);
    progress(1, 80, "等待小红书处理素材");
    await sleep(3000);
  } else {
    progress(1, 20, "切换到写长文");
    if (!(await clickInnerText(connection, page.sessionId, "写长文"))) {
      throw new Error("未找到「写长文」入口");
    }
  }

  progress(2, 45, "填充标题与正文");
  await fillXhsForm(connection, page.sessionId, payload.title, payload.body);

  progress(3, 65, "保存小红书草稿");
  let autoSaved = true;
  try {
    const point = await findShadowPoint(connection, page.sessionId, "暂存离开");
    await dispatchClick(connection, page.sessionId, point[0], point[1]);
  } catch {
    // Some A/B layouts expose the regular draft/save button; a filled editor should not become a failed task.
    autoSaved = await clickInnerText(connection, page.sessionId, "暂存离开");
  }

  let saved = autoSaved;
  if (autoSaved) {
    for (let index = 0; index < 15; index += 1) {
      await sleep(2000);
      saved = await evaluateScalar<boolean>(
        connection,
        page.sessionId,
        '(()=>{const text=(document.body&&document.body.innerText)||"";return /保存成功|已保存|草稿箱/.test(text)})()',
        7000,
      ).catch(() => false);
      if (saved) break;
    }
  }

  progress(
    3,
    100,
    saved
      ? "草稿已保存；请到草稿箱确认发布"
      : "编辑器已填充；自动保存入口未找到，请在页面中手动保存并发布",
  );
  return { pageUrl: XHS_PUBLISH, targetId: page.targetId };
}

export async function publishPayload(
  connection: CdpConnection,
  source: SourceDraft,
  rendered: RenderedPlatform,
  progress: PublishProgress,
): Promise<PublishedPage> {
  const payload = rendered.payload;
  if (payload.kind === "weibo-post" || payload.kind === "weibo-article") return publishWeibo(connection, payload, progress);
  if (payload.kind === "zhihu-pin" || payload.kind === "zhihu-article") return publishZhihu(connection, payload, progress);
  return publishXhs(connection, payload, progress);
}
