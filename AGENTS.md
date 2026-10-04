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
- `bun run db:migrate` — Prisma 迁移（packages/db）
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

## Next.js 注意

- `apps/web/AGENTS.md` 是 `next dev` 自动生成的规则块，勿删：此 Next 版本与常识差异大，写代码前先查 `apps/web/node_modules/next/dist/docs/`。

## 约定

- 注释、文档、commit message 用中文，commit 带 conventional 前缀（如 `feat: ...`）。
