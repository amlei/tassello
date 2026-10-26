# 开发流程

> 本文定义从方案到合并的可执行流程。产品规则见 [`architecture.md`](../design/architecture.md)，视觉要求见 [`design-language.md`](../design/design-language.md)。

## 目录

1. [任务定位](#locate)
2. [方案与开始门禁](#design-gate)
3. [原型先行](#prototype)
4. [实现](#implementation)
5. [验证矩阵](#validation)
6. [Obsidian](#obsidian)
7. [审查](#review)
8. [GitButler 与分支](#git)
9. [发布](#release)
10. [失败与遗留](#failure)

<a id="locate"></a>
## 1. 任务定位

开始前必须：

1. 按 [`docs/README.md`](../README.md) 的阅读路线定位文档。
2. 查看目标目录 README、局部 `AGENTS.md` 和相邻测试。
3. 检查 `git status`、当前分支和工作区；使用者改动不得被覆盖。
4. 判断任务是只读分析、方案设计、原型、实现还是发布。

<a id="design-gate"></a>
## 2. 方案与开始门禁

- 方案设计阶段不得写业务代码或改实现。
- 方案必须覆盖算法最坏复杂度、CPU、内存、磁盘、网络/IO、GPU 等资源开销。
- 用户必须明确发出“开始”“执行”“动手”等指令后，才能进入实现。
- 修改产品架构时，先更新 `../design/architecture.md` 的目标状态和迁移边界。
- 设计定稿后必须做独立设计审查；不通过时先修方案。

<a id="prototype"></a>
## 3. 原型先行

任何用户可见功能必须先更新原型：

- Web：`designs/onda-explore/directions/mosaic/index.html`
- Obsidian：`designs/obsidian-publisher/right-panel.html`
- 浏览器扩展：`designs/extension-popup/Extension Popup.html`

原型要求：

- 覆盖正常、等待、失败、空态和权限/连接异常态。
- 交互必须真实可点击，不能只有静态外观。
- 四类内容必须使用各自的真实结构，不用同一套 fixture 冒充。
- 主题必须支持浅色、深色和跟随系统。
- 原型经用户确认后再移植到生产 UI。
- 原型和实现均使用 HTTP 服务预览，不使用 `file://`。

<a id="implementation"></a>
## 4. 实现

1. 读取目标模块和最近测试。
2. 小步修改，保持设计文档与代码一致。
3. 不修改无关生成物，不引入调试残留。
4. 公共 DTO、状态枚举、错误语义和 API 契约同步更新。
5. 配置、数据目录、权限、迁移和失败路径必须显式处理。

<a id="validation"></a>
## 5. 验证矩阵

| 改动 | 必须执行 |
|---|---|
| 任意 TypeScript / React / 配置改动 | `bun run typecheck` |
| Web 代码 | `cd apps/web && bun run build`；涉及 UI 时启动 `bun run dev:web` 做浏览器验证 |
| Web lint 范围 | `cd apps/web && bun run lint` |
| API / Vault / 文件状态库 | `bun test packages/vault/src packages/render/src packages/server/src apps/api/src` |
| 浏览器扩展 | `cd apps/extension && bun run build` |
| Obsidian | `cd apps/obsidian && bun test src && bun run build && bun run deploy` |
| 桌面发布 | 对应 `dist:mac*` / `dist:win*`，并运行 packaged verify |
| 旧数据迁移 | `bun run migrate:vault -- --db <旧库副本> --vault <新目录>`；先核对稿件、账号和任务数量 |
| 迁移期 CDP / platforms | `bun test`；不得据结果推断目标扩展通道已可用 |
| 用户可见界面 | 原型先验证，再验证实际页面；检查控制台、布局和关键交互 |

浏览器验证工具：

- Codex 会话必须使用 Codex In-app Browser（Browser 插件）打开 HTTP 页面；不得改用 `playwright-cli`。
- 非 Codex 会话使用 `playwright-cli`，通过 `$PLAYWRIGHT_MCP_EXTENSION_TOKEN` 连接 Chrome。
- 指定工具不可用时报告阻塞，不静默切换工具。

验证失败必须区分：

- 本次改动引入；
- 既有问题；
- 环境/凭据/外部平台问题。

不得用“测试通过”掩盖未运行的验证。

<a id="obsidian"></a>
## 6. Obsidian

修改以下内容后必须构建并部署：

- `apps/obsidian/src/**`
- `apps/obsidian/styles.css`
- `apps/obsidian/manifest.json`
- Obsidian 相关构建配置

命令：

```bash
cd apps/obsidian
bun test src
bun run build
bun run deploy
```

交付时必须提醒用户重载插件，或执行 **Reload app without saving**。

<a id="review"></a>
## 7. 审查

审查分两次：

1. 设计定稿后审查方案。
2. 实现完成后审查未提交 diff 和影响面。

审查重点：

- 是否满足用户需求。
- 最坏复杂度和硬件资源是否与设计一致。
- 数据边界、并发、失败恢复和迁移是否正确。
- 配置、权限、测试和文档是否同步。
- 是否存在无关 diff、调试代码和生成物改动。

不在 opencode 环境时，使用固定免费通道：

```bash
opencode run --model opencode/deepseek-v4.1-flash-free "<审查提示>"
```

审查结论必须为：

- 通过
- 有条件通过
- 不通过

不通过必须先修复，不能直接提交或合并。

<a id="git"></a>
## 8. GitButler 与分支

- commit、branch、squash、merge、undo 等写操作一律使用 `but`。
- 只读查看可用 `git status`、`git diff`、`git log`。
- 每次功能或文档修改都要提交；commit message 使用中文 conventional 前缀。
- 不 push，除非用户明确要求。
- 合并回主分支前，一个分支必须 squash 成一个 commit。
- 除 squash 或用户明确要求外，不改写历史。
- 不创建空提交。
- worktree 和临时分支完成后必须清理；需要保留时必须在最终回复中说明路径和原因。

<a id="release"></a>
## 9. 发布

发版格式、发布门禁、GitHub Release 与站内更新日志模板、上线核对和回滚统一见
[`release.md`](./release.md)。本节只保留与开发流程衔接的硬约束：

- 桌面安装包必须在 CI 的目标平台构建，不能跨平台生成原生包。
- 打包后必须运行 `verify-packaged.mjs` 的运行时自检。
- 发布前必须确认 tag、package version、Release 文案、产物、下载页和 changelog 一致。
- 发布完成后必须核对真实下载资产与已部署页面；未接通或未验证的入口不得标成可用。

<a id="failure"></a>
## 10. 失败与遗留

最终回复必须区分：

- 已完成；
- 已提交；
- 已验证；
- 未验证或受阻塞；
- 既有问题；
- 需要用户裁决的事项。

不得把未运行、不可运行或外部服务失败描述为通过。
