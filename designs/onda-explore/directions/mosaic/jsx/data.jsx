/* data.jsx — 种子数据：类型、平台、示例稿子 */
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
 * 发布弹层只列支持当前稿子类型的平台（见 publish.jsx）。
 *
 * supports 的来源（逐条核对，2026-09 整理）：
 *  · 微信公众号 —— 图文消息 / 图片消息（小绿书）/ 视频 / 语音；dev 文档里草稿箱只管图文消息，但后台可直发图片与视频
 *  · 小红书 —— 图文笔记 / 视频笔记 / 长文笔记（内置长文编辑器，约 6000 字）；无独立音频发布
 *  · 微博 —— 文字 + 多图 + 视频同帖；音频需转成视频，官方不支持直发音频
 *  · 即刻 —— 动态文字 / 图片 / 视频 / 音乐链接分享；不能上传音频文件
 *  · X —— 推文文字 / 图片 / 视频 / 语音推文（140 秒）
 *  · B站 —— 视频投稿 / 专栏文章 / 动态图文；音频分区已停止投稿（改为 BGM 投稿）
 *  · 知乎 —— 文章（专栏）/ 想法（图文）/ 视频；官方不支持上传音频
 *  · 豆瓣 —— 日记（长文）/ 广播与相册（图文）；不支持直发视频与音频
 *  · 头条号 —— 创作栏含 文章 / 视频 / 微头条 / 问答 / 音频，图集走文章发布
 *  · 百家号 —— 图文 / 图集 / 视频 / 动态 / 直播 / 音频 全形态
 *  · 抖音 —— 视频 / 图文；2025 年底上线长图文（文章，最多 8000 字、30 图）；音频只作背景音
 *
 * state：账号凭据的获取状态 —— ok = 已获取，fail = 获取失败（可重新获取）
 * link：发布成功后的回执地址前缀（原型不对接真实平台，只演示这一处信息）
 */
const PLATFORMS = [
  { id: "wechat",    name: "微信公众号", char: "微", color: "#07C160", state: "ok",   link: "mp.weixin.qq.com/s/",        supports: ["article", "image", "video", "audio"] },
  { id: "xhs",       name: "小红书",     char: "红", color: "#FF2442", state: "ok",   link: "www.xiaohongshu.com/explore/", supports: ["article", "image", "video"] },
  { id: "weibo",     name: "微博",       char: "博", color: "#FF8200", state: "ok",   link: "weibo.com/detail/",          supports: ["article", "image", "video"] },
  { id: "jike",      name: "即刻",       char: "即", color: "#FFD400", fg: "#16130E", state: "ok", link: "web.okjike.com/originalPost/", supports: ["article", "image", "video"] },
  { id: "bili",      name: "B站",        char: "B",  color: "#00A1D6", state: "fail", link: "www.bilibili.com/video/",    supports: ["article", "image", "video"] },
  { id: "x",         name: "X",          char: "X",  color: "#16130E", state: "fail", link: "x.com/i/status/",            supports: ["article", "image", "video", "audio"] },
  { id: "zhihu",     name: "知乎",       char: "知", color: "#0084FF", state: "ok",   link: "zhuanlan.zhihu.com/p/",      supports: ["article", "image", "video"] },
  { id: "douban",    name: "豆瓣",       char: "豆", color: "#2E963D", state: "ok",   link: "www.douban.com/note/",       supports: ["article", "image"] },
  { id: "toutiao",   name: "头条号",     char: "头", color: "#F04142", state: "ok",   link: "www.toutiao.com/article/",   supports: ["article", "image", "video", "audio"] },
  { id: "baijiahao", name: "百家号",     char: "百", color: "#2932E1", state: "ok",   link: "baijiahao.baidu.com/s?id=",  supports: ["article", "image", "video", "audio"] },
  { id: "douyin",    name: "抖音",       char: "抖", color: "#25F4EE", fg: "#16130E", state: "ok", link: "www.douyin.com/video/", supports: ["article", "image", "video"] },
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

/* 默认发布平台：按稿子类型各一份名单，发布时自动点亮（可在「默认平台」里改） */
const DEFAULT_TARGETS = {
  article: ["wechat", "xhs"],
  image: ["xhs", "jike"],
  video: ["douyin", "bili"],
  audio: ["wechat", "toutiao"],
};

/* 发布成功后的回执链接 */
function platformLink(platformId, token) {
  const p = PLATFORMS.find((x) => x.id === platformId);
  return (p && p.link ? p.link : "example.com/") + (token || "00000000");
}
function newToken() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

const STAGES = ["渲染排版", "上传素材", "填充编辑器", "人工确认"];

const POSTS = [
  {
    id: "a1", type: "article", status: "draft", updated: "09-12 14:02",
    title: "为什么我们团队在周五下午不发版",
    body: "上周五下午四点，运维群里有人发了一张截图：支付服务的错误率曲线像被人踩了一脚，直直地竖了起来。半小时后定位到原因——一个本该下周一才合入的变更，被提前带上了线。\n\n这不是第一次了。我们复盘了过去一年的十七次线上事故，发现其中六次发生在周五下午三点之后。不是大家周五状态不好，而是周五发版这件事本身就不划算：改动的收益要等下周一才能被用户感知，但风险却要整个周末来承担。#工程文化\n\n现在我们定了三条规矩。第一，周五下午只许发文档和配置回滚，不许发代码。第二，谁要在周五发版，谁就自己留在群里值守到周日晚上。第三，所有「紧急修复」必须由两个人同时确认它真的紧急——后来发现，九成五的「紧急」都可以等到周一。#发布纪律\n\n规矩实行了四个月，周末的告警量下降了七成。省下来的不只是睡眠时间，还有整个团队对「上线」这件事的信任感。\n\n![配图](asset://a1)\n\n顺带说一个意料之外的变化：不发版的周五下午，慢慢变成了团队的「慢时间」。有人整理这周的技术债清单，有人写复盘文档，有人把积了很久的代码评审一次清完。起初我担心效率会掉，结果迭代速度反而快了一点——大概是因为没人再需要在周日晚上抱着电脑回滚版本，周一早上的站会也没人顶着黑眼圈了。\n\n如果你所在的团队也有类似的习惯，欢迎把这条转给那个总在周五下午说「就改一行，应该没事」的同事。一行也是改动，改动就有概率，概率落到周末头上，就是一整个周末。",
    images: [asset("#8FB8FF")],
  },
  {
    id: "a2", type: "article", status: "published", updated: "09-10 21:44",
    title: "把菜园搬上天台：三个月的试错记录",
    body: "六月初我在天台上摆了十二个种植箱，信心满满地以为秋天就能实现番茄自由。三个月过去，收获是：十一个被晒蔫的空盆，和一盆活得很好的薄荷。\n\n教训按顺序排列如下。首先，天台的风比地面大得多，幼苗期不挡风就是送死。其次，西晒的墙面会把下午的温度再抬高五度，我量过，箱体表面能到四十六度。第三，自动滴灌的定时器一定要买双备份电池的，我的那一套在七月最热的那周停了四天，回来的时候土已经硬得像砖。#天台菜园\n\n九月初我重新来过：全部换成耐热的空心菜和红薯叶，箱子挪到女儿墙背风的一侧，早晚两次手动浇水。两周后，第一茬空心菜上了桌。分量不多，但夹起来的那一筷子，确实比超市买的要脆。#番茄 计划留到明年春天，这次我打算先请教楼下种了十年菜的陈伯。",
  },
  {
    id: "i1", type: "image", status: "published", updated: "09-11 19:26",
    title: "巷口修表铺的一天",
    body: "早上八点半，老周拉开卷帘门，先把那只玻璃柜台擦一遍。柜子里躺着三百多块表，最老的一块是 1962 年的上海牌。\n\n上午来的都是熟客，换电池、截表带，五分钟一单。下午两点，一个年轻人拿来一块停了十年的旧表，说是爷爷留下的。老周对着台灯拆开看了一眼，说机芯还能救，要三天。\n\n我蹲在门口拍了一整天，挑出这六张。#街头摄影 #老店 #城市记忆",
    images: [asset("#D52088"), asset("#FD8D11"), asset("#2C6FF0"), asset("#0EC3D4"), asset("#07B56F"), asset("#16130E")],
  },
  {
    id: "i2", type: "image", status: "draft", updated: "09-09 08:15",
    title: "白露之后的云",
    body: "白露一过，云的形状就变了。夏天那种一大团一大团垒起来的积雨云不见了，换成一丝一丝、一层一层的，像有人拿刷子蘸了牛奶在蓝布上抹开。\n\n这四张都是下班路上用手机拍的，没修图。最好的一张是在天桥上等红灯的时候，前后只有十几秒。#云 #手机摄影 #白露",
    images: [asset("#0EC3D4"), asset("#2C6FF0"), asset("#8FB8FF"), asset("#FD8D11")],
  },
  {
    id: "v1", type: "video", status: "draft", updated: "09-12 11:37",
    title: "三分钟讲清「公摊面积」",
    body: "电梯井、楼梯间、大堂、设备房——你买的每一平米里，都有一部分是这些。这条视频用一栋真实楼盘的竣工图，把公摊系数是怎么算出来的、哪些算得合理哪些是浑水摸鱼，一次讲清楚。\n\n片尾附了一张自测表，买房前对着户型图自己就能算个大概。#房产 #科普 #公摊面积",
    duration: "03:12",
  },
  {
    id: "v2", type: "video", status: "published", updated: "09-08 22:03",
    title: "给猫做了一个人体工学键盘托",
    body: "只要我一开电脑，我家猫就必须趴在键盘上。既然拦不住，那就顺着它：我量了它趴卧时的肩高和舒展长度，用白蜡木做了一个架空在键盘上方的「猫体工学托板」，下面照常打字，上面给它趴。\n\n制作过程四分半，猫的验收环节在片尾，它给出了五分制里的四点五分——扣的半分是因为托板边缘没有磨圆，它蹭脸的时候皱眉了。#手工 #猫 #木工",
    duration: "05:47",
  },
  {
    id: "p1", type: "audio", status: "draft", updated: "09-11 23:51",
    title: "EP.12 和夜班出租车司机聊一座城市的背面",
    body: "这期嘉宾是开了十九年夜班的出租车司机王师傅。我们聊了他眼中的城市时刻表：凌晨一点的代驾、三点的水产市场、四点半的第一班机场线。\n\n他说夜班司机有个不成文的默契，谁在机场排队区睡着了，后面的人会按两声喇叭把他叫醒，「不能让客人等」。#播客 #城市 #夜班",
    duration: "38:20", durationSec: 2300,
  },
  {
    id: "p2", type: "audio", status: "published", updated: "09-06 07:40",
    title: "雨声采样：梅雨季的窗台",
    body: "今年梅雨录了二十多个小时，剪出这十二分钟：前半段是雨点打在遮雨棚上的密集鼓点，六分四十秒之后雨势转小，能听见水珠顺着窗沿滴进楼下铁皮桶的声音，笃、笃、笃，间隔越来越长。\n\n适合当工作背景音。建议音量不要开太大，雨声的美妙之处在于「几乎听不见」。#环境音 #白噪音 #梅雨",
    duration: "12:05", durationSec: 725,
  },
];

Object.assign(window, { TYPES, TYPE_ORDER, PALETTE, PLATFORMS, STAGES, POSTS, DEFAULT_TARGETS, asset, platformLink, newToken, supportsType });
