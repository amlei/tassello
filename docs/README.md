# 文档目录

> 本目录按“一事一处”组织。根目录只保留本索引；先按任务定位文档，只读相关章节，不通读整个目录。

## 目录职责

| 目录 | 职责 |
|---|---|
| `design/` | 架构、视觉语言、组件结构与专项设计 |
| `conventions/` | 仓库目录、代码放置、命名和生成物约束 |
| `workflow/` | 开发、验证、审查和 Git 流程 |
| `platforms/` | 平台真机事实与发布通道模型 |
| `todos/` | 待办索引与尚未定案的后续事项；不作为当前实现依据 |

## 文档索引

| 文档 | 权威内容 |
|---|---|
| [design/architecture.md](./design/architecture.md) | 目标架构、模块边界、Vault、API、任务、扩展与迁移状态 |
| [design/design-language.md](./design/design-language.md) | UI 视觉语言、布局、分隔线、组件、文案和主题规则 |
| [design/ui-components.md](./design/ui-components.md) | 组件术语、复用边界、原型目录、生产目录和拆分规则 |
| [design/agents.md](./design/agents.md) | Agent 能力域、鉴权、任务来源、并发和资源边界 |
| [conventions/repo-conventions.md](./conventions/repo-conventions.md) | 顶层目录、代码放置、命名、依赖、测试位置、生成物 |
| [workflow/development-workflow.md](./workflow/development-workflow.md) | 方案、原型、实现、验证、审查、GitButler 和发布流程 |
| [workflow/release.md](./workflow/release.md) | 发版格式、版本口径、发布门禁、上线核对和回滚 |
| [platforms/README.md](./platforms/README.md) | 各平台真实通道、账号信息来源与真机踩坑记录 |
| [platforms/publish-channels.md](./platforms/publish-channels.md) | 平台内发布通道领域模型 |
| [todos/index.md](./todos/index.md) | 待办索引；具体事项不作为当前实现依据 |

## 阅读路线

| 你想做什么 | 先读什么 |
|---|---|
| 定位模块、理解依赖和数据流 | `design/architecture.md#module-map` |
| 修改内容模型、后端、任务或扩展 | `design/architecture.md#status` 与对应主题章节 |
| 修改 API、Vault 或文件状态库 | `design/architecture.md#content-model`、`#backend`、`conventions/repo-conventions.md#generated` |
| 修改浏览器扩展 | `design/architecture.md#extension`、`workflow/development-workflow.md#validation` |
| 新建文件、包或调整目录 | `conventions/repo-conventions.md#code-placement` |
| 修改 Web、Obsidian 或扩展 UI | `design/design-language.md#principles`、`#layout`、`#controls` |
| 拆分、复用或新增 UI 组件 | `design/ui-components.md#layers`、`#inventory`、`#rules` |
| 调整原型或组件目录 | `design/ui-components.md#prototype-layout`、`#production-layout` |
| 修改用户可见文案 | `design/design-language.md#copy`、`conventions/repo-conventions.md#copy` |
| 修改平台或发布通道 | `platforms/README.md`、`platforms/publish-channels.md`、`design/architecture.md#publish` |
| 接入 Agent、MCP 或自动化客户端 | `design/agents.md#position`、`#auth`、`#tasks` |
| 运行、测试、构建或打包 | `workflow/development-workflow.md#validation` |
| 修改 Obsidian 插件 | `workflow/development-workflow.md#obsidian` |
| 发版、写 Release Notes 或更新日志 | `workflow/release.md#copy`、`#process`、`#templates` |
| 修改依赖、生成物或数据目录 | `conventions/repo-conventions.md#generated` |
| 修改规范或其它文档 | 本文档的[文档约定](#conventions) |
| 修改 Next.js 代码 | `apps/web/AGENTS.md` 与本地 `node_modules/next/dist/docs/` |

## 阅读策略

1. 先用阅读路线定位 1–3 个相关章节。
2. 再看目标目录的 README、局部 `AGENTS.md` 和相邻测试。
3. 只在跨模块任务中扩展阅读范围。
4. 不通读 `docs/`，不把 `todos/` 中的待办当成已定方案。
5. 文档与代码冲突时，先确认架构状态；目标架构与当前实现必须分别标注。

<a id="conventions"></a>
## 文档约定

- 规范用词：**必须 / 不得**表示硬约束，违反即缺陷；**应 / 不应**表示默认做法，偏离时需在实现或评审中说明理由；**可**表示允许的选择。
- `docs/` 根目录只允许存在本索引文件；新增规范或设计文档必须放入对应子目录。
- 架构与设计文档只放在 `design/`；不能把长期设计正文重新放回 `docs/` 根目录。
- 一事一处：每个事实只在一篇文档拥有权威版本，其它文档只链接，不复制正文。
- 整合优先：修改规则时改写拥有该主题的章节，不在文末追加补丁式说明。
- 只写现行规则，不写过程；决策历史放对应文档的决策记录或 git。
- 面向人的文档应有一个主题、文首目录和完整上下文。
- 面向 Agent 的文档应拆小，每篇明确“何时阅读”。
- 状态必须显式：`目标`、`当前实现`、`迁移中`、`历史记录`不得混写。
- 文档引用的命令、路径和脚本必须来自仓库真实配置。
