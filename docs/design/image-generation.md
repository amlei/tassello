# 应用内网页生图

> 状态：应用内部能力，已接入本机后端、浏览器扩展和按需 CLI；不提供独立平台页、发布目标或 Agent/MCP 接口。
> 浏览器执行边界见 [`architecture.md#extension`](./architecture.md#extension)。

## 定位

豆包网页生图用于为九漾 Onda 自身产出图片，不是发布平台：

- 不注册到平台清单，不出现在发布弹层、账号列表或扩展能力列表。
- 不向 Agent 或 MCP 暴露；外部自动化通过 `apps/cli` 的 `onda generate image` 调用同一套本机 API。
- 使用用户日常 Chrome / Edge 中已有的豆包登录态，不复制 profile。
- 一次生图任务只使用一个豆包对话，提示词逐张串行执行。

## 数据流

```text
应用内部或 CLI 调用
  │ POST /api/v1/generations
  ▼
本机后端生成任务并持久化到 .onda/state/generations/
  │ /ws/extension
  ▼
已配对的浏览器扩展
  │ 豆包页面
  ▼
扩展返回原图 CDN 地址
  │
  ▼
后端下载并写入 <Vault>/<资源目录>/generated/<日期>-<名称>/
```

## 接口

```text
POST   /api/v1/generations
GET    /api/v1/generations
GET    /api/v1/generations/:id
DELETE /api/v1/generations/:id
```

创建任务接受：

- `platform: "doubao"`
- `model`：默认 `Seedream 5.0 Flash`
- `name`：可选的批次目录名
- `items[]`：提示词、可选文件名 slug
- `idempotencyKey`：可选；重复请求返回同一任务

任务记录包含状态、进度、页签、错误和已保存图片。图片结果包含绝对路径、相对 Vault 路径、分辨率、字节数和 SHA-256。

## 状态

```text
queued → waiting_extension → waiting_login → generating → downloading
                                                        ├→ success
                                                        ├→ quota_exhausted
                                                        ├→ unknown
                                                        ├→ failed
                                                        └→ cancelled
```

- `queued`：扩展在线，等待派发。
- `waiting_extension`：扩展未连接。
- `waiting_login`：页面需要用户登录。
- `quota_exhausted`：豆包额度耗尽，不再继续发送剩余提示词。
- `unknown`：可能已经发送或生成，但不能确认结果；不得自动重试。
- 明确失败才允许用户重新创建任务；已保存图片始终保留。

## 当前限制

- 平台只有豆包。
- 默认模型为 `Seedream 5.0 Flash`。
- 不提供独立的画面比例参数；需要固定比例时，应在提示词中写明构图要求。
- 单张登录等待上限 180 秒，出图等待上限 300 秒。
- 同一任务逐张生成，不并发访问豆包。
- 仅接受宽度不小于 1500 的稳定原图。
- 单图下载上限 64 MiB；这是后端资源保护，不改变页面生成能力。
- 输出目录已存在时自动追加 `-2`、`-3`。

## 算法与资源

设提示词数为 `N`，单张轮询次数为 `P`，结果容器节点数为 `D`，单图字节数为 `B`：

- 页面轮询最坏时间：`O(N × P × D)`。
- URL 归并使用生成图 ID 的 `Set`，平均 `O(1)`。
- 后端逐图下载和落盘：网络与磁盘 IO 为 `O(N × B)`。
- 任务索引和 DTO：内存与磁盘为 `O(N)`。
- 后端一次只保留一张图片的字节数组，峰值内存增加为 `O(max(B))`，不按整批累计。

浏览器页面仍是最主要的资源占用方；本能力不启动第二套 Chrome，也不持有 CDP 会话。

## 失败与清理

- 扩展断线时，排队任务转为 `waiting_extension`；已经开始页面动作的任务转为 `unknown`。
- 取消任务会关闭本次任务创建的豆包标签页。
- 成功后保留标签页供用户查看；下一次任务重新创建独立对话。
- 临时下载文件写入同目录后原子改名；失败不会覆盖已有结果。
- 生成页面 DOM 改版时，只修改 `apps/extension/src/drivers/doubao-generation.ts` 和相邻测试。
