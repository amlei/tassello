/* 探针：专辑（频道）详情页 / 内容管理页的上传链路入口。
 * 关注：能否给「青春列车」（rss 认领、read_only:true）新建声音；file input 是否初始化即存在；
 * 标题/简介控件；专辑选择控件；保存/提交按钮。 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { withPage, evaluateScalar } from "@tassello/cdp";

const DUMP = `JSON.parse(JSON.stringify({
  url: location.href,
  bodyText: (document.body?.innerText || "").slice(0, 2500),
  links: [...document.querySelectorAll("a")].map(a => ({ href: a.getAttribute("href"), text: (a.innerText || "").trim().slice(0, 30) })).filter(l => l.text && l.href && !l.href.startsWith("javascript")).slice(0, 40),
  fileInputs: [...document.querySelectorAll("input[type=file]")].map(i => ({ accept: i.accept, cls: i.className, id: i.id, visible: !!i.offsetParent })),
  buttons: [...document.querySelectorAll("button, [class*=btn], [class*=button]")].map(b => (b.innerText || "").trim()).filter(t => t && t.length < 15).slice(0, 30),
}))`;

const r = await withPage(
  "qingting-probe",
  { url: "https://admin.qingting.fm/content/channels/530120", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 6_000));
    const p1 = await evaluateScalar(cdp, sid, DUMP, { timeoutMs: 20_000 });
    // 点「新建专辑」旁边可能的「新建声音/上传」入口前，先看内容管理页结构
    return p1;
  },
);
console.log(r);
process.exit(0);
