/* data.jsx — 种子数据：类型、平台、60 篇示例稿子
   稿子数量刻意做到 60（每类 7–24），用来检验列表骨架在真实规模下还站不站得住。 */
const TYPES = {
  article: { key: "article", zh: "文章", en: "ARTICLE", color: "#2C6FF0", glyph: "文" },
  image:   { key: "image",   zh: "贴图", en: "IMAGES",  color: "#D52088", glyph: "图" },
  video:   { key: "video",   zh: "视频", en: "VIDEO",   color: "#FD8D11", glyph: "影" },
  audio:   { key: "audio",   zh: "音频", en: "AUDIO",   color: "#0EC3D4", glyph: "声" },
};
const TYPE_ORDER = ["article", "image", "video", "audio"];

const PALETTE = ["#2C6FF0", "#D52088", "#FD8D11", "#0EC3D4", "#07B56F", "#16130E"];

/*
 * 平台矩阵：每个平台声明自己的品牌色、账号状态与「支持哪些发布类型」。
 * 发布弹层只列支持当前稿子类型的平台（见 sheets.jsx）。
 *
 * supports 的来源（逐条核对，2026-09 整理）：
 *  · 微信公众号 —— 图文消息 / 图片消息（小绿书）/ 视频 / 语音；dev 文档里草稿箱只管图文消息，但后台可直发图片与视频
 *  · 小红书 —— 图文笔记 / 视频笔记 / 长文笔记（内置长文编辑器，约 6000 字）；无独立音频发布
 *  · 微博 —— 文字 + 多图 + 视频同帖；音频需转成视频，官方不支持直发音频
 *  · 即刻 —— 动态文字 / 图片 / 视频 / 音乐链接分享；不能上传音频文件
 *  · X —— 推文文字 / 图片 / 视频（语音推文只有 140 秒，音频出口不放在这里）
 *  · B站 —— 视频投稿 / 专栏文章 / 动态图文；音频分区已停止投稿（改为 BGM 投稿）
 *  · 知乎 —— 文章（专栏）/ 想法（图文）/ 视频；官方不支持上传音频
 *  · 豆瓣 —— 日记（长文）/ 广播与相册（图文）；不支持直发视频与音频
 *  · 头条号 —— 创作栏含 文章 / 视频 / 微头条 / 问答（自家也有音频，但音频出口统一交给播客平台）
 *  · 百家号 —— 图文 / 图集 / 视频 / 动态 / 直播（同上：音频不列）
 *  · 抖音 —— 视频 / 图文；2025 年底上线长图文（文章，最多 8000 字、30 图）；音频只作背景音
 *  · 小宇宙 / 喜马拉雅 / 荔枝播客 / 蜻蜓FM —— 音频出口：收声音（喜马拉雅在自家后台另有视频形态，
 *    但对本工作台只当音频目的地用），因此 supports 只写 audio
 *
 * 一条产品判断：音频＝播客，所以「audio」只留给播客平台与微信公众号（语音），
 * 综合平台的音频能力（X 语音推文、头条音频、百家号音频）不在这里当出口。
 *
 * state：账号凭据的获取状态 —— ok = 已获取，fail = 获取失败（可重新获取）
 * account：拿到的是哪个账号 —— 「已获取」本身说明不了会发到哪儿，
 *   所以每个平台都带上账号名、身份、ID、授权有效期、最近校验时间，
 *   以及一句「发布去处」：点发布之后，内容究竟落到那个账号的哪里。
 *   获取失败的平台 account 为 null，accountError 说明为什么。
 * link：发布成功后的回执地址前缀（原型不对接真实平台，只演示这一处信息）
 */
const PLATFORMS = [
  { id: "wechat",    name: "微信公众号", char: "微", color: "#07C160", state: "ok",   link: "mp.weixin.qq.com/s/",        supports: ["article", "image", "video", "audio"],
    account: { name: "九漾小记", kind: "订阅号", uid: "gh_3f9a2c7d", until: "2026-12-31", checked: "09-16 14:52", lands: "内容进这个号的草稿箱，群发要你去公众号后台点一次" } },
  { id: "xhs",       name: "小红书",     char: "红", color: "#FF2442", state: "ok",   link: "www.xiaohongshu.com/explore/", supports: ["article", "image", "video"],
    account: { name: "九漾 Onda", kind: "个人号", uid: "小红书号 8823456712", until: "2026-11-30", checked: "09-16 09:12", lands: "直接发成一篇笔记，发完可以在小红书里继续改" } },
  { id: "weibo",     name: "微博",       char: "博", color: "#FF8200", state: "ok",   link: "weibo.com/detail/",          supports: ["article", "image", "video"],
    account: { name: "九漾Onda", kind: "个人认证", uid: "UID 5f2c91a4", until: "2027-01-15", checked: "09-15 20:41", lands: "直接发一条微博（这个号没开长文，正文限 500 字）" } },
  { id: "jike",      name: "即刻",       char: "即", color: "#FFD400", fg: "#16130E", state: "ok", link: "web.okjike.com/originalPost/", supports: ["article", "image", "video"],
    account: { name: "九漾", kind: "个人号", uid: "即刻 ID 9A3F7C", until: "2026-10-20", checked: "09-14 11:03", lands: "直接发一条动态" } },
  { id: "bili",      name: "B站",        char: "B",  color: "#00A1D6", state: "fail", link: "www.bilibili.com/video/",    supports: ["article", "image", "video"], lands: "进投稿页，需要你确认封面与分区后提交",
    account: null, accountError: "账号已掉线（08-30），请重新登录 B站" },
  /* X 是单色品牌：品牌色跟主题翻转（亮色黑标 / 深色白标），见 index.html 的 --plat-x */
  { id: "x",         name: "X",          char: "X",  color: "var(--plat-x)", fg: "var(--plat-x-fg)", state: "fail", link: "x.com/i/status/",            supports: ["article", "image", "video"], lands: "直接发一条推文（长文走 X Article）",
    account: null, accountError: "账号连接已被 X 取消，请重新登录" },
  { id: "zhihu",     name: "知乎",       char: "知", color: "#0084FF", state: "ok",   link: "zhuanlan.zhihu.com/p/",      supports: ["article", "image", "video"],
    account: { name: "九漾 Onda", kind: "机构号授权", uid: "zhuanlan.zhihu.com/people/onda", until: "2026-12-08", checked: "09-16 08:30", lands: "存成一篇专栏草稿，发布按钮在知乎后台" } },
  { id: "douban",    name: "豆瓣",       char: "豆", color: "#2E963D", state: "ok",   link: "www.douban.com/note/",       supports: ["article", "image"],
    account: { name: "九漾", kind: "个人号", uid: "豆瓣 ID 197364821", until: "2026-11-11", checked: "09-13 19:22", lands: "直接发成一篇日记" } },
  { id: "toutiao",   name: "头条号",     char: "头", color: "#F04142", state: "ok",   link: "www.toutiao.com/article/",   supports: ["article", "image", "video"],
    account: { name: "九漾 Onda", kind: "头条号", uid: "头条号 ID 1736…", until: "2026-12-20", checked: "09-16 10:15", lands: "进创作栏草稿，需要你手动点发布" } },
  { id: "baijiahao", name: "百家号",     char: "百", color: "#2932E1", state: "ok",   link: "baijiahao.baidu.com/s?id=",  supports: ["article", "image", "video"],
    account: { name: "九漾Onda", kind: "百家号", uid: "百家号 ID 9f3c…", until: "2027-02-01", checked: "09-16 10:20", lands: "直接发布，发完能在百家号后台撤下" } },
  { id: "douyin",    name: "抖音",       char: "抖", color: "#25F4EE", fg: "#16130E", state: "ok", link: "www.douyin.com/video/", supports: ["article", "image", "video"],
    account: { name: "九漾 Onda", kind: "企业号", uid: "抖音号 onda2026", until: "2026-10-05", checked: "09-12 16:40", lands: "传成草稿，发布要你在抖音 App 里点" } },
  /* 四个音频出口：只收声音，不收图文/视频 —— 音频稿的发布面就是靠它们撑起来的 */
  /*
   * 账号 → 频道：播客/音频平台的一个账号底下往往不止一个发布目标 ——
   * 小宇宙一个账号可以有多个播客节目，喜马拉雅一个主播号可以有多个专辑，
   * 荔枝播客一个账号可以有多个播单。凭据挂在账号上，发布目标落在频道上：
   * 单频道的平台（荔枝 / 蜻蜓）发布时不用选；多频道的平台发布弹层里要挑一个频道。
   */
  { id: "xiaoyuzhou", name: "小宇宙",    char: "宇", color: "#6E4AFF", state: "ok",   link: "www.xiaoyuzhoufm.com/episode/", supports: ["audio"],
    account: { name: "九漾电台", kind: "播客", uid: "小宇宙 ID onda", until: "2027-03-01", checked: "09-16 11:02", lands: "单集进所选节目的草稿，发布要你去小宇宙创作者后台点一次",
      channels: [
        { id: "xyz-radio", name: "九漾电台", uid: "小宇宙节目 ID onda", items: "EP.01 – EP.12" },
        { id: "xyz-talk",  name: "九漾闲聊", uid: "小宇宙节目 ID onda-talk", items: "Vol.01 – Vol.07" },
      ] } },
  { id: "ximalaya",  name: "喜马拉雅",   char: "喜", color: "#F86442", state: "ok",   link: "www.ximalaya.com/sound/",       supports: ["audio"],
    account: { name: "九漾 Onda", kind: "主播号", uid: "喜马拉雅 ID 3f9c…", until: "2026-12-15", checked: "09-16 11:05", lands: "上传到所选专辑，成为一条待审核的声音",
      channels: [
        { id: "xm-onda",  name: "九漾 Onda", uid: "专辑 ID 3f9c01", items: "128 条声音" },
        { id: "xm-noise", name: "白噪音收藏夹", uid: "专辑 ID 3f9c02", items: "34 条声音" },
      ] } },
  { id: "lizhi",     name: "荔枝播客",     char: "荔", color: "#D6336C", state: "ok",   link: "www.lizhi.fm/",                supports: ["audio"],
    account: { name: "九漾电台", kind: "播客号", uid: "荔枝 ID lz8823", until: "2026-11-20", checked: "09-16 11:08", lands: "进草稿箱，发布要你去荔枝后台点",
      channels: [
        { id: "lz-main", name: "九漾电台", uid: "荔枝播单 lz8823", items: "56 期" },
      ] } },
  { id: "qingting",  name: "蜻蜓FM",     char: "蜻", color: "#1FA2E0", state: "ok",   link: "www.qtfm.cn/programs/",        supports: ["audio"],
    account: { name: "九漾 Onda", kind: "主播号", uid: "蜻蜓 ID qtf_39a2", until: "2027-01-08", checked: "09-16 11:12", lands: "上传到所选专辑，成为一条待审核的声音",
      /* 蜻蜓FM 后台同样是「专辑管理」结构：一个主播号可建多个专辑，
         还能认领 rss 节目 / podcast 托管 —— 频道与账号同样要分开 */
      channels: [
        { id: "qt-train", name: "青春列车", uid: "蜻蜓专辑 · rss 内容", items: "20 集" },
        { id: "qt-main",  name: "九漾 Onda", uid: "蜻蜓专辑 qtf_39a2", items: "89 条声音" },
      ] } },
];

/** 这个平台收不收这种稿子 */
function supportsType(platform, type) {
  return platform.supports.indexOf(type) >= 0;
}

/* 图片素材带稳定 id：正文里用 ![说明](asset://id) 引用，拖拽换位不会指错图 */
let assetSeq = 0;
function asset(color) {
  assetSeq += 1;
  return { id: "a" + assetSeq, color };
}
/* 一组色块素材：贴图 / 视频封面的缩略条用它拼 */
function shots(colors) {
  return colors.map((c) => asset(c));
}

/* 默认发布平台：按稿子类型各一份名单，发布时自动点亮（可在「默认平台」里改） */
const DEFAULT_TARGETS = {
  article: ["wechat", "xhs"],
  image: ["xhs", "jike"],
  video: ["douyin", "bili"],
  audio: ["wechat", "xiaoyuzhou"],
};

/* 这个平台账号底下有几个发布目标：单频道平台发布时不用选 */
function channelsOf(platform) {
  const list = platform.account && platform.account.channels;
  return list && list.length ? list : null;
}

/* 发布成功后的回执链接 */
function platformLink(platformId, token) {
  const p = PLATFORMS.find((x) => x.id === platformId);
  return (p && p.link ? p.link : "example.com/") + (token || "00000000");
}
function newToken() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

const STAGES = ["渲染排版", "上传素材", "填充编辑器", "人工确认"];

/* 色板别名：写素材时用两个字母，比六个十六进制好认 */
const K_BLUE = "#2C6FF0", K_MAGENTA = "#D52088", K_ORANGE = "#FD8D11", K_CYAN = "#0EC3D4", K_GREEN = "#07B56F", K_INK = "#16130E", K_PALE = "#8FB8FF";

/*
 * 稿子没有「发布状态」字段：发布事实全部记在任务队列里（见 app.jsx 的 tasks）。
 * 稿子只描述内容本身 —— 类型、标题、正文、素材、更新时间。
 */
const POSTS = [
  /* ---------- 文章 · 18 ---------- */
  {
    id: "a1", type: "article", updated: "09-12 14:02",
    title: "为什么我们团队在周五下午不发版",
    body: "上周五下午四点，运维群里有人发了一张截图：支付服务的错误率曲线像被人踩了一脚，直直地竖了起来。半小时后定位到原因——一个本该下周一才合入的变更，被提前带上了线。\n\n这不是第一次了。我们复盘了过去一年的十七次线上事故，发现其中六次发生在周五下午三点之后。不是大家周五状态不好，而是周五发版这件事本身就不划算：改动的收益要等下周一才能被用户感知，但风险却要整个周末来承担。#工程文化\n\n现在我们定了三条规矩。第一，周五下午只许发文档和配置回滚，不许发代码。第二，谁要在周五发版，谁就自己留在群里值守到周日晚上。第三，所有「紧急修复」必须由两个人同时确认它真的紧急——后来发现，九成五的「紧急」都可以等到周一。#发布纪律\n\n规矩实行了四个月，周末的告警量下降了七成。省下来的不只是睡眠时间，还有整个团队对「上线」这件事的信任感。\n\n![配图](asset://a1)\n\n顺带说一个意料之外的变化：不发版的周五下午，慢慢变成了团队的「慢时间」。有人整理这周的技术债清单，有人写复盘文档，有人把积了很久的代码评审一次清完。起初我担心效率会掉，结果迭代速度反而快了一点——大概是因为没人再需要在周日晚上抱着电脑回滚版本，周一早上的站会也没人顶着黑眼圈了。\n\n如果你所在的团队也有类似的习惯，欢迎把这条转给那个总在周五下午说「就改一行，应该没事」的同事。一行也是改动，改动就有概率，概率落到周末头上，就是一整个周末。",
    images: shots([K_PALE]),
  },
  {
    id: "a2", type: "article", updated: "09-10 21:44",
    title: "把菜园搬上天台：三个月的试错记录",
    body: "六月初我在天台上摆了十二个种植箱，信心满满地以为秋天就能实现番茄自由。三个月过去，收获是：十一个被晒蔫的空盆，和一盆活得很好的薄荷。\n\n教训按顺序排列如下。首先，天台的风比地面大得多，幼苗期不挡风就是送死。其次，西晒的墙面会把下午的温度再抬高五度，我量过，箱体表面能到四十六度。第三，自动滴灌的定时器一定要买双备份电池的，我的那一套在七月最热的那周停了四天，回来的时候土已经硬得像砖。#天台菜园\n\n九月初我重新来过：全部换成耐热的空心菜和红薯叶，箱子挪到女儿墙背风的一侧，早晚两次手动浇水。两周后，第一茬空心菜上了桌。分量不多，但夹起来的那一筷子，确实比超市买的要脆。#番茄 计划留到明年春天，这次我打算先请教楼下种了十年菜的陈伯。",
  },
  {
    id: "a3", type: "article", updated: "09-12 09:24",
    title: "一个按钮的位置，我们争论了三个星期",
    body: "争论的焦点是「新建」到底该放在左上角还是右上角。支持左上的人说，阅读顺序从左到右，动作应该在手最先到达的地方；支持右上的人说，全公司所有的后台都在右上角。\n\n最后我们没有靠投票解决，而是去翻了两个月的点击热图：绝大多数人打开页面后第一眼看的是列表内容，新建按钮一天只被点十七次。争论的三个星期里，真正该解决的问题是列表太长、找不到昨天写的东西。#产品设计\n\n按钮最后留在了右上角，我们把省下来的时间用来做搜索。",
  },
  {
    id: "a4", type: "article", updated: "09-11 11:08",
    title: "从 0 到 1 做内部工具的五个坑",
    body: "第一个坑是把内部工具当成小项目：它没有上线日，只有长期维护，第一个月的代码只占总成本的十分之一。第二个坑是照着外部产品的样子做，内部工具的用户没有选择权，也没有耐心。\n\n第三个坑是权限模型。我们第一版只做了两级，第三个月就不得不在所有查询里打补丁。第四个坑是没有导出，用户迟早要把数据搬走。第五个坑最贵：没有把「谁在用」记录下来，工具做得再好，也没法向别人解释它值多少。#工程文化",
  },
  {
    id: "a5", type: "article", updated: "09-09 16:31",
    title: "我们为什么把客服入口砍掉一半",
    body: "客服页面上原本有七个入口：在线客服、工单、电话、邮件、帮助中心、社区、以及一个几乎没人点过的「联系商务」。我们统计了三个月的会话来源，前三个入口承担了 94% 的量。\n\n砍掉之后最直接的变化是响应时间：分流少了，工单从平均四小时压到一小时二十分。次要变化是帮助中心的访问量涨了，因为没得选的时候，人会去读文档。#服务设计",
  },
  {
    id: "a6", type: "article", updated: "09-08 10:12",
    title: "数据看板没人看？先问问它回答了什么问题",
    body: "我们做过一个很漂亮的大屏，上线那天拍了照，此后再没有人打开过。复盘时发现，它把二十四个指标平铺在一起，没有回答任何一个具体问题。\n\n第二版只保留了三个问题：今天有没有异常、异常出在哪个环节、谁在处理。指标从二十四个减到九个，打开率从每周三次涨到每天十一次。#数据",
  },
  {
    id: "a7", type: "article", updated: "09-07 20:55",
    title: "给实习生做的一次代码评审，我改了什么",
    body: "他提交了一个四百行的改动，逻辑是对的，但我要他在评审里拆成五次提交。第一版只有数据结构，第二版加上读取，第三版接上写入口，第四版补测试，第五版改命名。\n\n拆开之后他自己发现了两个问题，那是我原本准备在评审里指出的。评审的价值不在于我说了什么，而在于他能在多小的改动里看清自己在做什么。",
  },
  {
    id: "a8", type: "article", updated: "09-05 09:40",
    title: "把小团队的技术债清单公开之后",
    body: "我们把二十三条技术债写进了内部文档，每条标注影响面和修复成本，并且公开了「这一季度我们打算还哪五条」。\n\n意外的是，产品同学开始主动把需求排在还债之后，因为他们第一次看见「不还这笔债，下一个功能要多花两周」。#技术债\n\n公开的代价是承认自己欠了债。但欠债这件事，本来就藏不住。",
  },
  {
    id: "a9", type: "article", updated: "09-03 15:20",
    title: "一千个用户之后的三个判断错误",
    body: "我们以为用户会按类型整理内容，实际上他们按时间找东西。我们以为导出是低频功能，实际上它是留存最高的功能之一。我们以为新用户需要引导，实际上他们更需要一个空状态里的例子。\n\n这三个错误有一个共同点：都是我们在没有数据的时候，替用户做的一个体面的假设。",
  },
  {
    id: "a10", type: "article", updated: "09-01 19:02",
    title: "会议纪要为什么总是没人读",
    body: "因为纪要在记录「谁说了什么」，而读者想知道的是「我要做什么」。我们把模板从「发言要点」改成「结论 / 待办 / 未决」，待办一行一条，标明人和截止日。\n\n模板改了之后，纪要的打开率变化不大，但待办被认领的比例从一半涨到了八成。#协作",
  },
  {
    id: "a11", type: "article", updated: "08-30 11:26",
    title: "重新设计 onboarding：把七步压成三步",
    body: "原来的引导有七步，第四步是「设置通知偏好」。我们在这一步丢了 38% 的人。\n\n新版本只留三步：创建第一个内容、连接一个平台、发布。通知偏好挪到设置里，需要的时候再说。完成率从 42% 到 71%。",
  },
  {
    id: "a12", type: "article", updated: "08-28 14:47",
    title: "为什么我们把设计稿从 Figma 搬回了代码",
    body: "不是 Figma 不好，是我们的组件已经沉淀在代码里了。设计稿上每个状态都要画一遍，代码里改一个 token 就全变了。\n\n现在的做法是：视觉探索在 Figma，交付直接在代码里改，设计稿只用于评审和留档。#设计工程化",
  },
  {
    id: "a13", type: "article", updated: "08-26 08:33",
    title: "关于「效率工具」的一点反思",
    body: "我们用过的效率工具，有一半在半年内被弃用。原因大致相同：它要求我们先改变习惯，才能得到收益。\n\n真正留下来的那几个，都是先替我们承担了一件事，然后习惯自己长出来的。",
  },
  {
    id: "a14", type: "article", updated: "08-24 17:09",
    title: "用户访谈里最容易问错的一句话",
    body: "「你觉得这个功能怎么样」——这句话问出来，得到的都是礼貌。改成「上一次遇到这个问题时，你做了什么」，才能听到行为。\n\n我们把访谈脚本里的所有「你觉得」都删掉了，换成具体的时间点、地点和动作。#用户研究",
  },
  {
    id: "a15", type: "article", updated: "08-22 13:15",
    title: "把定价页改了一版，转化率动了 18%",
    body: "改动很小：把三个套餐的名字从「基础 / 专业 / 旗舰」换成「一个人 / 小团队 / 整个公司」，并在中间那档下面加了一行「选这档的人最多」。\n\n名字让人知道自己在哪一档，那一行让人不必做决定。转化率的提升主要来自中间那档。",
  },
  {
    id: "a16", type: "article", updated: "08-20 10:04",
    title: "内部文档的三条死法",
    body: "第一条是没人知道它在哪。第二条是知道在哪，但内容已经过期。第三条是内容没过期，但没人敢改。\n\n我们现在的规矩很简单：每篇文档顶部写明负责人和最后核对日期，过期的直接删掉，不留「历史版本」。",
  },
  {
    id: "a17", type: "article", updated: "08-18 21:38",
    title: "我做错的一次技术选型",
    body: "两年前我选了当时最流行的一套框架，理由是社区活跃、招人好招。半年后我们发现，团队里真正会用它的只有两个人。\n\n能招到人，不等于你的团队现在能用起来。第二次我选了更笨的那一套，代价是性能差一点，收益是所有人都能改。",
  },
  {
    id: "a18", type: "article", updated: "08-15 09:12",
    title: "远程协作两年后，我们留下哪些习惯",
    body: "留下来的：所有决策写下来、会议默认录屏、文档先于会议。丢掉的：每日站会、在线白板、任何需要同时在线才能推进的流程。\n\n远程最贵的成本是同步，我们花了两年时间，把同步从默认选项变成了例外。",
  },

  /* ---------- 贴图 · 24 ---------- */
  {
    id: "i1", type: "image", updated: "09-11 19:26",
    title: "巷口修表铺的一天",
    body: "早上八点半，老周拉开卷帘门，先把那只玻璃柜台擦一遍。柜子里躺着三百多块表，最老的一块是 1962 年的上海牌。\n\n上午来的都是熟客，换电池、截表带，五分钟一单。下午两点，一个年轻人拿来一块停了十年的旧表，说是爷爷留下的。老周对着台灯拆开看了一眼，说机芯还能救，要三天。\n\n我蹲在门口拍了一整天，挑出这六张。#街头摄影 #老店 #城市记忆",
    images: shots([K_MAGENTA, K_ORANGE, K_BLUE, K_CYAN, K_GREEN, K_INK]),
  },
  {
    id: "i2", type: "image", updated: "09-09 08:15",
    title: "白露之后的云",
    body: "白露一过，云的形状就变了。夏天那种一大团一大团垒起来的积雨云不见了，换成一丝一丝、一层一层的，像有人拿刷子蘸了牛奶在蓝布上抹开。\n\n这四张都是下班路上用手机拍的，没修图。最好的一张是在天桥上等红灯的时候，前后只有十几秒。#云 #手机摄影 #白露",
    images: shots([K_CYAN, K_BLUE, K_PALE, K_ORANGE]),
  },
  {
    id: "i3", type: "image", updated: "09-12 06:40",
    title: "早晨六点的菜市场",
    body: "摊主们比顾客先到两小时，灯是一盏一盏亮起来的。拍到第三张的时候有人问我是不是记者，我说不是，就是想拍。#菜市场 #清晨",
    images: shots([K_ORANGE, K_GREEN, K_INK, K_MAGENTA, K_CYAN]),
  },
  {
    id: "i4", type: "image", updated: "09-11 15:02",
    title: "写字楼里的绿植角落",
    body: "同一层楼有十一个绿植角，养得最好的是茶水间旁边那个。浇水的是一位保洁阿姨，她说植物和地毯一样，有人管就不一样。#办公室",
    images: shots([K_GREEN, K_GREEN, K_CYAN]),
  },
  {
    id: "i5", type: "image", updated: "09-10 20:18",
    title: "雨天便利店门口",
    body: "雨伞桶满了，门口的塑料地垫湿了一片。有人在屋檐下等雨小一点，等了二十分钟，最后买了一把伞。#雨 #城市",
    images: shots([K_BLUE, K_CYAN, K_PALE, K_INK]),
  },
  {
    id: "i6", type: "image", updated: "09-10 09:35",
    title: "老小区的伸缩晾衣架",
    body: "这种架子是这片小区的公共语言：伸出来代表今天有太阳，收回去代表主人不在家。#老小区 #生活",
    images: shots([K_PALE, K_ORANGE, K_BLUE]),
  },
  {
    id: "i7", type: "image", updated: "09-09 23:12",
    title: "地铁末班车上的十张脸",
    body: "末班车上的人不玩手机，几乎都在发呆。拍到第七张的时候我自己也困了。#通勤 #夜景",
    images: shots([K_INK, K_BLUE, K_MAGENTA, K_CYAN]),
  },
  {
    id: "i8", type: "image", updated: "09-08 17:44",
    title: "工地围挡上的涂鸦",
    body: "围挡换了一茬又一茬，画在上面的东西比工地本身活得更久。#涂鸦 #城市",
    images: shots([K_ORANGE, K_MAGENTA, K_GREEN]),
  },
  {
    id: "i9", type: "image", updated: "09-08 10:20",
    title: "一杯手冲的四分钟",
    body: "从磨豆到滴完，四分钟，拍了十二张。最好的一张是水柱接触粉层的那一秒。#咖啡 #手冲",
    images: shots([K_ORANGE, K_INK, K_PALE]),
  },
  {
    id: "i10", type: "image", updated: "09-07 14:03",
    title: "楼下理发店的价目表",
    body: "价目表是手写的，改过三次价格，每一次都用新纸贴在旧纸上。老板说这样看得见年头。#小店",
    images: shots([K_MAGENTA, K_ORANGE, K_BLUE, K_GREEN]),
  },
  {
    id: "i11", type: "image", updated: "09-07 08:51",
    title: "城市里的蓝色",
    body: "同一个下午，我在两公里内找到了十一种蓝色：卷帘门、共享单车、广告牌、塑料凳、外卖箱。#颜色收集",
    images: shots([K_BLUE, K_BLUE, K_PALE, K_CYAN, K_BLUE]),
  },
  {
    id: "i12", type: "image", updated: "09-06 21:30",
    title: "夏夜大排档",
    body: "塑料凳、折叠桌、裸露的灯泡。九点之后才是最热闹的时候。#夜宵 #夏天",
    images: shots([K_ORANGE, K_MAGENTA, K_INK]),
  },
  {
    id: "i13", type: "image", updated: "09-06 16:12",
    title: "图书馆闭馆前的半小时",
    body: "八点半广播响第一次，没人动。八点五十响第二次，才开始有人收拾东西。#图书馆",
    images: shots([K_PALE, K_INK, K_BLUE]),
  },
  {
    id: "i14", type: "image", updated: "09-05 18:40",
    title: "天台上的水塔和晾衣绳",
    body: "爬到顶楼才发现，天台上有一套完整的秩序：哪根绳子属于哪一户，水塔下面哪块阴凉是谁的。#天台",
    images: shots([K_CYAN, K_ORANGE, K_PALE, K_INK]),
  },
  {
    id: "i15", type: "image", updated: "09-05 11:05",
    title: "街边的修鞋摊",
    body: "工具摊开在一块布上，每样东西都有固定位置。老师傅说，找东西的时间比干活的时间长，所以东西不能乱。#手艺",
    images: shots([K_INK, K_ORANGE, K_MAGENTA]),
  },
  {
    id: "i16", type: "image", updated: "09-04 22:15",
    title: "便利店夜班",
    body: "凌晨一点到三点，进来的人平均每分钟说不到三个字。收银的姑娘把每一句「谢谢」都说得很清楚。#夜班",
    images: shots([K_GREEN, K_INK, K_CYAN]),
  },
  {
    id: "i17", type: "image", updated: "09-04 13:28",
    title: "公园长椅上的午睡",
    body: "同一条长椅上，三个人相隔两米，各自睡着，包都抱在怀里。#公园",
    images: shots([K_GREEN, K_PALE, K_ORANGE]),
  },
  {
    id: "i18", type: "image", updated: "09-03 19:50",
    title: "胡同口的猫",
    body: "它在同一块石阶上待了四十分钟，姿势没变过，只有尾巴尖在动。#猫",
    images: shots([K_ORANGE, K_INK, K_MAGENTA, K_GREEN]),
  },
  {
    id: "i19", type: "image", updated: "09-03 09:07",
    title: "冬日暖气片上的手套",
    body: "拍摄于去年一月，翻相册翻到的。手套是湿的，暖气片是热的，窗户上有一层雾。#冬天",
    images: shots([K_PALE, K_CYAN]),
  },
  {
    id: "i20", type: "image", updated: "09-02 17:33",
    title: "篮球场的黄昏",
    body: "六点半之后灯亮了，影子被拉长一倍。这个时候场上的人最多，也最不愿意走。#黄昏",
    images: shots([K_ORANGE, K_INK, K_MAGENTA]),
  },
  {
    id: "i21", type: "image", updated: "09-02 10:44",
    title: "花市收摊",
    body: "卖不掉的花会被捆成一束，十块钱三束。收摊的人比买花的人更懂花。#花市",
    images: shots([K_MAGENTA, K_GREEN, K_ORANGE, K_CYAN]),
  },
  {
    id: "i22", type: "image", updated: "09-01 15:21",
    title: "自行车棚的光",
    body: "下午四点，阳光从棚顶的缝隙里漏下来，落在同一排车的车把上。#光",
    images: shots([K_INK, K_PALE, K_BLUE]),
  },
  {
    id: "i23", type: "image", updated: "08-31 08:19",
    title: "出租屋的窗台",
    body: "三盆植物，一盆是真的，两盆是假的。搬进来的时候房东留下的，现在假的比真的活得久。#房间",
    images: shots([K_GREEN, K_ORANGE, K_PALE]),
  },
  {
    id: "i24", type: "image", updated: "08-30 17:58",
    title: "江边的钓鱼人",
    body: "六个人，十一条鱼竿，一个下午。收竿的时候聊得最多的一句话是「明天再来」。#江边",
    images: shots([K_CYAN, K_BLUE, K_INK, K_ORANGE]),
  },

  /* ---------- 视频 · 11 ---------- */
  {
    id: "v1", type: "video", updated: "09-12 11:37", duration: "03:12", durationSec: 192,
    title: "三分钟讲清「公摊面积」",
    body: "电梯井、楼梯间、大堂、设备房——你买的每一平米里，都有一部分是这些。这条视频用一栋真实楼盘的竣工图，把公摊系数是怎么算出来的、哪些算得合理哪些是浑水摸鱼，一次讲清楚。\n\n片尾附了一张自测表，买房前对着户型图自己就能算个大概。#房产 #科普 #公摊面积",
  },
  {
    id: "v2", type: "video", updated: "09-08 22:03", duration: "05:47", durationSec: 347,
    title: "给猫做了一个人体工学键盘托",
    body: "只要我一开电脑，我家猫就必须趴在键盘上。既然拦不住，那就顺着它：我量了它趴卧时的肩高和舒展长度，用白蜡木做了一个架空在键盘上方的「猫体工学托板」，下面照常打字，上面给它趴。\n\n制作过程四分半，猫的验收环节在片尾，它给出了五分制里的四点五分——扣的半分是因为托板边缘没有磨圆，它蹭脸的时候皱眉了。#手工 #猫 #木工",
  },
  {
    id: "v3", type: "video", updated: "09-11 20:14", duration: "08:36", durationSec: 516,
    title: "十分钟装好一个家庭 NAS",
    body: "从拆箱到手机能访问，全程无剪辑。踩到的坑有两个：硬盘托架的螺丝是反牙，路由器的端口转发要重启才生效。#数码 #NAS",
  },
  {
    id: "v4", type: "video", updated: "09-10 16:52", duration: "06:20", durationSec: 380,
    title: "用废木料做一个书架",
    body: "木料是上次做桌子剩下的，只买了两根横撑。整个过程四次打孔、两次打磨、一遍木蜡油。#木工 #收纳",
  },
  {
    id: "v5", type: "video", updated: "09-09 12:05", duration: "11:48", durationSec: 708,
    title: "我在县城开的第二家店",
    body: "第一家店活了三年，第二家开在离它八百米的地方。这条片子讲了选址、进货和为什么不涨价。#生意 #县城",
  },
  {
    id: "v6", type: "video", updated: "09-07 21:26", duration: "07:02", durationSec: 422,
    title: "菜市场里的经济学",
    body: "同一条街上的两家菜摊，一家永远排队，一家永远闲。差别在三个地方：标价方式、找零速度、以及什么时候打折。#经济学 #菜市场",
  },
  {
    id: "v7", type: "video", updated: "09-05 13:41", duration: "04:55", durationSec: 295,
    title: "手把手：把旧手机变成行车记录仪",
    body: "需要的只有一部旧手机、一个支架、一个常供电的充电口。重点讲了两件事：怎么防止过热关机，以及怎么自动删掉旧片段。#数码 #DIY",
  },
  {
    id: "v8", type: "video", updated: "09-03 20:07", duration: "09:14", durationSec: 554,
    title: "一个人的年夜饭",
    body: "四个菜，一个汤，做多了。拍的时候在想，一个人吃饭这件事，难的不是做饭，是决定做几个菜。#年夜饭",
  },
  {
    id: "v9", type: "video", updated: "09-01 18:22", duration: "06:48", durationSec: 408,
    title: "三天学会蛙泳的笨办法",
    body: "第一天只在浅水区练换气，第二天绑浮板练腿，第三天去掉浮板。三天都是同一个动作重复。#游泳 #教学",
  },
  {
    id: "v10", type: "video", updated: "08-29 15:36", duration: "05:12", durationSec: 312,
    title: "为什么你的咖啡总是苦的",
    body: "三个最常见的原因：水温太高、磨得太细、萃取时间太长。片子用水温计和计时器把这三件事演示了一遍。#咖啡",
  },
  {
    id: "v11", type: "video", updated: "08-27 09:58", duration: "12:30", durationSec: 750,
    title: "从零搭一个阳台菜园",
    body: "四平米的阳台，十二个种植袋。这条片子按时间顺序拍了三个月，包括失败的两次。#种植 #阳台",
  },

  /* ---------- 音频 · 7 ---------- */
  {
    id: "p1", type: "audio", updated: "09-11 23:51", duration: "38:20", durationSec: 2300,
    title: "EP.12 和夜班出租车司机聊一座城市的背面",
    body: "这期嘉宾是开了十九年夜班的出租车司机王师傅。我们聊了他眼中的城市时刻表：凌晨一点的代驾、三点的水产市场、四点半的第一班机场线。\n\n他说夜班司机有个不成文的默契，谁在机场排队区睡着了，后面的人会按两声喇叭把他叫醒，「不能让客人等」。#播客 #城市 #夜班",
  },
  {
    id: "p2", type: "audio", updated: "09-06 07:40", duration: "12:05", durationSec: 725,
    title: "雨声采样：梅雨季的窗台",
    body: "今年梅雨录了二十多个小时，剪出这十二分钟：前半段是雨点打在遮雨棚上的密集鼓点，六分四十秒之后雨势转小，能听见水珠顺着窗沿滴进楼下铁皮桶的声音，笃、笃、笃，间隔越来越长。\n\n适合当工作背景音。建议音量不要开太大，雨声的美妙之处在于「几乎听不见」。#环境音 #白噪音 #梅雨",
  },
  {
    id: "p3", type: "audio", updated: "09-09 21:18", duration: "42:56", durationSec: 2576,
    title: "EP.11 在县城开书店的第五年",
    body: "书店开了五年，卖得最好的不是书，是咖啡和一个可以坐一下午的位置。他讲了怎么靠会员制活过第三年。#播客 #书店",
  },
  {
    id: "p4", type: "audio", updated: "09-04 22:30", duration: "35:12", durationSec: 2112,
    title: "EP.10 一个产品经理的转行记录",
    body: "从互联网大厂到社区面包房，收入掉了六成，睡眠多出三小时。这期聊了她做决定的那个月。#播客 #转行",
  },
  {
    id: "p5", type: "audio", updated: "09-02 06:15", duration: "45:00", durationSec: 2700,
    title: "白噪音：深夜图书馆",
    body: "收录于闭馆后的市立图书馆，只有空调、翻页和远处的脚步声。适合睡前。#白噪音",
  },
  {
    id: "p6", type: "audio", updated: "08-30 20:44", duration: "31:27", durationSec: 1887,
    title: "EP.09 我们聊了聊「不上班的第三年」",
    body: "两位嘉宾都离开职场三年，一位做自由职业，一位开了工作室。聊了钱、时间、以及「不上班」并不等于自由这件事。#播客 #自由职业",
  },
  {
    id: "p7", type: "audio", updated: "08-28 05:50", duration: "28:40", durationSec: 1720,
    title: "环境音：清晨六点的菜市场",
    body: "从第一辆三轮车进场录到第一个顾客砍价，中间那段只有卸货和水声。#环境音 #菜市场",
  },
];

Object.assign(window, {
  TYPES, TYPE_ORDER, PALETTE, PLATFORMS, STAGES, POSTS, DEFAULT_TARGETS,
  asset, shots, platformLink, newToken, supportsType, channelsOf,
});
