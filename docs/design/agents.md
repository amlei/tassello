# Agent 接入设计

> 状态：目标设计，延期实施；不参与当前浏览器扩展正式发布迁移。
> 本文定义 Agent 与九漾 Onda 的能力边界、鉴权、任务来源和资源约束。

## 目录

1. [定位](#position)
2. [能力域与鉴权](#auth)
3. [接口与数据流](#flow)
4. [任务与并发](#tasks)
5. [失败与审计](#failure)
6. [资源评估](#resources)
7. [非目标](#non-goals)

<a id="position"></a>
## 1. 定位

Agent 是应用后端的客户端，不是浏览器扩展：

```text
Agent / Web / Obsidian
          │
          ▼
   Elysia 本机后端
          │
          ▼
 唯一活跃浏览器扩展
```

- Agent 通过 HTTP / WebSocket 使用 Markdown 内容、账号状态和发布队列。
- Agent 不得直接连接 `/ws/extension`，也不得获取浏览器扩展 token。
- Agent 不得绕过任务状态机直接驱动平台页面。
- MCP、CLI 或其它 Agent 适配层只能包装同一套后端 API，不能成为第二套业务状态源。

<a id="auth"></a>
## 2. 能力域与鉴权

每个 Agent 使用独立 token，不得与 Web、Obsidian、浏览器扩展共用凭据。

初始能力域：

| scope | 权限 |
|---|---|
| `vault:read` | 列出、读取 Markdown 与媒体元数据 |
| `vault:write` | 创建、更新、删除 Markdown；更新必须携带 fingerprint |
| `tasks:read` | 读取任务与发布结果 |
| `tasks:create` | 创建发布任务 |
| `tasks:cancel` | 取消允许取消的任务 |

约束：

- token 只保存哈希；明文只在创建时返回一次。
- token 必须绑定稳定的 Agent ID 与创建时间。
- 每个请求解析出 `actor`，并写入任务、日志和审计记录。
- Agent 不得读取平台 Cookie、OAuth secret、浏览器扩展 token 或其它 Agent 的 token。
- token 撤销后立即拒绝 HTTP 请求并关闭该 Agent 的 WebSocket。

<a id="flow"></a>
## 3. 接口与数据流

Agent 复用现有内容与任务 API，并增加能力域鉴权：

```text
GET    /api/v1/posts
GET    /api/v1/posts/:id
POST   /api/v1/posts
PATCH  /api/v1/posts/:id
DELETE /api/v1/posts/:id

GET    /api/v1/tasks
POST   /api/v1/publish
POST   /api/v1/tasks/:id
DELETE /api/v1/tasks/:id

WS     /ws/client
```

规则：

- Agent 更新 Markdown 时必须提交 `expectedFingerprint`，冲突时重新读取，不得 last-write-wins。
- 发布任务由后端从磁盘 Markdown 生成不可变快照，再派发给浏览器扩展。
- Agent 可以多个并存，浏览器扩展仍只有一个执行通道。
- Agent 创建的 WebSocket 连接标记为 `clientType: "agent"`，不得接收扩展任务协议。

<a id="tasks"></a>
## 4. 任务与并发

任务记录必须包含：

```ts
type ActorRef = {
  kind: "user" | "obsidian" | "agent";
  id: string;
  label?: string;
};
```

- `createdBy`、`retriedBy`、`cancelledBy` 使用同一结构。
- 同一 Agent 可以创建多个任务，但后端只能按扩展执行通道串行派发页面动作。
- 队列必须设置最大待执行任务数；超过上限时返回明确的背压错误。
- Agent 的并发请求不等于平台并发发布。平台内动作仍由任务状态机调度。

<a id="failure"></a>
## 5. 失败与审计

- Agent 与扩展都必须显式区分失败、等待人工确认和结果未知。
- 已经可能提交但无法确认结果的任务必须进入 `unknown`，不得自动重试。
- 重试创建新任务并保留旧任务、旧链接和失败原因。
- 任务日志记录 `actor`、动作、目标稿件、平台和结果，不记录 token 或平台凭据。
- Agent 断开不影响已入队任务；扩展断开使待执行任务进入 `waiting_extension`。

<a id="resources"></a>
## 6. 资源评估

设活跃 Agent 数为 `A`，待执行任务数为 `T`，单份快照大小为 `B`：

| 资源 | 典型量级 | 最坏情况 |
|---|---|---|
| 内存 | `O(A + T)` 连接与任务索引 | Agent 或任务无上限时线性增长 |
| 磁盘 | `O(T × B)` 发布快照 | 大媒体和大量重试会线性增长 |
| CPU | 任务派发 `O(1)`，事件扇出 `O(A)` | Agent 数量大时广播成本上升 |
| 网络/IO | Markdown 单次读写 `O(B)` | 多个 Agent 同时扫描全 Vault 时为 `O(A × N × B)` |

因此必须设置 Agent 数、请求频率、任务队列长度和快照保留策略。列表请求不应默认返回完整 HTML 或媒体内容。

<a id="non-goals"></a>
## 7. 非目标

- 不允许 Agent 直接控制浏览器扩展或浏览器页面。
- 不允许 Agent 与 Web/Obsidian 共用长期 token。
- 不允许 Agent 绕过 fingerprint 和任务状态机直接发布。
- 不把 MCP/CLI 状态保存在后端之外。
- 不为 Agent 引入第二套 SQLite、内存任务库或平台执行器。
