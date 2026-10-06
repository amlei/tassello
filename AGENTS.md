# 项目规则

## 平台发布规则

- 用户选择"发布"后，平台必须自动发送内容，禁止在用户点击"发布"后再弹出额外的"发送"按钮让用户二次确认。
- 新增平台时，发布通道优先考虑 API/HTTP 接口（官方 API 或可用的 URL 接口均可）；只有确认无可用接口（或接口无法覆盖发布能力）时，才退而使用 CDP 方式。
- 例外：仅当测试时发现某平台发布流程强制需要人工验证（如扫码、短信验证等）时，才允许交由用户手动操作。
  - 此类平台（如微信公众号）：内容保存到草稿箱，并把草稿链接给到用户，由用户自己去平台完成发布。

## 工具链：一律用 Bun

- 安装/运行/测试全部用 bun（`bun install` / `bun run <script>` / `bunx`），不要用 npm/node/pnpm。细则见根 `CLAUDE.md`。
- better-sqlite3 在 Bun 下不可用；SQLite 走 Prisma + `@prisma/adapter-libsql`。

## 常用命令（仓库根）

- `bun run dev` — web 开发服务器（apps/web，Next.js）
- `bun run typecheck` — 全仓逐包 tsgo（TS7 native preview）`--noEmit`，改完代码必跑
- `bun test` — 目前只有 packages/cdp 有测试（源码用 node:test 写，但 bun test 可跑）
- `bun run db:push` — Prisma schema 推送（packages/db，无迁移历史）
- lint 只在 apps/web 配置：`cd apps/web && bun run lint`
- 桌面壳 `bun run desktop`：Electron 会 spawn `bun run dev -p 4311`（端口可用 `TASSELLO_PORT` 覆盖）；纯网页模式直接 `bun run dev` 即可调试

## 数据与生成物

- Prisma client 生成到 `packages/db/src/generated/`（已 gitignore）——clone 后或改过 schema 后需在 packages/db 里 `bunx prisma generate`，否则类型检查/运行会报错。
- 数据目录 `TASSELLO_DATA_DIR`（默认 `~/.local/share/tassello`）：SQLite 库、`secrets.json`、CDP 专用 Chrome profile 都在这里。`packages/db/src/paths.ts` 与 `prisma.config.ts` 共用这套解析。

## 架构速览

- 权威文档：`docs/design.md`（架构、数据模型、任务状态机）与 `docs/platforms.md`（平台通道选型 + 真机踩坑记录）。根 README 已过时，勿按它操作。
- 分层：`apps/web/app/api/**` 的 Route Handlers 是薄壳，业务全在 `packages/server`；`bootstrap()` 由 `app/api/_lib.ts` 的 `ensureBoot()` 触发（注册适配器 + 启动时校验账号）。
- 平台适配器：`packages/platforms/core` 定义 PlatformAdapter + 注册表，wechat/weibo 各一包；CDP 是主发布通道，官方 API 是增强。`packages/agent` 本期仅占位，未实现。
- `packages/cdp` 铁律：页面求值只用 `evaluateScalar`，只允许标量/纯结构出页面（先 JSON 序列化再返回）——平台页面的响应式 Proxy 会让 returnByValue 直接报错。
- 领域规则：发布事实只记发布队列，Post 不挂发布状态字段；CDP 平台任务停在 `awaiting_confirm` 等人工确认是常态，不是故障。API 凭据走 SecretBox 加密存储，机密不进 `PlatformAccount.profile`。
- UI 按 `designs/onda-explore/directions/mosaic` 方向实现（HeroUI v3 + Tailwind v4）。

## Obsidian 插件

- 修改 Obsidian 插件功能（含 `src`、`styles.css`、manifest 等）后，必须构建并部署：
  - 在仓库根执行：`cd apps/obsidian && bun run build && bun run deploy`
  - 部署后提醒用户重载 Obsidian 插件，或执行 **Reload app without saving**。

## HeroUI 与 Reicon 使用要求

- React Web UI 的可见交互控件默认必须使用 HeroUI：按钮用 `Button`，输入用 `Input` / `SearchField`，多行输入用 `Textarea`，下拉用 `Select` / `Dropdown`，勾选用 `Checkbox`，浮层用 `Modal` / `Popover` / `Drawer`。不要为新 UI 手写原生 `button`、`input`、`textarea`、`select`。
- 通用 UI 图标默认使用 `reicon-react`；按现有约定传 `size` 和 `strokeWidth`。不要为搜索、关闭、新增、刷新、勾选、警告、面板这类通用图标手写 `<svg>`。
- 允许保留原生/自绘 SVG 的例外：品牌 Logo、平台/浏览器品牌图标、真实媒体播放表面、canvas/视频内容、contenteditable 中序列化的 HTML，以及 Reicon 没有的专属图形。hidden file input 可以保持原生，但要包装成 HeroUI 触发控件。
- 内部路由优先维持现有 Next.js 导航方式；外部 URL 使用 HeroUI Link。不要为了替换标签而破坏路由、预加载或 React Server Components 语义。
- HeroUI 复合控件自带产品语义和样式，不能默认等价于原型里的裸结构。移植前先在真实主题里检查 computed style，尤其是 `Input` 的 field 边框/padding/focus ring，以及 `Button` 的默认高度、文字居中和 hover 底色。
- 命令面板型输入要保留 HeroUI `Modal` 壳和可访问性，但内部输入应作为无边框命令输入处理；不要试图只靠几个 Tailwind class 去覆盖 `Input` 的 focus 样式，必须在项目 CSS 里显式 reset 并用真实焦点态验证。
- 移植 `Input`、`Button` 这类复合控件后，必须对比原型的宽度、高度、行距、focus/hover 态；只在静态 DOM 中看 class 不够。

## Next.js 注意

- `apps/web/AGENTS.md` 是 `next dev` 自动生成的规则块，勿删：此 Next 版本与常识差异大，写代码前先查 `apps/web/node_modules/next/dist/docs/`。

## 约定

- 注释、文档、commit message 用中文，commit 带 conventional 前缀（如 `feat: ...`）。
