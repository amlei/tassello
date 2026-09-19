/* registry —— 平台能力矩阵（与原型 data.jsx 一致）+ 适配器注册表 */
import type { PlatformMeta } from "@tassello/shared";
import type { PlatformAdapter } from "./types";

export const PLATFORM_METAS: PlatformMeta[] = [
  { id: "wechat", name: "微信公众号", char: "微", color: "#07C160", link: "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&fakeid=", supports: ["article", "image", "video", "audio"], authMode: "api", autoSubmit: false, lands: "内容进这个号的草稿箱，群发要你去公众号后台点一次", status: "active" },
  // 文章（头条文章编辑器）链路已实现但产品上暂不开放——supports 不含 article，
  // weiboAdapter 内保留 publishArticle 实现，开放时把 "article" 加回即可
  { id: "weibo", name: "微博", char: "博", color: "#FF8200", link: "https://weibo.com/detail/", supports: ["image", "video"], authMode: "cdp", autoSubmit: true, lands: "自动发送成一条微博（未开通长文，正文限 500 字）", status: "active" },
  { id: "xhs", name: "小红书", char: "红", color: "#FF2442", link: "https://www.xiaohongshu.com/explore/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "进创作者中心，发完可以在小红书里继续改", status: "planned" },
  { id: "jike", name: "即刻", char: "即", color: "#FFD400", fg: "#16130E", link: "https://web.okjike.com/originalPost/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "直接发一条动态", status: "planned" },
  { id: "bili", name: "B站", char: "B", color: "#00A1D6", link: "https://www.bilibili.com/video/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "进投稿页，需要你确认封面与分区后提交", status: "planned" },
  { id: "x", name: "X", char: "X", color: "#16130E", link: "https://x.com/i/status/", supports: ["article", "image", "video"], authMode: "api", autoSubmit: false, lands: "直接发一条推文（长文走 X Article）", status: "planned" },
  { id: "zhihu", name: "知乎", char: "知", color: "#0084FF", link: "https://zhuanlan.zhihu.com/p/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "存成一篇专栏草稿，发布按钮在知乎后台", status: "planned" },
  { id: "douban", name: "豆瓣", char: "豆", color: "#2E963D", link: "https://www.douban.com/note/", supports: ["article", "image"], authMode: "cdp", autoSubmit: false, lands: "直接发成一篇日记", status: "planned" },
  { id: "toutiao", name: "头条号", char: "头", color: "#F04142", link: "https://www.toutiao.com/article/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "进创作栏草稿，需要你手动点发布", status: "planned" },
  { id: "baijiahao", name: "百家号", char: "百", color: "#2932E1", link: "https://baijiahao.baidu.com/s?id=", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "直接发布，发完能在百家号后台撤下", status: "planned" },
  { id: "douyin", name: "抖音", char: "抖", color: "#25F4EE", fg: "#16130E", link: "https://www.douyin.com/video/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "传成草稿，发布要你在抖音里点", status: "planned" },
  { id: "xiaoyuzhou", name: "小宇宙", char: "宇", color: "#6E4AFF", link: "https://www.xiaoyuzhoufm.com/episode/", supports: ["audio"], authMode: "cdp", autoSubmit: false, lands: "单集进草稿，发布要你去小宇宙创作者后台点一次", status: "planned" },
  { id: "ximalaya", name: "喜马拉雅", char: "喜", color: "#F86442", link: "https://www.ximalaya.com/sound/", supports: ["audio"], authMode: "cdp", autoSubmit: false, lands: "上传成一条声音，审核通过后才对外可见", status: "planned" },
  { id: "lizhi", name: "荔枝播客", char: "荔", color: "#D6336C", link: "https://www.lizhi.fm/", supports: ["audio"], authMode: "cdp", autoSubmit: false, lands: "进草稿箱，发布要你去荔枝后台点", status: "planned" },
  { id: "qingting", name: "蜻蜓FM", char: "蜻", color: "#1FA2E0", link: "https://www.qtfm.cn/programs/", supports: ["audio"], authMode: "cdp", autoSubmit: false, lands: "直接发成一条声音", status: "planned" },
];

export function getPlatformMeta(id: string): PlatformMeta | undefined {
  return PLATFORM_METAS.find((p) => p.id === id);
}

/* ---------- 适配器注册表（平台包在服务层启动时注册） ---------- */
/* eslint-disable @typescript-eslint/no-explicit-any */
const adapters = new Map<string, PlatformAdapter<any>>();

export function registerAdapter(adapter: PlatformAdapter<any>): void {
  const known = getPlatformMeta(adapter.meta.id);
  if (!known) throw new Error(`unknown platform id: ${adapter.meta.id}`);
  if (!known.supports.every((t) => adapter.meta.supports.includes(t))) {
    throw new Error(`platform ${adapter.meta.id}: adapter supports must cover registry supports`);
  }
  adapters.set(adapter.meta.id, adapter);
}

export function getAdapter(id: string): PlatformAdapter<any> | undefined {
  return adapters.get(id);
}

export function listAdapters(): PlatformAdapter<any>[] {
  return Array.from(adapters.values());
}
