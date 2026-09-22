# 九漾 Onda（tassello）· 正式项目设计

> 状态：设计定稿，待开工。原型见 `designs/onda-explore/`（方向 C · 色板 Mosaic 为准）。
> 平台通道选型与真机验证记录见 `docs/platforms.md`。

## 1. 产品原则（继承原型）

1. **稿子是主体，平台只是出口。**
2. **发布事实只记在发布队列**——稿子不挂发布状态字段，列表只保留「发布中」瞬时信号。
3. 发布流水线四阶段：`渲染排版 → 上传素材 → 填充编辑器 → 人工确认`。
4. 程序化使用优先；**本期不引入 Agent**，但架构为其预留（见 §9）。

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 / 包管理 | **bun**（workspaces） | monorepo 根即仓库根 |
| UI | **Next.js**（bun init）+ **HeroUI v3** + **reicon-react** | UI 复刻 Mosaic 方向 |
| 桌面壳 | **Electron**（可选宿主） | main / preload 用 TS；网页模式可脱离壳独立运行 |
| 类型检查 | **tsgo**（@typescript/native-preview，即 TS7） | 仅 typecheck；运行时由 bun（服务层）与 Electron（壳）承担 |
| 数据 | **Prisma + SQLite** | 本地单用户；数据目录 `TASSELLO_DATA_DIR`（默认 `~/.local/share/tassello`），库文件与专用 Chrome profile 都放在这里。驱动用 `@prisma/adapter-libsql`（better-sqlite3 在 Bun 下不可用，见 oven-sh/bun#4290） |
| 发布通道 | 官方 API + **Chrome CDP** + RSS（二期） | CDP 是主通道，API 是增强 |

## 3. 总体架构

```
Next.js standalone server（核心，127.0.0.1:<port>，独立进程）
  ├─ UI 层：内容库 / 编辑器 / 发布队列 / 设置（复刻原型三视图 + 设置）
  ├─ HTTP API（Next Route Handlers，薄壳：参数校验后转发服务层）
  └─ 服务层 packages/server（业务全在这里，UI 无关）
       ├─ 发布任务引擎（状态机 + 结构化事件流，UI 水位/勾/错误块直接消费）
       ├─ 平台注册表（机器可读能力声明）
       ├─ 账号管理（API 凭据加密存储；CDP 平台靠共享 profile 登录态 + verify 任务）
       └─ 设置（per 类型默认发布名单等）
  发布 Worker → PlatformAdapter（API 调用 或 CDP 驱动真实 Chrome）

宿主（同一 server、同一份数据）：
  ├─ 网页模式：bun dev / bun start 直接访问 http://127.0.0.1:<port> —— 仅供 Agent（现在的我 / 未来）使用与调试
  └─ 桌面模式：Electron 壳 spawn 同一个 server → BrowserWindow 加载（窗口/托盘/生命周期），产品交付形态
```

- **双形态，单数据源**：server 不依赖任何 Electron API，Electron 只是宿主之一。网页模式不是为了给人当第二产品入口，**就是给 Agent 留的使用与调试通道**（走 HTTP API 或直接操作页面）；两者读写同一个 `TASSELLO_DATA_DIR`。
- **凭据加密抽象 `SecretBox`**：当前实现 `FileSecretBox`（`dataDir/secrets.json`，chmod 600）；桌面模式后续可无缝换 Electron safeStorage 实现，平台适配器无感知。
- **人工确认闭环**：CDP 适配器把内容填进真实浏览器后，任务停在 `stage 3 / progress 100 / running`；队列方块出现「等」字按钮，用户在浏览器点完发布回来点它（`POST /api/tasks/:id {action:"confirm", url?}`，可附回执链接）完成任务。
- 任务状态机：`queued → rendering(渲染排版) → uploading(上传素材) → filling(填充编辑器) → awaiting_confirm(人工确认) → success | failed`
- CDP 平台的「人工确认」是常态而非可选：脚本把编辑器填好，用户在真实浏览器里检查后自己点发布；可信平台可声明 `autoSubmit`。
- 任务引擎按阶段发结构化 JSON 事件 → 同时喂 UI 与 `PublishLog`。

## 4. 目录结构（脚手架已落位）

```
tassello/
├── package.json / bun.lock / tsconfig.json    # bun workspaces 根：apps/* + packages/* + packages/platforms/*
├── CLAUDE.md / README.md
├── designs/                                   # 原型保留
├── docs/                                      # 设计文档（design.md / platforms.md）
├── apps/
│   ├── web/                                   # @tassello/web —— Next.js 16（create-next-app：Tailwind v4 + Turbopack）
│   │   ├── app/                               # App Router 入口（layout / page / globals.css）
│   │   ├── next.config.ts / postcss.config.mjs / eslint.config.mjs / tsconfig.json
│   │   └── package.json                       # deps: next / @heroui/react@3 / reicon-react
│   └── desktop/                               # @tassello/desktop —— Electron 壳（main/preload 实现于实施第 2 步）
│       └── package.json                       # devDeps: electron
├── packages/
│   ├── shared/      # @tassello/shared —— 领域类型 + zod schema
│   ├── db/          # @tassello/db —— Prisma schema / 迁移 / 种子（prisma + @prisma/client，均为 7.10）
│   ├── server/      # @tassello/server —— 发布任务引擎、账号管理、注册表、设置
│   ├── cdp/         # @tassello/cdp —— baoyu-chrome-cdp 移植 + 浏览器会话池
│   ├── render/      # @tassello/render —— md→html、各平台版式适配
│   ├── platforms/
│   │   ├── core/    # @tassello/platform-core —— PlatformAdapter 接口 + 注册表
│   │   ├── wechat/  # @tassello/platform-wechat —— 公众号（API + CDP 双通道）
│   │   └── weibo/   # @tassello/platform-weibo —— 微博（CDP）
│   └── agent/       # @tassello/agent —— 预留（MCP server，本期不实现）
└── ...
```

脚手架说明：

- 全部由 bun 脚手架生成（根 `bun init`、`create-next-app`、各包 `bun init -m`），包名统一改为 `@tassello/*`，嵌套 lockfile 已清理，单根 `bun.lock` 管理。
- 各包当前为最小骨架（package.json + tsconfig.json）；源码布局（`src/`、schema、adapter 实现等）按 §10 实施顺序在各步落地。
- 二期平台（xhs/zhihu/x/…）不建目录，注册表占位；`packages/agent` 仅占位。

## 5. 数据模型（Prisma / SQLite）

```prisma
model Post {
  id          String   @id @default(cuid())
  type        String   // article | image | video | audio（audio 预留，MVP 无适配器）
  title       String?
  body        String?  // 纯文本（编辑器双写的 plain）
  bodyHtml    String?  // 富文本
  updatedAt   DateTime @updatedAt
  manualOrder Int      @default(0)   // 「自定义顺序」排序档；拖拽排序写这里
  assets      Asset[]
}

model Asset {
  id     String @id @default(cuid())
  postId String
  post   Post   @relation(fields: [postId], references: [id])
  kind   String // image | video | audio | file
  path   String
  meta   String @default("{}")
}

model PlatformAccount {
  id            String    @id @default(cuid())
  platformId    String
  state         String    @default("fail") // ok | fail —— 最近一次 verify 的结果
  failReason    String?
  name          String?   // 账号名（展示列）
  uid           String?   // 对外 ID（展示列）
  avatarUrl     String?   // 头像（身份锚点 + 侧栏渲染）
  authExpiresAt DateTime? // CDP 平台一般为 null
  lastCheckedAt DateTime? // 「最近校验」
  lands         String?   // 发布去向一句话
  credentialRef String?   // API 平台：指向 safeStorage 加密密文的引用；机密绝不进 profile
  profile       String    @default("{}")   // ★ 平台私有 JSON，schema 归平台包所有
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model PublishTask {
  id          String    @id @default(cuid())
  postId      String
  platformId  String
  accountUid  String?   // 发布时账号快照（无外键；账号变动不影响历史）
  status      String    // queued | running | success | failed
  stage       Int       @default(0) // 0渲染排版 1上传素材 2填充编辑器 3人工确认
  progress    Int       @default(0)
  failReason  String?
  url         String?   // 发布成功回执链接
  createdAt   DateTime  @default(now())
  finishedAt  DateTime?
}

model PublishLog {
  id     String   @id @default(cuid())
  taskId String
  event  String
  payloadJson String @default("{}")
  at     DateTime @default(now())
}

model Setting {
  key       String @id
  valueJson String
}
```

要点：

- **稿子无发布状态字段**，发布事实只在 `PublishTask`（与原型判断一致）。
- `PublishTask.accountUid` 是**快照**而非外键：发布时的账号归属不随后续重新登录/换号漂移。
- `Setting` 预置键：`default_targets`（per 类型默认名单）、`wechat_ip_whitelist`、`wechat_channel`（api|browser）等。
- 排序档四种 `recent / oldest / title / manual`，manual 只在拖拽后写入 `manualOrder`。

### PlatformAccount 设计依据（真机验证）

- **通用列管展示，`profile` 管平台差异，schema 归平台包所有**（zod 校验，写入时验证）。
- `lands` 是平台级静态文案，放适配器 `PlatformMeta`，不放实体。
- `name` / `avatarUrl` 由 verify 从 profile 派生；不做认证状态、账号类型之类的身份标签（对发布流程无用）。
- CDP 平台会话无显式过期，真正信号是 `state + lastCheckedAt`；`authExpiresAt` 仅 API 凭据有意义。
- `avatarUrl` 升为一等列：xhs/weibo 有稳定头像 URL，可做身份比对锚点。

各平台 profile schema（全部经 2026-09-19 真机验证，详见 `docs/platforms.md`）：

```ts
weibo.profile  = { uid, screenName, verified, verifiedType, avatarUrl?, profileUrl? }        // ← /ajax/profile/info
zhihu.profile  = { userId, name, urlToken?, headline?, isOrg? }                              // ← /api/v4/me
xhs.profile    = { userId, userName, redId, userAvatar, userDesc?, role, permissions[] }     // ← creator galaxy/user/info
wechat.profile = { appId?, ghId?, accountType?, nickname, uin, sessionToken? }               // ← mp 后台 DOM/全局变量；API 通道来自开放接口
```

## 6. 平台适配器接口（packages/platforms/core）

```ts
export interface PlatformAdapter<TProfile = unknown> {
  meta: PlatformMeta;
  account: {
    schema: ZodSchema<TProfile>;                    // profile JSON 校验
    acquire(ctx: AdapterCtx): Promise<AccountAcquireResult>;  // 登录/授权（CDP 扫码 or API 配置）
    verify(acct: AccountRef, ctx: AdapterCtx): Promise<VerifyResult>;
  };
  publish(post: PostDraft, acct: AccountRef, ctx: AdapterCtx,
          onStage: (e: StageEvent) => void): Promise<PublishResult>;
}

export type PlatformMeta = {
  id: string; name: string; color: string;
  supports: ContentType[];                          // article | image | video | audio
  authMode: "api" | "cdp" | "rss-downstream";
  autoSubmit: boolean;                              // false = 停在人工确认
  lands: string;                                    // 发布去向文案（账号卡渲染用）
  status: "active" | "planned";                     // MVP 外平台占位灰显
};
```

`verify` 的职责：调平台通道拿 profile → 与库存 profile 合并 → 派生 name/uid/avatarUrl 写回 → 更新 `state` / `lastCheckedAt`。UI 账号卡只读通用列；发布引擎只以 `state === "ok"` 为门禁。

## 7. CDP 封装层（packages/cdp）

- 移植 `baoyu-chrome-cdp`（launch / discover / waitForDebugPort / CdpConnection / openPageSession 全套），外加一层**浏览器会话池**：
  - 共享 Chrome profile：`~/.local/share/tassello/chrome-profile`（= `TASSELLO_DATA_DIR` 下，`TASSELLO_CHROME_PROFILE` 可覆盖；已初始化并登录验证）
  - 按平台互斥占用：同一时刻一个平台一个 page session，发布与 verify 排队
  - 登录态生命周期：每平台手动登录一次 → verify 定期校验（对应账号卡「最近校验」）→ fail 时 UI 提示重登
- **工程铁律**：小红书等 Vue 站点的页面对象是响应式 Proxy，直接序列化会炸。封装层只提供 `evaluateScalar`（只允许标量/纯数组出页面），禁止把页面对象直接带回 Node 侧。
- 文件上传：优先 CDP `DOM.setFileInputFiles`；对小红书视频类大文件，预研「permit + 直传存储」路线（见 platforms.md）。

## 8. MVP 范围

| 项 | 范围 |
|---|---|
| 平台 | **微博**（CDP：填充 + 人工确认）+ **公众号**（API 直连 / CDP 双通道；IP 白名单问题留到验证阶段再议） |
| 内容类型 | article / image / video 跑通；audio 枚举预留、入口隐藏 |
| 其余平台 | 注册表占位 `status: "planned"`，UI 灰显 |
| 播客 | 保持原型语义（各自独立操作），RSS 方案二期再议 |

## 9. 面向未来 Agent 的预留（本期不实现）

1. 业务全部收敛在 `packages/server` 的 service 接口，UI 只走 HTTP 薄壳 → Agent 可直接调 service 或经 MCP，也可以在**网页模式**下像人一样访问 `127.0.0.1:<port>`（页面本身就是可调试入口）。
2. 平台注册表输出机器可读能力清单（supports / authMode / stages / autoSubmit）→ Agent 工具发现。
3. 每个 CDP 适配器同时是可独立运行的 bun CLI（沿用 baoyu 形态）→ 人、程序、Agent 三方通用。
4. `packages/agent` 预留 MCP server：`list_posts / create_post / publish / get_task / subscribe_events`。
5. 任务引擎事件流是结构化 JSON，天然可被 Agent 订阅观察。

## 10. 实施顺序与状态

1. ✅ monorepo 脚手架（workspaces + tsgo + HeroUI），Next.js 网页模式跑通（`bun run dev`）
2. ✅ Electron 壳（dev 模式 spawn `next dev` 并开窗；打包进一期后置）
3. ✅ Prisma 模型 + 原型 60 篇种子数据，三视图复刻（library/queue/editor + 设置 + 发布弹层 + 手机预览）
4. ✅ `cdp` 包移植 + 会话池；**微博真实链路打通**（verify 拉回真实账号 → 填充编辑器 → 人工确认 → 标记完成，2026-09-19 E2E）
5. 🚧 公众号 API 通道（draft/add 已实现；appid/secret 灌入与真实 draft 验证待做）+ CDP 兜底（已实现骨架）
6. ⏳ xhs（creator 通道，接口已验证）；其余 CDP 平台逐个接入
7. ⏳ `agent`/MCP 包装（单列一期，不在 MVP）

> 工程备注：tsgo（TS7 preview）不支持自动 @types 发现——各包 tsconfig 显式 `types: ["node"]`，`bun run typecheck` 逐包检查。

## 11. 已定决策记录

| 决策 | 结论 |
|---|---|
| 图标库 | reicon.dev → `reicon-react` |
| monorepo 位置 | 仓库根目录（designs/ 保留原位） |
| platforms 布局 | 按平台扁平，不按 api/cdp 分组 |
| TS7 落地 | tsgo 仅 typecheck，bun/Electron 承担运行时 |
| 运行形态 | 桌面（Electron 宿主）为产品形态；网页模式（bun dev/start）仅供 Agent 使用与调试；server 不依赖 Electron API，两形态同一数据路径 |
| MVP 平台 | 微博 + 公众号；xhs 接口已预研可直接进入二期首批 |
| 音频/播客 | MVP 不做；RSS 与「各操作一次」的取舍等验证后再定 |
| 公众号 IP 白名单 | 本机公网 IP 为移动动态 IP，预检/提示策略延后到验证阶段 |
| UI/UX | 复刻 Mosaic 方向；标题层级、色板 token、发布队列方块语义以原型 README 为准 |
| 运行入口 | `bun run dev`（网页 3000）/ `bun run desktop`（Electron 4311）/ `bun run typecheck` |
| 微博编辑器 | 新版微博是 React 受控 textarea，填充必须用原生 value setter + input 事件，并回读验证 |
