/* registry —— 平台能力矩阵（与原型 data.jsx 一致）+ 适配器注册表 */
import type { PlatformMeta } from "@tassello/shared";
import type { PlatformAdapter } from "./types";

export const PLATFORM_METAS: PlatformMeta[] = [
  { id: "wechat", name: "微信公众号", char: "微", color: "#07C160", link: "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&fakeid=", loginUrl: "https://mp.weixin.qq.com/", supports: ["article", "image", "video", "audio"], authMode: "cdp", autoSubmit: false, lands: "内容进这个号的草稿箱，群发要你去公众号后台点一次", status: "active" },
  // 文章（头条文章编辑器）链路已实现但产品上暂不开放——supports 不含 article，
  // weiboAdapter 内保留 publishArticle 实现，开放时把 "article" 加回即可
  { id: "weibo", name: "微博", char: "博", color: "#FF8200", link: "https://weibo.com/detail/", loginUrl: "https://weibo.com/login.php", supports: ["image", "video"], authMode: "cdp", autoSubmit: true, lands: "自动发送成一条微博", status: "active" },
  { id: "xhs", name: "小红书", char: "红", color: "#FF2442", link: "https://www.xiaohongshu.com/explore/", loginUrl: "https://creator.xiaohongshu.com/publish/publish?source=official", supports: ["article", "image", "video", "audio"], authMode: "cdp", autoSubmit: false, lands: "存为草稿（#话题 自动绑定），发布要你到创作者中心草稿箱点一次", status: "active" },
  // 2026-10-04 产品调整：即刻不再作为文章出口；适配器保留动态/图文/视频通道。
  { id: "jike", name: "即刻", char: "即", color: "#FFD400", fg: "#16130E", link: "https://web.okjike.com/originalPost/", loginUrl: "https://web.okjike.com/", supports: ["image", "video"], authMode: "cdp", autoSubmit: true, lands: "直接发一条动态", status: "active" },
  { id: "bili", name: "B站", char: "B", color: "#00A1D6", link: "https://www.bilibili.com/video/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "进投稿页，需要你确认封面与分区后提交", status: "planned" },
  { id: "x", name: "X", char: "X", color: "#16130E", link: "https://x.com/i/status/", loginUrl: "https://x.com/login", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: true, lands: "发送普通帖子/想法（最多 4 图）或单视频；X Articles 暂不接入", status: "active" },
  { id: "zhihu", name: "知乎", char: "知", color: "#0084FF", link: "https://zhuanlan.zhihu.com/p/", loginUrl: "https://www.zhihu.com/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: true, lands: "直接发一条想法（贴图）；长文走专栏文章直接发布", status: "active" },
  { id: "douban", name: "豆瓣", char: "豆", color: "#2E963D", link: "https://www.douban.com/topic/create", loginUrl: "https://www.douban.com/", supports: ["article", "image"], authMode: "cdp", autoSubmit: false, lands: "存成一条可投递小组的发言草稿（文字 / 画廊贴图 / 图文混排），附草稿链接；投递小组、收到文集和发布由你在豆瓣完成", status: "active" },
  { id: "toutiao", name: "头条号", char: "头", color: "#F04142", link: "https://www.toutiao.com/article/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "进创作栏草稿，需要你手动点发布", status: "planned" },
  { id: "baijiahao", name: "百家号", char: "百", color: "#2932E1", link: "https://baijiahao.baidu.com/s?id=", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "直接发布，发完能在百家号后台撤下", status: "planned" },
  { id: "douyin", name: "抖音", char: "抖", color: "#25F4EE", fg: "#16130E", link: "https://www.douyin.com/video/", supports: ["article", "image", "video"], authMode: "cdp", autoSubmit: false, lands: "传成草稿，发布要你在抖音里点", status: "planned" },
  // 音频四平台产品语义：一律只存草稿/填好即停，绝不代点发布（2026-10-02 真机接入，见 docs/platforms.md §2.9）
  { id: "xiaoyuzhou", name: "小宇宙", char: "宇", color: "#6E4AFF", link: "https://www.xiaoyuzhoufm.com/episode/", loginUrl: "https://podcaster.xiaoyuzhoufm.com/", supports: ["audio"], authMode: "cdp", autoSubmit: false, lands: "上传播客面板填好标题与 shownotes 后停住（平台无草稿），创建要你去小宇宙点一次「创建」", status: "active" },
  { id: "ximalaya", name: "喜马拉雅", char: "喜", color: "#F86442", link: "https://www.ximalaya.com/sound/", loginUrl: "https://studio.ximalaya.com/", supports: ["audio"], authMode: "cdp", autoSubmit: false, lands: "上传表单填好并选好专辑后停住（平台无草稿），发布要你在创作中心点一次「确认发布」", status: "active" },
  { id: "lizhi", name: "荔枝播客", char: "荔", color: "#D6336C", link: "https://www.lizhi.fm/", loginUrl: "https://nj.lizhi.fm/static/newsite/", supports: ["audio"], authMode: "cdp", autoSubmit: false, lands: "进所选播单的草稿箱，发布要你去荔枝后台点（接入中：登录态过期，重新登录后自动续探）", status: "active" },
  { id: "qingting", name: "蜻蜓FM", char: "蜻", color: "#1FA2E0", link: "https://www.qtfm.cn/programs/", loginUrl: "https://admin.qingting.fm/", supports: ["audio"], authMode: "cdp", autoSubmit: false, lands: "节目信息填好后停住（平台无草稿按钮），发布要你在蜻蜓后台点一次「发 布」", status: "active" },
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
