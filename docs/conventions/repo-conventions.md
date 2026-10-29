# 仓库约定

> 本文约束目录职责、代码放置、命名、依赖、测试位置和生成物。命令和流程见 [`development-workflow.md`](../workflow/development-workflow.md)。

## 目录

1. [顶层目录](#layout)
2. [代码放置与依赖方向](#code-placement)
3. [命名](#naming)
4. [UI 控件与图标](#ui)
5. [用户可见文案](#copy)
6. [测试位置](#tests)
7. [依赖与生成物](#generated)
8. [文档](#docs)

<a id="layout"></a>
## 1. 顶层目录

| 目录 | 职责 |
|---|---|
| `apps/web` | Next.js Web 界面与 SSR 数据加载；不承载业务 API |
| `apps/api` | Bun + ElysiaJS 本机服务：HTTP、WebSocket、Markdown 与发布状态 |
| `apps/cli` | 按需启动的本机命令行客户端，调用 API 完成生图等自动化任务 |
| `apps/desktop` | Electron 宿主，启动 API 二进制与 Next standalone |
| `apps/native-host` | Chrome / Edge Native Messaging Host，读取动态 API 运行信息 |
| `apps/obsidian` | Obsidian 插件源码、构建与部署脚本 |
| `apps/extension` | Chrome / Edge MV3 扩展、任务传输与平台页面驱动 |
| `apps/site` | 官网与下载页 |
| `packages/vault` | Vault Markdown 扫描、frontmatter、原子写、媒体解析 |
| `packages/render` | CommonMark + GFM 渲染为 HTML / 纯文本 |
| `packages/server` | 文件状态库、文档 DTO、账号、扩展连接和发布任务 |
| `packages/shared` | 跨包 DTO、Zod schema 和状态常量 |
| `packages/platforms/*` | 平台能力声明、旧适配器和迁移期平台知识 |
| `packages/cdp` | 仅迁移期探针，不得进入产品运行路径 |
| `packages/db` | 仅旧数据迁移参考，不得进入产品运行路径 |
| `packages/ui` | 跨页面 Foundations、Primitives、Layout、Patterns 与平台图标 |
| `packages/site-ui` | 官网专用组件与浏览器品牌图标 |
| `designs` | 可交互原型与设计探索，不作为生产代码入口 |
| `docs` | 架构、设计语言、规范、平台记录和待办 |
| `scripts` | 仓库级开发、类型检查和打包编排 |

<a id="code-placement"></a>
## 2. 代码放置与依赖方向

- 业务规则必须放在服务层或独立领域包，不得堆进页面组件或 Route Handler。
- Web 不得新增业务 Route Handler；浏览器请求经 Next rewrite 进入 `apps/api`。
- Obsidian 插件不得复制发布引擎；发布任务必须通过 Elysia API。
- 浏览器扩展只执行结构化任务；server 不得下发 JavaScript 字符串或选择器代码。
- 平台 DOM、选择器和页面请求属于对应 `packages/platforms/<platform>` 或扩展驱动。
- 跨平台通用类型放 `packages/shared`，不得从 UI 包反向导入。
- Markdown 解析与渲染只允许有一个实现，调用方不得各自创建解析器。
- 新增 workspace 包时，必须同步根 `package.json`、包级 `package.json`、`tsconfig.json` 与 `scripts/typecheck.ts` 的 target 清单。
- 不得从 `designs/` 直接引用生产运行时文件；原型可以复制生产 token 和结构。
- 可复用 UI 组件按 [`ui-components.md`](../design/ui-components.md) 分层放置；业务组合放 `apps/web/features/`，页面状态放 `apps/web/screens/`。
- Layout、Primitives 和 Patterns 不得导入业务 DTO、API client 或应用级状态。

<a id="naming"></a>
## 3. 命名

- workspace 包名统一 `@tassello/<name>`。
- TypeScript 源文件使用 `kebab-case.ts` / `kebab-case.tsx`。
- React 组件使用 `PascalCase`，Hook 以 `use` 开头。
- 类型、DTO 和 Zod schema 使用描述单复数语义的名称，例如 `TaskDTO`、`tasksSchema`。
- 平台 ID 使用稳定小写标识，不把展示名当身份。
- API 使用 `/api/v1/*`；内部领域状态使用稳定的英文枚举值，中文只用于展示。
- 文档、注释和 commit message 使用中文；代码标识保持英文。

<a id="ui"></a>
## 4. UI 控件与图标

- 所有新 UI 必须遵守 [`design-language.md`](../design/design-language.md)。
- 组件命名、复用边界和目录结构必须遵守 [`ui-components.md`](../design/ui-components.md)。
- 可见交互控件优先使用 HeroUI v3：`Button`、`Input`、`Textarea`、`Checkbox`、`Select`、`Dropdown`、`Modal`、`Popover`、`Drawer`。
- 通用图标使用 `reicon-react`，按现有约定传 `size` 与 `strokeWidth`。
- 品牌 Logo、平台图标、浏览器图标、真实媒体表面、canvas 和 contenteditable 序列化 HTML 可使用原始 SVG/HTML。
- Next.js 内部路由保持现有导航机制；外部 URL 使用 HeroUI Link。
- HeroUI 复合控件移植后必须验证宽度、高度、内边距、焦点环与 hover 态，不能只看 class。
- 命令面板型输入保留 HeroUI Modal 壳和无障碍语义，内部命令输入在项目 CSS 中显式重置边框与焦点样式。

<a id="copy"></a>
## 5. 用户可见文案

- 产品可见品牌使用“九漾 Onda”；`Tassello` 保留为仓库、包和技术标识。
- 文案使用简洁中文，不写显而易见的解释。
- 不允许出现同义重复标题；左栏已经表达的分类名称不在右栏重复。
- 禁止在用户点击“发布”后增加应用内的二次“发送”确认；平台强制人工验证时，按架构文档保存草稿并提供链接。
- 状态词必须对应领域状态，不创造仅用于装饰的标签。

<a id="tests"></a>
## 6. 测试位置

- TypeScript 单元测试与被测源码同目录，命名为 `*.test.ts` 或 `*.test.tsx`。
- Go 集成测试统一放在仓库根目录 `tests/`。
- 当前 TypeScript 测试至少覆盖：
  - `packages/vault`
  - `packages/render`
  - `packages/server`
  - `apps/api`
  - `apps/obsidian/src`
  - 迁移期 `packages/platforms/*` 与 `packages/cdp`
- 新功能应在对应包增加测试入口，不为测试单独创建平行源码树。
- 纯文案和纯样式改动也必须在真实浏览器或宿主中做视觉/交互验证；工具选择见 `../workflow/development-workflow.md#validation`。

<a id="generated"></a>
## 7. 依赖与生成物

- 包管理与运行统一使用 Bun；不得使用 npm、pnpm、yarn 或直接依赖 Node 启动业务代码。
- 仅在工具明确要求时使用 `bunx`，禁止 `npx`。
- 不得手改 `.next/`、`dist/`、`release/`、Prisma generated client 或其它生成物。
- 产品运行路径不得依赖 Prisma、SQLite、`packages/db` 或 `packages/cdp`；它们只服务旧数据迁移和探针。
- 当前数据目录由 `TASSELLO_DATA_DIR` 控制；开发态默认仓库 `.onda/`，安装包默认平台 `appData/Onda/`，独立 API 回退 `~/.onda/`。路径解析统一以 `packages/server/src/state.ts` 为准。
- API token、OAuth secret、Cookie 和平台凭据不得写入日志、Markdown、profile JSON 或原型 fixture。
- 旧数据迁移和真机平台验证全部完成后，必须删除 `packages/db`、Prisma 依赖、`packages/cdp` 与旧适配器运行时依赖。

<a id="docs"></a>
## 8. 文档

- 先读 [`README.md`](../README.md)，再按任务只读相关章节。
- `docs/` 根目录只保留 `README.md` 索引；规范文档按 `conventions/`、`workflow/`、`platforms/` 放置，设计正文统一放在 `design/`。
- 架构事实只写进 `../design/architecture.md`；视觉规则只写进 `../design/design-language.md`；组件结构与复用边界只写进 `../design/ui-components.md`；执行步骤只写进 `../workflow/development-workflow.md`。
- 修改规则时改写权威章节，不在其它文档追加同义说明。
- 文档中的命令、路径和文件位置必须能在当前仓库验证。
- 架构文档必须区分目标架构和当前实现，不得把迁移计划描述成已完成事实。
