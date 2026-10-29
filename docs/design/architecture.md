# 九漾 Onda（tassello）· 架构

> 状态：核心架构与浏览器扩展发布链路已落地，平台真机验收进行中。
> 本文只描述系统职责、边界、数据流和约束。UI 视觉规则见 [`design-language.md`](./design-language.md)，仓库约定见 [`repo-conventions.md`](../conventions/repo-conventions.md)，执行流程见 [`development-workflow.md`](../workflow/development-workflow.md)。
> [`platforms/README.md`](../platforms/README.md) 继续保存各平台真机验证事实；其中的 CDP 实现细节在迁移期间作为参考资料，不再代表目标发布通道。

<a id="status"></a>
## 0. 当前状态与目标状态

| 领域 | 已落地 | 尚未完成 |
|---|---|---|
| 内容 | Vault Markdown + frontmatter；扫描、解析、fingerprint、原子写、迁移脚本 | watcher、软编辑锁与三方冲突副本 |
| 运营状态 | `.onda` 命名空间下的 `TASSELLO_DATA_DIR/state/` 文件状态库、原子 JSON 写、稳定 installationId | 实例锁、保留期清理、损坏恢复页面 |
| 后端 | Bun + ElysiaJS HTTP / WS、文档、媒体、账号、任务、扩展配对；播客 Feed 解析、平台认领缓存与 RSS 直传拦截 | UI / Obsidian 能力域 token、媒体服务 SSRF 防护 |
| 前端 | Next.js rewrite 调用 API；编辑器保存 Markdown + fingerprint | 外部修改实时提示 |
| Obsidian | 远端 API 客户端、直接 Markdown 编辑、预览内发布、WebSocket 状态 | 插件 token 配对与完整冲突交互 |
| 桌面 | Electron 托管 API 二进制与 Next standalone，动态端口与完整链路自检 | 目标平台安装包实跑 |
| 浏览器执行 | MV3、Native Messaging 自动发现/配对、单连接、心跳、12 个 active 扩展平台驱动、串行任务与断线恢复、结果确认回执、tab 聚焦/关闭、媒体传输与上传复用、账号自动发现/验证；RSS 认领在账号检查时采集一次；微信公众号文章/短语音、微博贴图、小红书长文/播客、即刻贴图、豆瓣图文草稿、知乎文章/视频、X 图文/视频、百家号图文/视频/动态、小宇宙/喜马拉雅/蜻蜓 FM/荔枝单音频已真机通过；头条号驱动代码保留但产品状态为 planned | 头条号完整开发验收、微信长播客改走 RSS、微博/小红书视频回归、其余未列平台组合、账号与发布全平台回归、真机安装包验证 |
| 应用内网页生图 | 豆包任务契约、本机后端持久化、扩展串行执行、原图下载、Vault 落盘和按需 CLI | 页面入口、Agent/MCP 接口、更多平台 |

阅读和实现时必须区分“已落地”和“尚未完成”。未完成迁移的代码不得被描述为已满足目标契约。

当前实施范围包含浏览器扩展的正式发布迁移和播客 RSS 分发，见 [`publish-migration.md`](../todos/publish-migration.md) 与 [`podcast-rss.md`](./podcast-rss.md)。网页生图作为应用内部能力接入，并由按需 CLI 调用，规则见 [`image-generation.md`](./image-generation.md)；Agent/MCP 不在此能力范围内。

## 目录

1. [产品原则](#1-产品原则)
2. [核心决策](#2-核心决策)
3. [总体架构](#3-总体架构)
4. [仓库与进程](#4-仓库与进程)
5. [Vault 内容模型](#5-vault-内容模型)
6. [直接编辑与一致性](#6-直接编辑与一致性)
7. [本地文件状态库](#7-本地文件状态库)
8. [ElysiaJS 后端](#8-elysiajs-后端)
9. [发布任务](#9-发布任务)
10. [浏览器扩展](#10-浏览器扩展)
11. [Obsidian 插件](#11-obsidian-插件)
12. [Web UI](#12-web-ui)
13. [平台迁移矩阵](#13-平台迁移矩阵)
14. [算法与资源评估](#14-算法与资源评估)
15. [迁移](#15-迁移)
16. [测试](#16-测试)
17. [非目标](#17-非目标)
18. [已定决策记录](#18-已定决策记录)

## 1. 产品原则

1. **稿子是主体，平台只是出口。**
2. **本地 Markdown 文件是内容唯一事实源。**
3. **发布事实只记录在发布任务中，稿件不保存发布状态。**
4. **编辑器自己的未保存内容是 Buffer；应用之间只通过磁盘 Markdown 交换内容。**
5. **Web、Obsidian、桌面壳和未来的 Agent 共用同一个本地后端与同一套发布队列。**
6. **浏览器登录态留在用户日常浏览器中，不再复制 Chrome profile。**
7. **人工操作是显式状态，不把“等待用户完成”伪装成成功或失败。**

## 2. 核心决策

| 决策 | 结论 |
|---|---|
| 内容事实源 | Vault 内 Markdown 文件 |
| 内容索引 | 直接扫描 frontmatter 与 Markdown，不保存全量内容副本 |
| 数据库 | 不使用 SQLite / Prisma；运营状态改存本地文件状态库 |
| 后端 | 独立 Bun + ElysiaJS 进程，承载 HTTP、WebSocket、文件监听与发布任务 |
| 前端 | Next.js 只负责界面，不承载业务 API 或 WebSocket upgrade |
| Obsidian | 插件直接编辑 Vault 文件；发布、账号和任务状态通过后端 API |
| 发布通道 | Chrome / Edge MV3 扩展；删除专用 Chrome profile、导入登录态、会话池与租约池 |
| 平台协议 | 扩展驱动优先；只有凭据可直接调用的平台保留 server 直连 API |
| Markdown 方言 | CommonMark + GFM；不接受 Obsidian wiki link、wiki embed、callout 等专有语法 |
| 媒体引用 | 不限制相对目录、绝对路径或 HTTP(S) URL；统一解析成有序媒体列表 |
| 发布快照 | 入队时冻结 Markdown、媒体引用与通道信息；执行时再从快照渲染 |
| 默认发布意图 | 所有平台只填充编辑页并停在人工确认；即使平台能力声明支持自动提交，也不代点发布 |
| 发布链接 | 自动回执或人工填写，均持久化到发布任务，不写回 Markdown |

<a id="module-map"></a>
## 3. 总体架构

```text
Next.js 前端（apps/web）       CLI（apps/cli）
  │  HTTP / WebSocket             │  HTTP
  └───────────────┬────────────────┘
                  ▼
ElysiaJS 本地后端（apps/api，仅监听 127.0.0.1）
  ├─ Markdown 文件读写 / watcher
  ├─ frontmatter / 渲染 / 媒体解析
  ├─ 发布任务状态机
  ├─ 账号 verify
  ├─ 文件状态库
  └─ 扩展连接与任务下发
  │
  ├───────────────┐
  │               │
Obsidian 插件     浏览器扩展（MV3）
  │               │
  └── 直接读写 ───┴── Vault Markdown 文件
```

关键边界：

- Next.js 与 Obsidian 都不实现发布状态机。
- Obsidian 插件与 Next.js 可以读取同一份 Markdown，但彼此不维护共享文档对象。
- 扩展不持有平台账号凭据，只执行后端下发的结构化任务。
- CLI 只调用本机 API，不读取 Cookie、不连接扩展，也不保存第二套任务状态。
- 后端是发布任务、账号与扩展连接的唯一写入方。
- 内容文件由 Web 后端和 Obsidian 分别直接写入；不引入跨应用 CRDT。
- 本机 API 的 CORS 只额外放行固定 Obsidian WebView 来源 `app://obsidian.md`；其余非本机 HTTP 与已登记扩展来源继续拒绝。

## 4. 仓库与进程

```text
apps/
├── web/                    # Next.js：内容库、编辑器、队列、设置
├── api/                    # Bun + ElysiaJS：唯一后端进程
├── cli/                    # 按需 CLI：调用 api 完成平台发布与生图任务
├── desktop/                # Electron：启动 api 与 web，不实现业务
├── native-host/            # Chrome / Edge Native Messaging 动态端口发现
├── obsidian/               # Obsidian 插件：直接编辑 MD，发布时调用 api
└── extension/              # Chrome / Edge MV3 发布扩展

packages/
├── shared/                 # DTO、frontmatter schema、API / WS 协议
├── vault/                  # MD 扫描、解析、原子写、watcher、媒体解析
├── render/                 # CommonMark + GFM → HTML / plain
├── server/                 # 发布任务、账号、扩展调度
└── platforms/
    ├── core/               # 平台能力声明、发布输入契约
    └── */                  # 平台知识、driver、API 客户端
```

默认端口：

- `apps/api`：`127.0.0.1:4311`，可用 `TASSELLO_API_PORT` 覆盖。
- `apps/web`：开发默认 `127.0.0.1:3000`，由 Next 自身管理。
- Electron 启动 API 与 Web 两个常驻进程；CLI 只在命令执行期间启动。

### 4.1 删除项

- 删除 Prisma schema、生成的 Prisma client 与 `packages/db` 的运行时依赖。
- 删除 `Post` / `Asset` 数据模型。
- 删除专用 Chrome profile、`importProfile`、profile 文件锁、导入阻断、`profileGeneration`、浏览器会话池与 CDP browser lease。
- 删除 Obsidian 插件内的 CDP 管理器、本地发布任务引擎、发布 ledger 与 `.base` 发布库。
- `packages/cdp` 只可作为迁移期探针工具保留；产品路径不得依赖 CDP。

<a id="content-model"></a>
## 5. Vault 内容模型

### 5.1 目录

默认内容根目录为 `~/Documents/Onda/`，用户在设置页可选择已有 Obsidian Vault。

```text
~/Documents/Onda/
├── articles/
│   └── 文章标题.md            # 文章 Markdown，不再额外嵌套层级
├── images/
│   └── 贴图标题.md            # 贴图内容的 Markdown
├── videos/
│   └── 视频标题.md            # 视频内容的 Markdown
├── audios/
│   └── 音频标题.md            # 音频内容的 Markdown
├── files/                     # 默认粘贴/上传资源根目录，可通过设置修改
│   └── <document-id>/
│       └── <timestamp>-<filename>
└── .onda/
    └── trash/                 # 与 Obsidian 的 .trash 分开
```

`files/` 只保存二进制资源，不复制或生成 `.md` 文件。默认上传路径是
`files/<document-id>/<timestamp>-<filename>`；`attachmentPath` 可以改成其它相对目录或绝对目录。

媒体不要求放稿件旁。图片、视频和音频可以位于内容目录任意位置、目录外绝对路径或 HTTP(S) URL。
Obsidian 自己粘贴资源时继续使用 Obsidian 的「文件与链接 → 新附件的默认位置」，与 Web 的资源目录设置互不覆盖。

### 5.2 frontmatter

每篇稿件必须使用 YAML frontmatter。frontmatter 是内容索引来源，不是发布状态存储。

```yaml
---
tassello:
  id: m5xk2q9f
  type: article
  manualOrder: 100
  platforms:
    - wechat
    - weibo
  cover: ../files/m5xk2q9f/cover.png
  options: {}
---
# 标题

正文……
```

字段约束：

| 字段 | 必需 | 说明 |
|---|---|---|
| `id` | 是 | 稳定唯一 ID；文件重命名、移动后仍保持发布关联 |
| `type` | 是 | `article` / `image` / `video` / `audio` |
| `manualOrder` | 否 | 自定义排序值 |
| `platforms` | 否 | 默认发布平台 |
| `cover` | 否 | 稿件封面引用；相对路径、绝对路径或 HTTP(S) URL |
| `options` | 否 | 平台参数 |

约束：

- 标题取第一个非代码块 H1；frontmatter 不重复存 title。
- 创建时间和更新时间分别从文件 birthtime / mtime 派生，不写入 frontmatter。
- 未知 frontmatter 字段必须原样保留。
- `cover` 是稿件级资产引用。没有显式封面时，任务快照默认使用第一张有效图片。
- 上传的新封面写入当前稿件的资源目录，并以 `role: "cover"` 标记；独立封面不进入正文媒体顺序。
- 文章发布只对声明了封面能力的平台执行封面设置；播客沿用节目/专辑封面，只有平台明确要求时才上传稿件封面；视频多比例适配在视频平台接入时完成。
- `id` 重复时，所有重复文件标为 `identity_conflict`，禁止发布。
- frontmatter 损坏、缺 ID 或类型非法时标为 `invalid_frontmatter`，不自动修复。
- 发布状态、任务 ID、发布链接、失败原因不得写入 frontmatter。
- 文件外部重命名由 watcher 更新路径；不按标题反推路径。
- Obsidian 插件只维护身份、类型等必要元数据，不写时间戳。

### 5.3 Markdown 支持范围

唯一支持口径为 CommonMark + GFM：

- 标题、段落、强调、链接、图片、列表、引用、代码块、表格、删除线。
- 原生 HTML 不进入内容模型；遇到后报告为不支持的语法。
- Obsidian wiki link / embed、callout、块引用、Dataview 等专有语法不支持。
- frontmatter 只在解析阶段消费，不进入平台正文。

Web 编辑器可以继续使用富文本交互，但编辑与保存契约必须是 Markdown：

- 前端不持有 `body` / `bodyHtml` 双份持久内容。
- 每次保存都把编辑器内容规范化为 Markdown 字符串。
- 打开稿件时由 Markdown 解析生成编辑器视图。
- 任何无法规范化的结构必须拒绝保存并提示，不做静默降级。
- `packages/render` 是 Markdown → HTML / plain 的唯一实现。

复杂度：解析与渲染单篇均为 `O(B)`，`B` 为 Markdown 字节数。

### 5.4 媒体引用与顺序

标准 Markdown 图片/媒体引用支持：

```md
![说明](../任意目录/图片.png)
![说明](/Users/me/Pictures/图片.jpg)
![说明](https://example.com/image.webp)
![视频](../媒体/demo.mp4)
![音频](/Users/me/Music/episode.mp3)
```

解析为：

```ts
type MediaRef = {
  raw: string;
  kind: "image" | "video" | "audio";
  source: "relative" | "absolute" | "url";
  resolved: string;
  contentHash: string | null;
  order: number;
  role: "body" | "cover";
};
```

解析规则：

1. 相对路径相对于当前 Markdown 文件解析。
2. 绝对路径直接读取；HTTP(S) URL 由后端按需获取。
3. 类型按扩展名与 MIME 签名共同判断，不能只相信文件名。
4. 正文媒体顺序始终取 Markdown 中第一次出现的顺序；`role: "cover"` 是稿件级封面，不参与正文媒体排序。
5. 远程 URL 不加入扩展 `host_permissions`；后端下载或转发，避免扩展申请任意域名权限。
6. URL 失效、MIME 非媒体、超过大小上限时，在预览和发布预检中明确报错。
7. 远程 URL 只允许 `http` / `https`，限制重定向次数与响应大小；默认拒绝私网目标，避免同步来的 Markdown 触发本地 SSRF。

内容类型决定发布语义：

| 类型 | 正文 | 媒体 |
|---|---|---|
| 文章 / 图文 | 保持 Markdown 原始顺序和图片位置 | 按正文出现顺序，上传后原位替换或交给平台编辑器 |
| 贴图 / 想法 | 文本独立渲染 | 提取所有图片，按 Markdown 出现顺序组成图集，与图片所在段落无关 |
| 视频 / 音频 / 播客 | 标题、简介独立 | 提取对应媒体，按出现顺序组成媒体数组；平台适配器决定主媒体及附加能力 |

发布输入统一为：

```ts
type PublishDocument = {
  id: string;
  type: ContentType;
  title: string;
  markdown: string;
  html: string;
  plain: string;
  media: MediaRef[];
  cover: string | null;
  contentHash: string;
};
```

<a id="consistency"></a>
## 6. 直接编辑与一致性

### 6.1 两个应用只通过文件系统交换内容

- Web 编辑器维护自己的本地编辑 Buffer。
- Obsidian 原生编辑器维护自己的 CodeMirror Buffer。
- 两侧都不知道对方的内存状态。
- 两侧都以磁盘 Markdown 为交换介质。
- 后端通过 `chokidar`/文件 watcher 发现外部修改。
- Obsidian 插件通过 `vault.on("modify" / "rename" / "delete")` 发现外部修改。

Obsidian 的 Markdown 视图继承 `TextFileView`；官方 API 对自动保存的说明是 2 秒防抖。因此：

- 编辑事件先于磁盘写入。
- Web 端最多约 2 秒后才能看到 Obsidian 的最新编辑。
- 发布前插件必须调用当前 `MarkdownView.save()`，再从磁盘读取并创建快照。
- 发布任务不得直接读取尚未落盘的编辑器 Buffer。

### 6.2 保存协议

所有应用写 Markdown 时都遵循：

1. 读取文件并记录 `mtime + size + hash`。
2. 在本地 Buffer 编辑。
3. 保存前重新读取磁盘并比较 fingerprint。
4. 未变化：写同目录临时文件，再原子 `rename`。
5. 已变化：停止覆盖，进入冲突流程。

冲突处理：

- 无本地改动：重新加载磁盘版本。
- 本地有改动且可三方合并：以最近一次读取版本为 base 合并。
- 无法安全合并：把本地版本写为 `标题.conflict-YYYYMMDD-HHmm.md`，再加载磁盘版本。
- 永不 last-write-wins 静默覆盖。

### 6.3 多应用同时编辑的边界

仅直接写 MD 时，操作系统层面仍是最后一次写入获胜。Hash 检查可以显著缩小窗口，但不能提供真正的并发编辑保证。

设计采用：

- Web 保存前做 revision 检查。
- Obsidian 插件监听外部修改；当前笔记有未保存改动时，先保存冲突副本，再提示重新加载。
- 设置 `TASSELLO_DATA_DIR/state/locks/<documentId>.json` 软编辑租约，用于提示“该稿正在另一个应用编辑”。
- 不为跨应用编辑引入共享 Buffer、Yjs 或 CRDT。

如果用户要求绝对的单写者保证，则产品规则为：同一稿件同一时间只在一个应用里进入编辑态；租约由 Web 与 Obsidian 插件共同遵守。Obsidian 原生编辑器没有公开的强制只读 API，因此该限制必须通过 UI 提示和操作流程执行，不能伪称为文件系统硬锁。

### 6.4 无全局内容索引

- 不维护 `id → 全文` 的内存 Map。
- 不把 Markdown 或 HTML 复制进数据库。
- 每次列表请求扫描目标类型目录，只解析 frontmatter 与 H1。
- 每次搜索请求按需扫描正文。
- 文件 watcher 只发失效通知，不常驻正文。

算法与代价：

| 操作 | 复杂度 | 说明 |
|---|---|---|
| 打开单稿 | `O(B)` | 读取并解析一个 Markdown |
| 列表 | `O(N)` 次头部读取 | `N` 为文件数 |
| 搜索 | `O(N × B)` | 无全文索引的明确代价 |
| 排序 | `O(N log N)` | 内存中只保留轻量列表 DTO |
| watcher 事件 | 按变更文件数 | 批量事件需防抖合并 |

## 7. 本地文件状态库

不使用 SQLite。发布系统所需的运营状态存放在 `TASSELLO_DATA_DIR/state/`，统一使用 `.onda` 命名空间：

- 开发态默认 `TASSELLO_DATA_DIR=<repo>/.onda/`。
- 安装包默认 `TASSELLO_DATA_DIR=<platform appData>/Onda/`。
- 独立启动 API 且未指定环境变量时，回退到 `~/.onda/`。

三者允许位置不同，但内部职责和目录结构必须一致。

```text
TASSELLO_DATA_DIR/
├── runtime.json                 # API 端口、临时 runtimeId、pid、协议版本；不含长期 token
├── secrets.json                 # API 凭据，chmod 600
└── state/
    ├── identity.json            # 稳定 installationId，首次启动生成
    ├── settings.json
    ├── accounts/
    │   └── <platform>.json
    ├── extensions/
    │   └── <clientId>.json
    ├── extension-preference.json  # 当前选择的 Chrome / Edge
    ├── tasks/
    │   └── <taskId>.json
    ├── logs/
    │   └── <taskId>.jsonl
    ├── uploads/
    │   └── <platform>/<account>/<contentHash>.json
    └── locks/
        └── <documentId>.json
```

文件职责：

- `settings.json`：默认平台、内容目录、资源目录、主题和界面设置。
- `accounts/<platform>.json`：账号 profile、verify 状态、频道列表。
- `extensions/<clientId>.json`：连接状态、扩展版本、浏览器 UA、token 哈希、撤销状态、最近心跳。
- `tasks/<taskId>.json`：任务状态、发布快照和发布链接。
- `logs/<taskId>.jsonl`：追加式结构化事件。
- `uploads/.../<contentHash>.json`：远端素材上传去重。
- `locks/<documentId>.json`：编辑租约。

一致性规则：

1. Elysia 后端是状态目录的唯一写入进程。
2. 后端启动时获取实例锁，拒绝第二个后端同时写入。
3. 单文件更新采用临时文件 + 原子 rename。
4. 发布进度最多每 250–500ms 落盘一次，内存中做节流。
5. 日志 append-only；任务状态可从快照与日志恢复。
6. 任务设定保留期或数量上限，避免 JSON 无限增长。
7. 状态文件损坏时进入可诊断错误页，不静默重建覆盖。

<a id="backend"></a>
## 8. ElysiaJS 后端

### 8.1 职责

- 提供 REST API。
- 提供 WebSocket：客户端事件与扩展连接。
- 读取、写入、扫描 Markdown。
- 解析 frontmatter、渲染 HTML、提取媒体。
- 执行账号 verify 与发布任务状态机。
- 调度浏览器扩展。
- 管理文件状态库。

Next.js 不再有业务 Route Handler，也不承载 WebSocket upgrade。

### 8.2 API

```text
GET    /api/v1/documents
GET    /api/v1/documents/:id
POST   /api/v1/documents
PATCH  /api/v1/documents/:id
DELETE /api/v1/documents/:id

POST   /api/v1/publish
GET    /api/v1/tasks
GET    /api/v1/tasks/:id
POST   /api/v1/tasks/:id/confirm
POST   /api/v1/tasks/:id/retry
DELETE /api/v1/tasks/:id
POST   /api/v1/tasks/:id/focus-tab

POST   /api/v1/generations
GET    /api/v1/generations
GET    /api/v1/generations/:id
DELETE /api/v1/generations/:id

GET    /api/v1/accounts
POST   /api/v1/accounts/:platformId/verify

POST   /api/v1/extensions/open-install
POST   /api/v1/extensions/auto-pair
GET    /api/v1/extensions
DELETE /api/v1/extensions/:clientId
```

`GET /api/v1/runtime` 同时返回 `cliProtocolVersion`；CLI 在每次调用前校验版本，协议不一致时要求同时更新 API、Web 与 CLI。任务 DTO 从发布快照派生 `contentType`，供 CLI 按平台和类型查询，不新增第二套任务字段。

WebSocket：

```text
/ws/client       # Next / Obsidian 接收任务、账号、文件变化
/ws/extension    # 浏览器扩展接收任务并上报事件
```

### 8.3 鉴权

- server 只监听 `127.0.0.1`。
- Web UI 通过 Elysia 建立短期本机会话；CORS 只允许已知 Web origin。
- Obsidian 插件通过一次性配对码换取插件 token。
- 浏览器扩展通过 Native Messaging 获得当前 `apiOrigin`，再由官方扩展 ID 白名单换取 token。
- 不同 token 绑定不同能力域：UI、Obsidian、扩展、Agent 不能互相冒充。
- Agent 只通过后端 API / WebSocket 接入，不得直接控制浏览器扩展；详见 [`agents.md`](./agents.md)。
- 扩展 token 只存哈希；撤销后立即断开现有连接。
- `runtime.json` 只做端口与实例发现，不传递长期 token。

### 8.4 平台适配器
平台包继续保存平台能力声明与发布逻辑，但执行上下文改为扩展任务：

- `meta`：名称、颜色、支持类型、登录页、默认草稿/自动发布能力。
- `driver`：打包进扩展的页面操作逻辑。
- `api`：凭据足以直接请求的平台保留 server 直连。
- `verify`：扩展打开后台标签页读取账号资料，返回纯 JSON profile。
- `publish`：server 生成任务数据，扩展执行并回传结构化事件。

`authMode` 新增 `"extension"`；不再使用 `cdp` 作为产品通道。

<a id="publish"></a>
## 9. 发布任务

### 9.1 快照

发布请求显式提交当前 Markdown 来源，不再由后端按全局 Vault 猜测稿件：

```ts
type PublishSource = {
  id: string;
  filePath: string;
  vaultPath?: string;
  markdown: string;
  fingerprint: string;
};
```

- `filePath` 是相对 Vault 的 Markdown 路径；Obsidian 同时提交当前 Vault 的绝对根路径。
- 后端只在该文件目录下解析相对资源路径，不读取或切换全局 Vault。
- `fingerprint` 是提交 Markdown 的 SHA-256，用于防止传输内容与声明不一致。
- `id` 继续稳定标识稿件；文件重命名后 ID 不变，发布任务仍可保留身份关联。

校验来源后冻结：

```ts
type PublishSnapshot = {
  documentId: string;
  documentPath: string;
  title: string;
  type: ContentType;
  markdown: string;
  bodyHtml: string;
  plainText: string;
  media: MediaRef[];
  contentHash: string;
  platformId: string;
  accountUid: string | null;
  targetChannel: { id: string; name: string } | null;
  options: Record<string, unknown>;
};
```

入队时用统一 CommonMark + GFM 渲染器冻结 `bodyHtml` 与 `plainText`。执行时只读快照，平台驱动只把正文中的有序媒体占位替换为平台上传结果，不重新解释 Markdown，也不使用 CDP 历史选择器。媒体在执行前校验内容 hash；文件被替换则 fail fast。

重试创建新任务并记录 `retryOfTaskId`，不覆盖旧任务的发布结果链接。

### 9.2 状态机

```text
queued
  → rendering
  → uploading
  → filling
  → awaiting_confirm
  → success

任一阶段 → failed
queued / awaiting_confirm → cancelled
```

补充状态：

- `waiting_extension`：任务已生成，但扩展未连接。
- `unknown`：已经观察到可能提交，但无法确认平台结果；禁止自动重试。

`awaiting_confirm` 表示平台编辑器已填好，等待用户完成平台侧动作或等待扩展收到成功回执。它不是失败，也不是默认需要用户回 Tassello 点“确认”。

当前产品默认 `options.intent = "draft"`。自动提交是未来显式能力，不得根据平台 `autoSubmit` 元数据默认开启。成功或等待确认后保留平台标签页；只有用户主动取消任务时才自动关闭扩展创建的标签页。

### 9.3 发布链接

任务文件包含：

```ts
type PublishResult = {
  resultUrl: string | null;
  resultUrlSource: "auto" | "manual" | null;
  noPublicUrl: boolean;
  confirmedAt: string | null;
};
```

来源规则：

1. **自动回执**：扩展监听平台提交成功响应、跳转或明确成功信号，回传 URL；server 将任务置为 `success`。
2. **人工填写**：自动信号缺失时，用户在任务弹层填写 `http(s)` 发布链接，server 保存并置为 `success`。
3. **无公开链接**：平台确实不提供公开地址时，用户显式选择“无公开链接”，保存 `noPublicUrl: true`，不得用空字符串伪装成功。
4. 自动拿到 URL 后，用户仍可手动修正，最终来源改为 `manual`，并记录日志。
5. 链接始终保存在任务文件中；稿件被删除或改名后，历史队列仍能打开平台成品。

发布链接不写回 frontmatter。

<a id="extension"></a>
## 10. 浏览器扩展

### 10.1 目标

用用户日常浏览器里的 MV3 扩展替代专用 Chrome profile：

- 不复制 Default profile。
- 不导入 Cookies、Local Storage、Session Storage 或 Local State。
- 不维护 profileGeneration。
- 不启动应用专用 Chrome。
- 不在 server 内维护 CDP 会话池和模式租约。

Chrome 与 Edge 使用同一扩展包。开发期 load unpacked；发布期 Chrome Web Store + Edge Add-ons。

### 10.2 工程结构

```text
apps/extension/src/
├── background.ts         # Native Messaging 发现、自动配对、WS、任务路由
├── popup.*               # 连接状态、当前任务、打开应用
├── drivers.ts            # 已打包的平台页面驱动
├── protocol.ts           # 扩展内部连接状态
└── manifest.json         # 固定手动安装 ID、nativeMessaging 权限

apps/native-host/
├── src/index.ts          # 长度前缀 Native Messaging 协议
├── src/register.ts       # Chrome / Edge / Chromium Host manifest 注册
└── scripts/              # 编译与本地注册
```

驱动代码随扩展版本一起打包。server 只能下发数据，不能下发 JS 字符串或选择器代码。

### 10.3 自动配对与连接

浏览器扩展通过 Native Messaging 自动发现动态 API 端口并配对，用户不接触地址或短码：

1. 用户在基础设置选择 Chrome 或 Edge，应用通过本机服务在对应浏览器打开安装入口。
2. 安装包注册固定名称 `com.jiuyang.onda` 的 Native Messaging Host。
3. Host manifest 的 `allowed_origins` 只允许官方、手动安装和开发扩展 ID。
4. 扩展安装或启动后通过 `chrome.runtime.sendNativeMessage()` 请求当前运行环境。
5. Host 读取 `~/.onda/runtime.json`，校验 loopback origin 后返回动态 `apiOrigin` 与 `runtimeId`。
6. 扩展换取长期 token，通过 `/ws/extension` 建立连接并上报浏览器、版本和心跳。
7. 设置页与扩展 popup 只显示连接状态色，不要求用户填写地址、短码或手动确认配对。

约束：

- 开发环境 API 固定为 `127.0.0.1:4311`，Native Host 仍用于统一验证扩展身份。
- 安装包 API 可继续使用动态端口；Native Host 负责运行时发现。
- 浏览器负责 Native Messaging 的扩展 ID 校验；API 仍通过 token 鉴权，不得免鉴权。
- 手动安装扩展必须固定 manifest key；正式版登记 Chrome Web Store 与 Edge Add-ons 两个扩展 ID。
- 手动/开发版 ID 固定为 manifest key 派生值；商店版通过 `ONDA_CHROME_EXTENSION_ID`、`ONDA_EDGE_EXTENSION_ID` 或 `ONDA_EXTENSION_IDS` 加入允许列表。
- `bun run dev` 和桌面安装包必须注册 Native Host；手动安装包由 GitHub Releases workflow 产出。
- 用户最后明确选择的浏览器持久化到 `extension-preference.json`；旧扩展连接自动关闭，非当前浏览器的后续重连会被拒绝。
- 设置页和 popup 不显示配对码、地址输入框或“我已连接”确认。

设置页不再提供浏览器下拉框或“导入登录态”。

连接归属：

- 扩展 token 绑定稳定 `installationId` 与本机 API origin，不绑定 Web、Obsidian 或桌面窗口。
- `runtimeId` 只标识单次后端进程生命周期；后端重启后，扩展使用同一 `installationId` 自动重连。
- Web 与 Obsidian 都是同一后端的客户端，只读取发布能力状态；不得各自保存“扩展连接给某个应用”的副本。
- 一个 installation 同时只保留一个浏览器扩展执行连接；Web、Obsidian 与 Agent 可以同时连接后端。
- 扩展心跳更新内存状态；磁盘只在连接建立、断开、撤销和低频检查点时刷新，避免每次心跳写文件。

### 10.4 任务协议

```ts
type ServerMessage =
  | { type: "ready"; installationId: string }
  | { type: "job.dispatch"; job: ExtensionJob }
  | { type: "generation.dispatch"; job: ImageGenerationJob }
  | { type: "job.cancel"; jobId: string }
  | { type: "generation.cancel"; jobId: string }
  | { type: "job.focusTab"; jobId: string; tabId: number }
  | { type: "job.closeTab"; jobId: string; tabId: number }
  | { type: "job.result.ack"; jobId: string }
  | { type: "ping" };

type ExtensionMessage =
  | { type: "hello"; clientId: string; token: string; extVersion: string }
  | { type: "job.event"; jobId: string; event: DriverEvent }
  | { type: "job.result"; jobId: string; result: DriverResult }
  | { type: "generation.event"; jobId: string; event: GenerationEvent }
  | { type: "generation.result"; jobId: string; result: GenerationResult }
  | { type: "ping" };
```

规则：

- `jobId` 由 server 生成，扩展持久化最近完成结果。
- server 只有在任务结果落盘后才返回 `job.result.ack`；扩展收到确认前会在重连后重发结果。
- WS 断开不改变任务事实；重连后扩展上报执行中的 job。
- 任务执行期间扩展每 20 秒调用一次扩展 API 保活 Service Worker，并向 server 发送 ping。
- verify 超时 60 秒；普通发布超时 10 分钟；素材上传单独计时。
- 看到明确成功回执才自动 success。
- 已经可能提交但结果不确定时标记 `unknown`，不能自动重试以免重复发布。
- 成功和等待确认都不自动关闭标签页；用户可通过“关闭标签页”显式清理，取消任务时关闭本次任务创建的标签页。
- 发布和生图共用唯一扩展执行通道，但使用不同任务类型和回执消息；生图不使用发布快照或平台注册表。

### 10.5 页面执行

- DOM 操作使用 content script。
- 需要页面全局对象、签名函数或同站请求时使用 MAIN world 的已打包代码。
- 数据只通过 JSON 序列化边界传递。
- 文件使用 `DataTransfer + File` 注入；懒创建的 input 也可处理。
- 闭合 shadow DOM 中的关键发布按钮不强行穿透；无法安全触发时填好内容并等待用户完成。
- 合成事件限制如实保留；不能安全自动化的步骤停在人工操作。
- 大视频不能宣称常量内存：下载与构造 File 仍可能需要文件大小的内存。当前单文件上限 64 MiB、单次总量上限 128 MiB；超过时明确失败并请在平台页面手动选择文件，不用无界注入拖垮浏览器。

### 10.6 权限

最小权限：

```text
storage, scripting, tabs, alarms, nativeMessaging
```

`host_permissions` 只包含：

- `http://127.0.0.1/*`
- `http://localhost/*`
- `https://doubao.com/*`
- `https://www.doubao.com/*`
- `https://weibo.com/*`
- `https://passport.weibo.com/*`
- `https://mp.weixin.qq.com/*`
- `https://creator.xiaohongshu.com/*`
- `https://web.okjike.com/*`
- `https://www.zhihu.com/*`
- `https://zhuanlan.zhihu.com/*`
- `https://x.com/*`
- `https://www.douban.com/*`
- `https://m.douban.com/*`
- `https://www.xiaoyuzhoufm.com/*`
- `https://podcaster.xiaoyuzhoufm.com/*`
- `https://www.ximalaya.com/*`
- `https://studio.ximalaya.com/*`
- `https://passport.ximalaya.com/*`
- `https://nj.lizhi.fm/*`

不包含 `<all_urls>`、`chrome.debugger`、对象存储域名或任意图片 URL。

### 10.7 verify

- 扩展首次连接后，对缺失和过期账号执行增量 verify；协议、状态和失败路径见 [`account-sync.md`](./account-sync.md)。
- verify 使用后台标签页，保存平台返回的纯 JSON profile。
- 登录失效时，打开平台登录页，用户当场登录；登录成功后自动重试 verify。
- 不再有“去复制浏览器登录态”的提示。

<a id="hosts"></a>
## 11. Obsidian 插件

### 11.1 定位

插件是 Obsidian 与 Tassello 发布系统之间的桥，不是第二套发布引擎。

保留：

- 监听当前 Markdown buffer。
- 调用 `MarkdownView.save()` 强制落盘。
- 监听 Vault 的 `create / modify / rename / delete`。
- 预览、默认发布目标、任务状态和紧凑发布通道状态。
- 后端离线时的本地 Markdown 预览。

删除：

- Chrome/CDP 连接与 profile 设置。
- 本地 TaskEngine、平台适配器执行、publication-ledger、`.base` 发布库。
- 向 frontmatter 写发布状态、任务 ID、链接或失败原因。

### 11.2 发布流程

1. 用户点击发布。
2. 插件获取当前 `MarkdownView`。
3. 调用 `save()`，确保编辑器 Buffer 已写入磁盘。
4. 插件向后端提交文档 ID、当前 Vault、相对路径、Markdown、fingerprint、平台与频道。
5. 后端按显式文件路径解析本地资源，并生成不可变快照，不依赖全局 Vault 查找。
6. 插件订阅任务事件并显示进度、平台标签页和发布链接。
7. 任务完成后链接保存在后端任务文件中，插件从 API 读取。

### 11.3 设置

- 主界面常驻信息只保留发布通道状态色，不逐行展示 API 地址、浏览器名称、扩展版本或心跳。
- API 地址、实例身份、配对与撤销放在按需打开的连接诊断中。
- 当前 Vault 路径与绑定状态放在基础设置。
- 插件粘贴资源沿用 Obsidian 自身的附件目录设置，不另存一份目录配置。

不再有 Chrome channel、publication base path、发布库自动创建等设置。

## 12. Web UI

### 12.1 设置

- 基础设置：主题、浏览器扩展、内容目录、资源目录。
- 浏览器扩展：Chrome/Edge 安装行、连接与撤销；主视图只显示状态色，详细信息按需展开。
- Vault：路径、检测到的 Obsidian Vault、文件状态。
- 资源目录：相对内容目录或绝对路径；只影响九漾的粘贴、上传和新引用。
- 平台账号：连接、需要登录、verify 中、扩展离线。
- 默认发布平台。

删除：

- 浏览器选择下拉框。
- 导入 profile。
- 日常浏览器运行检测。
- Cookies 覆盖确认。

### 12.2 内容库与编辑器

- 卡片数据来自 Markdown 扫描和 frontmatter。
- 状态：`ready`、`missing`、`identity_conflict`、`invalid_frontmatter`、`cloud_placeholder`。
- 编辑器显示 Markdown 内容；保存写回 `.md`。
- 外部修改与编辑租约必须显式展示。
- 粘贴图片时允许写入 Vault 任意位置，也可引用外部 URL。
- 发布前强制保存并创建快照。

### 12.3 发布队列

- 方块显示平台与频道。
- 状态包括运行中、等待扩展、等待平台完成、成功、失败、结果未知。
- `awaiting_confirm` 时提供“聚焦平台页”。
- 自动回执成功后直接显示成品链接。
- 自动回执缺失时提供手动确认弹层：
  - 填写合法 `http(s)` 链接；
  - 或显式勾选“该结果没有公开链接”。
- 重试创建新任务，旧任务及旧链接保留。
- 删除队列记录只删任务状态，不删 Markdown。

## 13. 平台迁移矩阵

| 平台 | 目标通道 | 迁移重点 |
|---|---|---|
| 微博 | 扩展 | verify、React textarea 填充、媒体注入、成功回执 |
| 微信公众号 | 扩展 | 文章/贴图/视频/播客四形态；保留草稿与人工步骤 |
| 小红书 | 扩展 | creator 驱动、闭合 shadow DOM、MAIN world 签名 |
| 知乎 | 扩展 | 文章/想法页面请求或编辑器，沿用接口知识 |
| X | 扩展 | composer、媒体、成功信号 |
| 豆瓣 | 扩展 | 页面内 API、草稿、素材上传 |
| 小宇宙 | 扩展 | 音频注入、节目频道、草稿语义 |
| 喜马拉雅 | 扩展 | 音频 input、受控表单、专辑频道 |
| 蜻蜓 FM | 扩展 + RSS | 账号/专辑、单音频上传、RSS 认领后停止直传 |
| 荔枝 | 扩展 | 登录态恢复后重新验证驱动 |
| 即刻 | 扩展 | 页面上下文账号验证、媒体注入与人工发送 |
| 抖音 / B 站 / 头条 / 百家 | 扩展优先 | 新平台不再实现 CDP |

全部 12 个 active 扩展平台驱动已打包进扩展注册表；头条号驱动代码仍随扩展打包，但平台状态为 `planned`，不会出现在可发布目标中。Apple Podcasts 是第 13 个 active registry 条目，只消费 RSS 收录状态，没有扩展驱动。代码迁移完成不等于验收完成：当前逐平台、逐内容类型的真机结果以 [`platforms/README.md`](../platforms/README.md#0-1-浏览器扩展迁移状态) 为准。未验收组合不得描述为可用。

<a id="resources"></a>
## 14. 算法与资源评估

### 14.1 典型负载

- 1,000 篇稿件，平均 30 KB：列表扫描读取约 30 MB frontmatter/头部数据；搜索约 30 MB 文本。
- 同时打开 1–3 篇稿件：编辑器 Buffer 通常小于几百 KB。
- 12 个 active 扩展平台账号、1 个扩展连接：状态文件与 WS 开销可忽略。
- 发布连接状态查询、心跳与切换均为 `O(1)`；单连接 30 秒心跳约 24 KB/小时。
- 每平台每次发布 1–20 张图片：网络与磁盘主要受媒体大小影响。
- RSS 认领只缓存小型元数据；每个 Feed 典型小于 10 KiB，公开索引查询最多读取 1 MiB HTML/JSON。

### 14.2 最坏负载

- 10,000 篇长文时，全量搜索会产生明显的 `O(N × B)` 磁盘读取和 CPU 开销；UI 必须显示扫描状态并支持取消。
- 同步盘或 git checkout 一次修改 1,000 个文件时，watcher 需要合批，避免逐文件重新渲染。
- 1 GB 视频无法保证低内存注入；超阈值必须人工选择文件或使用平台分片接口。
- 多个 verify 标签页不能并发打开；默认串行，最多 1–2 个。
- RSS Feed 最坏响应限制为 2 MiB，并在完整读入内存前检查上限；不下载音频。
- 扩展安装数量不参与调度；最坏情况仍只允许一个活跃扩展连接，避免重复发布和无界状态增长。

### 14.3 资源边界

- GPU：主链路不需要。
- 网络：本地 HTTP/WS 与平台上传；媒体按实际字节传输。
- 磁盘：Markdown 与状态文件都很小；大素材是主要占用。
- 内存：不保存全量内容索引；只有请求内解析结果、当前编辑器 Buffer 和进行中的任务。
- 本机后端、Web、Obsidian 与一个扩展的常驻连接内存通常小于 1 MB；媒体文件和编辑器 Buffer 不计入该值。
- CPU：主要消耗在 Markdown 渲染、全文搜索、文件 hash 与平台页面驱动。
- CLI 进程只在命令期间存在；单次内存约 10–50 MB，`wait` 轮询复杂度为 `O(T / interval)`，不增加 GPU 或外部网络开销。

<a id="migration"></a>
## 15. 迁移

### 15.1 内容迁移

1. 从现有 `Post` / `Asset` 导出 Markdown。
2. 生成 frontmatter：保留现有 ID，写 type、创建/更新时间、默认平台。
3. 资产引用改写为标准 Markdown 路径；占位素材转为无图正文并记录报告。
4. 以正文 hash 和稿件数量对账。
5. 旧数据目录只读保留一个版本周期。

### 15.2 运行时迁移

1. 建立 Elysia API 和文件状态库。
2. Next 改为 API 客户端。
3. Obsidian 插件删除本地发布引擎并接入 API。
4. 浏览器扩展接入分平台灰度。
5. 全部平台验证后删除 CDP profile、导入和会话池。

### 15.3 原型与实施顺序

1. 先修改 Web Mosaic 原型：扩展安装/配对、Vault、frontmatter 异常、编辑冲突、自动/人工发布链接。
2. 同步修改 Obsidian 插件原型：删除 Chrome 导入与发布库，增加后端、扩展、任务和发布链接状态。
3. 用 same-origin mock API 和固定状态 fixture 覆盖全部任务、账号、文件与网络异常态。
4. 按项目规则用 Codex in-app browser 工具对 Web 原型做交互与视觉自动化验证；非 Codex 环境用 Playwright CLI。
5. 原型确认后再实现 `packages/vault`、Elysia API、Next 客户端、Obsidian 客户端和扩展驱动。

<a id="testing"></a>
## 16. 测试

- frontmatter：合法、损坏、重复 ID、未知字段保留。
- Markdown：CommonMark/GFM 黄金用例；不支持语法必须拒绝而非丢失。
- 媒体顺序：文章原位、贴图图集、视频/音频数组。
- 路径：相对、绝对、URL、空格、URL 编码、MIME 伪装、失效 URL。
- 文件一致性：原子写、外部修改、冲突副本、重命名、删除。
- Obsidian：编辑 Buffer → 2 秒保存 → `vault.modify`；发布前强制 save。
- 任务：快照不可变、重试创建新任务、自动/手动链接、无公开链接。
- 扩展：配对、断线重连、幂等、超时、未知结果、tab 聚焦/关闭。
- 安全：token 能力域、撤销、Origin 校验、任意文件读取与 SSRF 防护。
- 前端自动化：按项目要求使用 Codex in-app browser 工具验证 Web 原型与实现。

## 17. 非目标

- 不支持 Obsidian 专有 Markdown 语法。
- 不做跨应用实时协同编辑或 CRDT。
- 不提供多浏览器 profile 或多账号连接路由；同一平台仍为一个登录账号。
- 不将发布状态写入 Markdown。
- 不自动提交必须人工验证的平台步骤。

## 18. 已定决策记录

| 日期 | 决策 |
|---|---|
| 2026-10-26 | Markdown + frontmatter 是内容事实源；取消 SQLite 与 Post/Asset 表 |
| 2026-10-26 | 两个应用直接操作 MD，各自维护 Buffer；不使用共享文档 Buffer |
| 2026-10-26 | 只支持 CommonMark + GFM；拒绝 Obsidian 专有语法 |
| 2026-10-26 | 媒体不限制目录；相对路径、绝对路径、HTTP(S) URL 均支持 |
| 2026-10-26 | 文章保持原始图文顺序；贴图/想法/视频/音频按 Markdown 出现顺序提取媒体 |
| 2026-10-26 | Bun + ElysiaJS 独立后端；Next.js 只做前端 |
| 2026-10-26 | 发布任务、账号、扩展与日志使用文件状态库，不使用 SQLite |
| 2026-10-26 | 发布链接自动或手动写入任务；不写回 frontmatter |
| 2026-10-26 | 专用 Chrome profile/CDP 治理退役，改为唯一 MV3 浏览器扩展通道 |
| 2026-10-27 | 内容根目录统一为 `~/Documents/Onda/`；Vault 管理与开发态状态使用 `.onda` 命名，粘贴资源目录可配置 |
| 2026-10-27 | 浏览器扩展改用 Native Messaging 自动发现动态 API 端口并自动配对；开发环境保留固定 `4311` |
