# AGENTS.md

> 本文件只列跨任务硬约束和阅读入口。细则按任务从下表定位，不得从历史记忆推断。

## 硬约束

- 包安装、运行、测试、构建一律使用 Bun：`bun` / `bunx` / `bun run`；禁止 npm、pnpm、yarn 和直接用 Node 启动项目代码。
- 方案阶段不得写业务代码；只有用户明确说“开始”“执行”“动手”后才进入实现。
- 用户可见功能必须先修改原型，再修改生产 UI；原型必须覆盖关键正常态、等待态和失败态。
- React Web UI 必须遵守 `docs/design/design-language.md` 和 `docs/design/ui-components.md`；可见控件默认使用 HeroUI，通用图标使用 `reicon-react`。
- 修改 Next.js 代码前必须阅读 `apps/web/AGENTS.md`，并在 `apps/web/node_modules/next/dist/docs/` 查相关 API。
- TypeScript 单元测试必须与被测源码同目录；Go 集成测试必须放在根目录 `tests/`。
- 不得手改生成物、构建产物、依赖缓存或密钥文件；迁移期遗留的 Prisma 生成物位于 `packages/db/src/generated/`。
- Git 写操作必须使用 GitButler `but`；每次修改必须提交，commit message 使用中文 conventional 前缀，不主动 push。
- 修改前后端共享契约、API 响应或本机服务代码后，开发环境必须同时重启 API 与 Web；不得用双版本兼容或默认值兜底掩盖开发环境的版本漂移。
- 合并回主分支前，一个分支必须 squash 成一个 commit；不得遗留 worktree、临时分支或调试文件。
- 设计定稿后必须审查方案；实现完成后必须审查未提交 diff。审查结论必须写进最终回复。
- 用户点击“发布”后不得增加应用内二次发送；平台强制人工验证时按架构文档保存草稿并提供链接。
- 文档、注释和提交信息使用中文；产品可见名称使用“九漾 Onda”，`Tassello` 仅作仓库/技术标识。
- 架构文档同时包含目标和当前状态；未迁移完成的能力不得描述为现状。

## 按需阅读

| 何时 | 读什么 |
|---|---|
| 首次进入、定位模块或运行项目 | `docs/README.md#阅读路线`；`docs/design/architecture.md#module-map`；`docs/workflow/development-workflow.md#validation` |
| 新建文件、包或调整目录 | `docs/conventions/repo-conventions.md#code-placement`；`#naming` |
| 修改 Web、Obsidian 或扩展 UI | `docs/design/design-language.md#principles`；`#layout`；`#settings`；`#editor`；`#controls`；`#theme` |
| 拆分、复用或新增 UI 组件 | `docs/design/ui-components.md#terminology`；`#layers`；`#inventory`；`#rules` |
| 调整原型或 Web 组件目录 | `docs/design/ui-components.md#prototype-layout`；`#production-layout`；`docs/conventions/repo-conventions.md#code-placement` |
| 修改用户可见文案 | `docs/design/design-language.md#copy`；`docs/conventions/repo-conventions.md#copy` |
| 修改架构、内容模型、API、账号或任务 | `docs/design/architecture.md#status`；`#content-model`；`#backend`；`#publish`；`#resources`；`docs/design/account-sync.md` |
| 修改 API、Vault 或文件状态库 | `docs/design/architecture.md#backend`；`docs/conventions/repo-conventions.md#code-placement`；目标目录相邻测试 |
| 修改浏览器扩展 | `docs/design/architecture.md#extension`；`docs/design/account-sync.md`；`docs/workflow/development-workflow.md#validation` |
| 修改平台或发布通道 | `docs/platforms/README.md`；`docs/platforms/publish-channels.md`；`docs/design/architecture.md#extension` |
| 接入 Agent、MCP 或自动化客户端 | `docs/design/agents.md#position`；`#auth`；`#tasks` |
| 修改 Obsidian 插件 | `docs/workflow/development-workflow.md#obsidian`；`docs/design/architecture.md#hosts` |
| 验证、构建、审查、提交或发布 | `docs/workflow/development-workflow.md#validation`；`#review`；`#git`；`#release` |
| 修改依赖、旧数据迁移或生成物 | `docs/conventions/repo-conventions.md#generated`；`docs/workflow/development-workflow.md#validation` |
| 修改规范或其它文档 | `docs/README.md#conventions` |
| 修改 Next.js 行为 | `apps/web/AGENTS.md`；目标目录 README；相邻测试 |

## 阅读策略

1. 先按“按需阅读”定位 1–3 个章节。
2. 再看目标目录 README、局部 `AGENTS.md` 和相邻测试。
3. 不通读 `docs/`；只有跨模块改动才扩大范围。
4. 文档与代码冲突时，先确认架构文档中的“当前状态 / 目标状态”。
5. 修改规范时改写拥有关键事实的章节，不在其它文档追加同义补丁。
