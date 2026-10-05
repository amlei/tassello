# 发布通道（Publish Channel）模型方案

> 状态：设计稿
>
> 目标：把 Web 与 Obsidian 的“平台 + 内容类型 + 发布方式”统一为一等发布通道模型。
>
> 原则：用户显式选择，不做自动推断、自动降级、默认通道兜底。

---

## 1. 背景

当前系统已经有共享平台 adapter，Web 与 Obsidian 都复用 `packages/platforms/*`，避免平台发布逻辑重复实现。

但目前的发布目标仍然主要表达为：

```ts
platformId
```

加上内容类型：

```ts
post.type = "article" | "image" | "video" | "audio"
```

这在单通道平台下够用，但无法准确表达同一平台内的多种发布方式：

| 平台 | 发布方式 |
|---|---|
| 知乎 | 文章、想法 / 贴图 |
| 小红书 | 长文、图文 |
| X | 文章、帖子 / 图文 |
| 微博 | 头条文章、普通微博 / 图文 |
| 公众号 | 文章、图片、视频、音频 |
| 小红书 / B 站等 | 还可能扩展视频、音频等 |

因此需要把“平台”升级为“发布通道”。

一个发布目标不再是：

```text
平台：知乎
```

而是：

```text
Channel：zhihu:article
```

或：

```text
Channel：zhihu:image
```

---

## 2. 目标

### 2.1 统一 Web 与 Obsidian

Web 和 Obsidian 都消费同一份 Channel registry，不再各自维护平台通道判断。

### 2.2 显式选择

用户必须显式选择：

1. 稿件类型：`article / image / video / audio`
2. 发布通道：如 `zhihu:article`
3. 发布意图：如 `draft` / `auto`

系统不根据 Markdown 是否包含图片、正文长度、frontmatter 旧字段自动切换通道。

### 2.3 同平台多通道并存

同一个源文件 / Post 可以同时创建多个任务：

```text
zhihu:article
zhihu:image
```

两个任务是独立记录、独立状态、独立回执。

### 2.4 保持 Web 的四类内容模型

Web 编辑器继续按四类内容组织：

```ts
type ContentType =
  | "article"
  | "image"
  | "video"
  | "audio";
```

Channel 不是新的内容分类体系，而是某个平台下某个内容类型的具体发布方式。

---

## 3. 非目标

- 不做自动通道推断。
- 不做自动降级。
- 不做默认通道兜底。
- 不兼容旧的 `platformIds` 发布请求。
- 不兼容旧的 `defaultPlatforms` 设置。
- 不在 Obsidian 内为某个平台单独复制发布逻辑。
- 不使用 `source.type` 推断发布通道。

---

## 4. 核心概念

### 4.1 ContentType：稿件类型

沿用 Web 端四类：

```ts
type ContentType =
  | "article"
  | "image"
  | "video"
  | "audio";
```

含义：

| ContentType | 中文 |
|---|---|
| `article` | 文章 |
| `image` | 贴图 / 图文 |
| `video` | 视频 |
| `audio` | 音频 |

Web 的 Post、Obsidian 的 Note 都使用该类型。

---

### 4.2 Platform：发布平台

平台仍然是账号和 adapter 的归属：

```ts
type PlatformId =
  | "wechat"
  | "weibo"
  | "xhs"
  | "zhihu"
  | "x"
  | "jike"
  | "douban"
  | ...
```

平台负责：

- 登录态；
- 账号；
- 浏览器连接；
- adapter 注册；
- 平台级品牌信息。

平台本身不再承担“选择文章还是想法”的职责。

---

### 4.3 PublishChannel：发布通道

Channel 是一等模型，表示：

```text
某平台上，某类内容的具体发布方式
```

示例：

| Channel ID | Platform | ContentType | UI 名称 | 状态 |
|---|---|---|---|---|
| `zhihu:article` | 知乎 | `article` | 文章 | active |
| `zhihu:image` | 知乎 | `image` | 想法 / 贴图 | active |
| `xhs:article` | 小红书 | `article` | 长文 | active |
| `xhs:image` | 小红书 | `image` | 图文 | active |
| `x:article` | X | `article` | 文章 | planned |
| `x:image` | X | `image` | 帖子 / 图文 | active |
| `weibo:article` | 微博 | `article` | 头条文章 | planned |
| `weibo:image` | 微博 | `image` | 微博 / 图文 | active |
| `jike:image` | 即刻 | `image` | 动态 / 图文 | active |
| `douban:image` | 豆瓣 | `image` | 图文 | active |
| `wechat:article` | 公众号 | `article` | 公众号文章 | active |
| `wechat:audio` | 公众号 | `audio` | 公众号音频 | active |

Channel ID 规则：

```text
${platformId}:${contentType}
```

如果未来同一平台同一内容类型出现多个真实通道，则扩展为更具体的 key：

```text
${platformId}:${channelKey}
```

例如：

```text
zhihu:pin
zhihu:article
xhs:image-note
xhs:article
```

第一版优先保持简单：

```text
${platformId}:${contentType}
```

---

### 4.4 PublishTarget：发布目标

一个发布目标由 Channel 和意图组成：

```ts
type PublishTarget = {
  channelId: string;
  intent: PublishIntent;
};
```

示例：

```json
{
  "channelId": "zhihu:article",
  "intent": "draft"
}
```

发布目标表达的是：

```text
把这篇内容发到这个通道，并采用这个发布意图
```

---

### 4.5 PublishIntent：发布意图

```ts
type PublishIntent =
  | "auto"
  | "draft";
```

含义：

| intent | 含义 |
|---|---|
| `auto` | 平台能力允许时自动完成发布 |
| `draft` | 创建 / 保留草稿，由用户手动完成最终发布 |

PublishIntent 是发布行为，不是通道选择。

Channel descriptor 声明自己支持哪些 intent：

```ts
intents: ["auto", "draft"]
// 或
intents: ["draft"]
```

用户必须选择 intent；系统不从平台 `autoSubmit` 反推 Channel。

---

## 5. Channel 数据模型

```ts
export type ChannelStatus =
  | "active"
  | "planned"
  | "disabled";

export type PublishChannel = {
  /** 全局唯一，如 zhihu:article */
  id: string;

  /** 归属平台 */
  platformId: string;

  /** 对应 Web 四类内容类型 */
  contentType: ContentType;

  /** 平台内通道 key，默认等于 contentType */
  key: string;

  /** UI 名称，如“想法”“长文”“图文” */
  label: string;

  /** 面向用户的说明 */
  description: string;

  status: ChannelStatus;

  /** 该通道支持的发布意图 */
  intents: PublishIntent[];

  /** 图片放置策略 */
  images: {
    supported: boolean;
    placement: "top" | "inline" | "none";
    max?: number;
  };

  /** 标题能力 */
  title: {
    supported: boolean;
    max?: number;
    /** 当平台没有标题位时，标题如何处理 */
    fallback: "fold-into-body" | "discard" | "unsupported";
  };

  /** 正文能力 */
  body: {
    kind: "plain-text" | "rich-text";
    max?: number;
    /** 新行是否保留 */
    preserveLineBreaks: boolean;
  };
};
```

说明：

- `contentType` 用于和 Web / Obsidian 的稿件类型匹配；
- `label` 用于表达平台特有名词，例如知乎 `image` 显示“想法”，小红书 `image` 显示“图文”；
- `images.placement` 是能力声明，不是自动路由器；
- `status: planned` 的 Channel 可以在 UI 中展示，但不能发布；
- Channel descriptor 不包含默认选择、降级目标、自动推断函数。

---

## 6. Channel registry

### 6.1 来源

每个共享 adapter 声明自己的 channels。

```ts
export const zhihuAdapter: PlatformAdapter = {
  platformId: "zhihu",

  channels: [
    {
      id: "zhihu:article",
      platformId: "zhihu",
      contentType: "article",
      key: "article",
      label: "文章",
      description: "创建知乎专栏文章或草稿",
      status: "active",
      intents: ["auto", "draft"],
      images: {
        supported: true,
        placement: "inline",
      },
      title: {
        supported: true,
        max: 100,
        fallback: "unsupported",
      },
      body: {
        kind: "rich-text",
        preserveLineBreaks: true,
      },
    },
    {
      id: "zhihu:image",
      platformId: "zhihu",
      contentType: "image",
      key: "image",
      label: "想法",
      description: "发布知乎想法或贴图",
      status: "active",
      intents: ["auto", "draft"],
      images: {
        supported: true,
        placement: "top",
      },
      title: {
        supported: false,
        fallback: "fold-into-body",
      },
      body: {
        kind: "plain-text",
        max: 3000,
        preserveLineBreaks: true,
      },
    },
  ],

  ...
};
```

### 6.2 Registry API

```ts
listChannels(): PublishChannel[];
getChannel(channelId: string): PublishChannel | undefined;
listChannelsByPlatform(platformId: string): PublishChannel[];
listChannelsByContentType(contentType: ContentType): PublishChannel[];
```

### 6.3 校验规则

注册 adapter 时校验：

1. `channel.id` 全局唯一；
2. `channel.platformId` 必须等于 adapter `platformId`；
3. `channel.contentType` 必须是合法 ContentType；
4. `channel.status === "active"` 时 adapter 必须能发布该通道；
5. planned / disabled Channel 不能进入发布任务；
6. adapter 不允许声明一个自己不支持的 active Channel。

---

## 7. 稿件类型选择

### 7.1 Web

Web 的 Post 本身已有 `type`：

```ts
type Post = {
  type: ContentType;
  ...
};
```

发布时直接使用：

```ts
post.type
```

过滤 channels：

```ts
channels.filter(channel => channel.contentType === post.type)
```

Web 编辑器创建文章、贴图、视频、音频的方式不变。

---

### 7.2 Obsidian

Obsidian Markdown 没有天然 Post type，因此必须显式声明。

推荐 frontmatter：

```yaml
---
tassello:
  type: article
---
```

或：

```yaml
---
tassello:
  type: image
---
```

Obsidian Publisher 打开后：

1. 读取 `tassello.type`；
2. 如果存在，按该类型过滤 channels；
3. 如果不存在，显示“请选择稿件类型”；
4. 用户手动选择后写入 frontmatter；
5. 后续发布使用该类型。

禁止逻辑：

```ts
// 禁止
if (bodyHasImages) type = "image";
if (!bodyHasImages) type = "article";
```

也禁止：

```ts
// 禁止
if (!platform.supports("article")) type = "image";
```

---

## 8. 默认发布通道设置

Web 与 Obsidian 都需要支持“按稿件类型配置默认 Channel”。

设置结构：

```ts
type ChannelSettings = {
  defaultChannels: Record<ContentType, string[]>;
};
```

示例：

```ts
{
  defaultChannels: {
    article: [
      "zhihu:article",
      "xhs:article"
    ],
    image: [
      "xhs:image",
      "weibo:image"
    ],
    video: [],
    audio: []
  }
}
```

### 8.1 语义

这些默认值只表示：

```text
用户在该内容类型下，发布面板打开时希望预选哪些通道
```

它们不是运行时推断规则。

### 8.2 设置 UI

按四个内容类型分组：

```text
文章默认通道
  [知乎 · 文章] [小红书 · 长文] [X · 文章]

贴图默认通道
  [知乎 · 想法] [小红书 · 图文] [X · 帖子] [微博 · 图文]

视频默认通道
  [...]

音频默认通道
  [...]
```

只有 `channel.contentType` 与分组类型一致的 Channel 才能出现在该分组。

`planned` Channel 可以显示但禁用。

### 8.3 发布时使用

打开发布面板时：

```ts
selectedTargets = defaultChannels[source.contentType]
  .map(channelId => ({ channelId, intent: ... }))
```

这只是预选。

用户可以取消、追加、修改 intent。

没有选中目标时，发布按钮 disabled。

---

## 9. Obsidian UI 设计

Obsidian 插件继续使用当前 Publisher 面板，交互分成两层：

1. 预览层：选择当前要查看的 Channel；
2. 发布层：选择实际要创建任务的 Targets。

---

### 9.1 稿件类型选择

在发布 Tab 顶部显示：

```text
稿件类型
[文章] [贴图] [视频] [音频]
```

状态来源：

```text
frontmatter.tassello.type
```

如果不存在，显示：

```text
请选择稿件类型
```

此时 Channel 列表禁用。

用户选择后写入 frontmatter：

```yaml
tassello:
  type: article
```

---

### 9.2 发布目标选择

选择稿件类型后，只显示匹配 contentType 的 channels。

例如选择 `article`：

```text
发布通道

[✓] 知乎 · 文章
[✓] 小红书 · 长文
[ ] X · 文章
[ ] 微博 · 头条文章
```

选择 `image`：

```text
发布通道

[✓] 知乎 · 想法
[✓] 小红书 · 图文
[✓] X · 帖子
[✓] 微博 · 图文
```

### 目标行结构

每个 Channel 一行：

```text
[✓] 知乎 · 文章
    草稿 / 自动发送
```

或：

```text
[✓] 知乎 · 文章
    intent: draft
```

如果 channel status 是 planned：

```text
[ ] X · 文章
    规划中
```

该行禁用。

### 已选数量

发布按钮显示：

```text
发布到 2 个通道
```

没有选中时：

```text
请至少选择一个发布通道
```

按钮 disabled。

---

### 9.3 发布意图选择

每个选中 Channel 可以单独选择 intent：

```text
[✓] 知乎 · 文章      [草稿 ▾]
[✓] 知乎 · 想法      [自动发送 ▾]
[✓] 小红书 · 图文    [草稿]
```

Channel 只允许选择 descriptor 中声明的 intent。

例如：

- 小红书通常只支持 `draft`；
- 知乎文章支持 `auto` / `draft`；
- 知乎想法支持 `auto` / `draft`；
- 微博普通帖支持 `auto`。

---

### 9.4 预览目标选择

预览 Tab 保持平台 icon chips，但下方增加通道切换。

示例：选择知乎 icon：

```text
平台
[即刻] [豆瓣] [X] [微博] [知乎] [小红书]

知乎通道
[想法] [文章]

Payload
...
```

示例：选择小红书 icon：

```text
平台
[即刻] [豆瓣] [X] [微博] [知乎] [小红书]

小红书通道
[图文] [长文]

Payload
...
```

预览状态：

```ts
activePreviewChannelId: string;
```

预览状态不影响发布勾选状态。

发布勾选状态：

```ts
selectedTargets: PublishTarget[];
```

两者职责分离：

| Tab | 状态 | 作用 |
|---|---|---|
| 预览 | `activePreviewChannelId` | 查看某个通道 payload |
| 发布 | `selectedTargets` | 创建实际任务 |

---

## 10. Web UI 设计

Web 继续按 Post type 进入发布流程。

### 10.1 文章 Post

```ts
post.type = "article"
```

发布弹窗只显示：

```text
zhihu:article
xhs:article
x:article
weibo:article
wechat:article
...
```

不显示知乎想法、小红书图文等 `image` Channel。

### 10.2 贴图 Post

```ts
post.type = "image"
```

发布弹窗只显示：

```text
zhihu:image
xhs:image
x:image
weibo:image
jike:image
douban:image
...
```

不显示知乎文章、小红书长文等 `article` Channel。

### 10.3 发布弹窗

保留现有 Web 风格：

```text
发布到平台
当前类型：文章
已选 02 / 05

[知乎 · 文章]
[小红书 · 长文]
[X · 文章]
[微博 · 头条文章]

将创建 2 个发布任务
[确认发布]
```

每个 Channel target 可以单独选择 intent，或第一版使用统一 intent。

---

## 11. 发布 API

### 11.1 旧 API

旧模型：

```json
POST /api/publish
{
  "postId": "post_1",
  "platformIds": ["zhihu", "xhs"]
}
```

该结构无法表达同平台多通道，最终废弃。

---

### 11.2 新 API

```json
POST /api/publish
{
  "postId": "post_1",
  "targets": [
    {
      "channelId": "zhihu:article",
      "intent": "draft"
    },
    {
      "channelId": "xhs:image",
      "intent": "draft"
    }
  ]
}
```

校验：

1. `channelId` 存在；
2. Channel `status === "active"`；
3. `channel.contentType === post.type`；
4. `intent` 在 `channel.intents` 内；
5. Post 存在；
6. 当前用户有权限发布该 Post。

---

## 12. Obsidian 发布 API / 服务调用

Obsidian 不走 Web HTTP，但使用相同的 target 结构。

```ts
engine.enqueue(
  source,
  targets: PublishTarget[],
)
```

`TaskEngine.enqueue()` 内部为每个 target 创建一个任务。

---

## 13. SourceDraft 调整

Obsidian 的 `SourceDraft` 继续承载 Markdown 解析结果：

```ts
type SourceDraft = {
  filePath: string;
  contentDigest: string;

  title: string;
  body: string;
  html: string;
  plain: string;

  assets: ResolvedAsset[];

  type: ContentType;
  options: Record<string, unknown>;
};
```

`type` 必须显式来自 frontmatter 或用户选择。

删除以下逻辑：

```ts
const inferredType = /!\[\[|!\[[^\]]*\]\([^)]+\)/.test(body)
  ? "image"
  : "article";
```

也删除：

```ts
effectiveContentType()
```

`source.type` 只用于过滤 channels，不再决定某个平台内部走哪个分支。

---

## 14. PostDraft 调整

共享 adapter 输入建议移除 `type`：

```ts
type PostDraft = {
  id: string;
  title: string;
  body: string;
  bodyHtml: string;
  durationSec: number | null;
  assets: PublishAsset[];
};
```

类型信息放在 request / target 上：

```ts
type PublishRequest = {
  post: PostDraft;
  channel: PublishChannel;
  intent: PublishIntent;
};
```

Adapter 通过下面字段判断：

```ts
channel.id
channel.contentType
channel.key
intent
```

不再判断：

```ts
post.type === "article"
post.type === "image"
```

---

## 15. Adapter 接口

最终接口：

```ts
export interface PlatformAdapter<TProfile = unknown> {
  platformId: string;

  channels: readonly PublishChannel[];

  account: {
    profileSchema: ZodType<TProfile>;
    verify(
      acct: AdapterAccount<TProfile>,
      ctx: AdapterCtx,
    ): Promise<VerifyResult<TProfile>>;
  };

  planPublish(request: PublishPlanRequest): PublishPlan;

  publish(
    request: PublishRequest,
    acct?: AdapterAccount<TProfile>,
    ctx?: AdapterCtx,
    onStage?: StageReporter,
  ): Promise<PublishResult>;
}
```

### 15.1 planPublish

`planPublish()` 是纯函数：

- 不打开页面；
- 不创建任务；
- 不上传素材；
- 只根据 Channel 校验并生成 payload / preview / findings。

用途：

- Web 发布弹窗实时检查；
- Obsidian 预览；
- 发布按钮 disabled 判断；
- 队列详情展示。

返回：

```ts
type PublishPlan = {
  status: "ok" | "blocked";
  findings: Finding[];
  preview: ChannelPreview;
};
```

### 15.2 publish

`publish()` 使用同一个 request，真正执行：

- 素材上传；
- 页面填充；
- API 调用；
- 草稿创建；
- 自动发送；
- 人工确认返回。

---

## 16. ChannelPayload / Preview

按 ContentType 定义 payload，而不是按 platform 硬编码。

### 16.1 article

```ts
type ArticlePayload = {
  title: string;
  blocks: ContentBlock[];
  html: string;
};
```

预览结构：

```text
标题
正文块 1
图片（如果通道支持 inline）
正文块 2
```

知乎文章、公众号文章、小红书长文、X Articles 都属于该类型。

---

### 16.2 image

```ts
type ImagePayload = {
  title?: string;
  images: PublishAsset[];
  body: string;
};
```

预览结构固定：

```text
图片列表
正文
```

即使 Markdown 原本是图文混排，也统一：

1. 图片提取为附件；
2. 图片显示 / 上传；
3. 正文剥离图片语法；
4. 正文显示在图片下方。

---

### 16.3 video

```ts
type VideoPayload = {
  title: string;
  video: PublishAsset | null;
  body: string;
};
```

---

### 16.4 audio

```ts
type AudioPayload = {
  title: string;
  audio: PublishAsset | null;
  cover?: PublishAsset | null;
  body: string;
};
```

---

## 17. 图片策略

图片策略必须来自 Channel descriptor。

### 17.1 `images.placement: "top"`

适用于：

- 知乎想法；
- 小红书图文；
- X 帖子；
- 微博图文；
- 即刻动态；
- 豆瓣图文。

处理：

1. 从 Markdown 中解析图片；
2. 提取为 assets；
3. 预览固定显示在正文顶部；
4. 发布时作为平台图片列表上传；
5. 正文只保留文本。

---

### 17.2 `images.placement: "inline"`

适用于：

- 知乎文章；
- 公众号文章；
- 小红书长文；
- X Articles。

处理：

1. Markdown 保留图片位置；
2. 每张图片上传到平台；
3. 用平台返回 URL 替换原始本地图引用；
4. 文章 HTML 按原位置包含远程图片。

如果通道当前不支持本地图上传，则 `planPublish()` 返回 blocked finding，不能静默丢图。

---

## 18. 任务模型

```ts
type PublishTask = {
  id: string;

  /** Web Post 或 Obsidian Note */
  sourceId: string;
  sourceType: "post" | "note";
  sourcePath?: string;

  channelId: string;
  platformId: string;
  contentType: ContentType;
  channelLabel: string;

  intent: PublishIntent;

  status: PublishStatus;
  stage: number;
  progress: number;

  message?: string | null;
  failReason?: string | null;
  url?: string | null;
  pageUrl?: string | null;

  createdAt: string;
  updatedAt: string;
  finishedAt?: string | null;
};
```

要点：

1. `channelId` 是任务主维度；
2. `platformId` 保留用于图标和平台信息；
3. `contentType` 冗余存储，便于查询；
4. `channelLabel` 冗余存储，便于历史展示；
5. `intent` 必须持久化，重试时使用原 intent。

---

## 19. 任务唯一性

同一源 + 同一 Channel 只允许一个进行中任务：

```text
sourceId + channelId
```

状态包括：

```ts
queued
running
awaiting_confirm
```

例如允许同时存在：

```text
测试笔记.md + zhihu:article
测试笔记.md + zhihu:image
```

但不允许同时存在两个：

```text
测试笔记.md + zhihu:article
```

---

## 20. 结果与发布库

Web 队列显示：

```text
知乎 · 文章      完成
知乎 · 想法      待确认
小红书 · 图文    失败
```

Obsidian 发布库 frontmatter 按 channel 生成：

```yaml
tassello-zhihu-article-status: 完成
tassello-zhihu-article-draft-url: ...
tassello-zhihu-article-publish-url: ...

tassello-zhihu-image-status: 待确认
tassello-zhihu-image-draft-url: ...
tassello-zhihu-image-publish-url: ...
```

命名规则：

```text
tassello-${platformId}-${channelKey}-status
tassello-${platformId}-${channelKey}-draft-url
tassello-${platformId}-${channelKey}-publish-url
tassello-${platformId}-${channelKey}-finished-at
tassello-${platformId}-${channelKey}-source-changed
tassello-${platformId}-${channelKey}-fail-reason
```

第一版 `channelKey` 默认等于 `contentType`。

---

## 21. Web 端影响

### 21.1 不变

- Post 创建；
- 编辑器；
- 素材上传；
- Post type：`article / image / video / audio`；
- 队列基础状态机；
- 账号管理；
- 登录态导入；
- Chrome profile 注入。

### 21.2 变化

发布弹窗从平台列表变成 Channel 列表。

例如文章 Post：

```text
当前类型：文章

[✓] 知乎 · 文章
[✓] 小红书 · 长文
[ ] X · 文章
[ ] 微博 · 头条文章
```

贴图 Post：

```text
当前类型：贴图

[✓] 知乎 · 想法
[✓] 小红书 · 图文
[✓] X · 帖子
[✓] 微博 · 图文
```

### 21.3 API 变化

旧：

```json
{
  "postId": "post_1",
  "platformIds": ["zhihu", "xhs"]
}
```

新：

```json
{
  "postId": "post_1",
  "targets": [
    { "channelId": "zhihu:article", "intent": "draft" },
    { "channelId": "xhs:article", "intent": "draft" }
  ]
}
```

这是 breaking change。

---

## 22. Obsidian 端影响

### 22.1 不变

- Markdown 文件读取；
- frontmatter 解析；
- 本地图片解析；
- 图片预览；
- Chrome 默认连接；
- 共享 adapter 调用方式；
- 构建后部署流程。

### 22.2 变化

删除 Obsidian 本地硬编码平台能力：

```ts
PLATFORMS
PLATFORM_BY_ID
platformSupportsType()
effectiveContentType()
```

改为共享 Channel registry。

### 22.3 设置变化

旧：

```ts
defaultPlatforms: {
  article: ["zhihu"],
  image: ["xhs", "weibo"]
}
```

新：

```ts
defaultChannels: {
  article: ["zhihu:article", "xhs:article"],
  image: ["xhs:image", "weibo:image"],
  video: [],
  audio: []
}
```

不迁移旧设置。

---

## 23. 典型场景

### 23.1 知乎文章

用户显式选择：

```json
{
  "channelId": "zhihu:article",
  "intent": "draft"
}
```

流程：

1. 过滤 `contentType === "article"`；
2. Markdown 作为文章源；
3. 图片策略由 channel 决定；
4. 调用知乎文章 adapter；
5. 创建 / 更新知乎文章草稿；
6. 任务记录 `zhihu:article`。

---

### 23.2 知乎想法

用户显式选择：

```json
{
  "channelId": "zhihu:image",
  "intent": "auto"
}
```

流程：

1. 过滤 `contentType === "image"`；
2. 图片提取到顶部；
3. 正文剥离图片语法；
4. 调用知乎想法 adapter；
5. 任务记录 `zhihu:image`。

---

### 23.3 小红书长文

```json
{
  "channelId": "xhs:article",
  "intent": "draft"
}
```

流程：

1. 只因用户选择了 `xhs:article`；
2. 内容作为长文处理；
3. 图片是否内联由 channel capabilities 决定；
4. 不自动转成图文。

---

### 23.4 小红书图文

```json
{
  "channelId": "xhs:image",
  "intent": "draft"
}
```

流程：

1. 图片提取到顶部；
2. 正文剥离图片；
3. 填充标题 / 正文；
4. 上传图片；
5. 保存草稿。

---

### 23.5 同一篇同时发知乎文章和知乎想法

用户选择：

```json
[
  {
    "channelId": "zhihu:article",
    "intent": "draft"
  },
  {
    "channelId": "zhihu:image",
    "intent": "draft"
  }
]
```

产生两个任务：

```text
zhihu:article -> queued
zhihu:image   -> queued
```

队列展示：

```text
知乎 · 文章    queued
知乎 · 想法    queued
```

---

## 24. 错误与提示

### 24.1 Channel planned

用户尝试选择 planned Channel：

```text
X · 文章尚未接入
```

UI 直接禁用。

---

### 24.2 类型不匹配

前端已经过滤，不应出现：

```text
article Post 选择 zhihu:image
```

如果 API 直调发生：

```text
Channel zhihu:image 与 Post type article 不匹配
```

---

### 24.3 intent 不支持

```text
Channel zhihu:article 不支持 intent auto
```

---

### 24.4 文章图片能力缺失

```text
知乎文章通道当前不能上传本地图片；请先补齐图片上传能力或手动补图
```

不要静默丢图。

---

### 24.5 图文缺少图片

如果 channel 要求至少一张图：

```text
小红书图文至少需要 1 张图片
```

UI 禁用或 plan blocked。

---

## 25. 实施清单

### 25.1 共享模型

新增：

```text
PublishChannel
ChannelStatus
PublishTarget
PublishRequest
PublishPlanRequest
PublishPlan
ChannelPreview
```

修改：

```text
PlatformAdapter
registry
```

删除：

```ts
PostDraft.type
AdapterPublishOptions.channel
effectiveContentType()
auto channel inference
```

---

### 25.2 Web

修改：

```text
发布弹窗
/api/publish
TaskDTO
Task schema
Queue UI
Settings default channels
```

移除：

```text
platformIds 发布参数
defaultPlatforms 设置
```

---

### 25.3 Obsidian

修改：

```text
PublisherView
TaskEngine
TaskStore
PublicationLedger
Settings
Channel registry 消费
```

删除：

```text
Obsidian 本地 PLATFORMS
effectiveContentType()
source.type 自动推断
defaultPlatforms
```

保留：

```text
frontmatter.tassello.type
```

但语义变为显式稿件类型。

---

### 25.4 UI 原型

在修改真实 UI 前，需要先更新：

```text
designs/obsidian-publisher/right-panel.html
```

覆盖：

1. 稿件类型选择；
2. Channel 选择；
3. 发布 intent；
4. 预览切换；
5. planned / disabled 状态；
6. 发布按钮计数；
7. 队列目标显示。

真实 UI 必须等原型确认后再实施。

---

## 26. 测试要求

### 26.1 Registry 测试

- Channel ID 唯一；
- Channel 属于正确 platform；
- active Channel 必须有 active adapter 能力；
- planned Channel 不能发布；
- 按 contentType 过滤正确；
- 按 platform 过滤正确。

---

### 26.2 Adapter planPublish 测试

每个 adapter 覆盖：

```text
合法 target -> ok
planned target -> blocked
intent 不支持 -> blocked
contentType 不匹配 -> blocked
图片超过上限 -> blocked
缺少必填图片 -> blocked
正文超过上限 -> warning / blocked
```

---

### 26.3 Web 测试

- 文章 Post 只显示 article channels；
- 贴图 Post 只显示 image channels；
- 发布请求使用 targets；
- 服务端校验 channel.contentType；
- 任务创建数量等于 targets 数量；
- 队列显示 channelLabel。

---

### 26.4 Obsidian 测试

- `tassello.type` 缺失时不能选择 channel；
- 显式 `type: article` 只显示 article channels；
- 显式 `type: image` 只显示 image channels；
- 默认 channels 只作为预选；
- 用户取消默认 channels 后不会自动恢复；
- 同源同 channel 不能重复排队；
- 同源不同 channel 可以并行排队；
- 发布库 frontmatter 按 channel 展开；
- 重试保留原 channelId 和 intent。

---

## 27. 验收标准

1. Web 和 Obsidian 使用同一份 Channel registry。
2. 用户显式选择 Channel，系统不做自动推断。
3. 同一平台可以表达多个通道。
4. 同一源可以同时发布到同平台多个通道。
5. 队列、任务、发布库均能区分知乎文章和知乎想法。
6. Channel planned / disabled 时不能创建任务。
7. 发布 intent 必须显式选择，且必须在 Channel 支持范围内。
8. Web Post type 仍然是 `article / image / video / audio`。
9. Obsidian note 的 `tassello.type` 也是这四类。
10. 图片策略由 Channel descriptor 声明，不由 Obsidian 推断。
11. 没有任何运行时自动降级逻辑。
12. 发布失败、重试、回执、frontmatter 状态均按 Channel 独立记录。

---

## 28. 后续待办

以下能力与 Channel 模型解耦，但需要在对应 active Channel 中补齐：

1. 知乎文章本地图上传；
2. 知乎想法图片上传；
3. X Articles；
4. 微博头条文章；
5. 更多视频 / 音频通道；
6. Channel 级别的配额、字数、图片限制统一提示。

这些能力完成后，只需更新对应 Channel descriptor 的 `status` 和 capabilities，Web 与 Obsidian 无需各自实现。
