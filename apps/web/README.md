# @tassello/web

九漾 Onda 的 Next.js Web 工作台。Next.js 只承担界面与 SSR 数据加载，业务 API、WebSocket、Markdown 文件和发布状态由独立的 Bun + ElysiaJS 服务提供。

## 开发

```bash
bun run dev
```

页面默认地址为 `http://localhost:3000`。`/api/*` 由 Next rewrite 转发到 `127.0.0.1:4311/api/v1/*`，可用 `TASSELLO_API_PORT` 覆盖 API 端口。

完整开发环境应在仓库根目录执行 `bun run dev`，同时启动 API 与 Web；桌面模式执行 `bun run desktop`。

## 代码结构

- `app/`：Next.js 路由、服务端取数与 Screen 选择。
- `screens/`：内容库、队列和编辑器的页面状态与 API 组合。
- `features/`：内容卡、设置、发布、搜索、导航等业务组合。
- `adapters/`：API、Next.js 工作台与桌面环境适配。
- `lib/`：格式化等无 UI 工具。

跨页面 Layout、Primitives 和 Patterns 位于 `packages/ui`。

## 验证

```bash
bun run lint
bun run build
cd ../.. && bun run typecheck
```

修改 Next.js 代码前必须阅读 [`AGENTS.md`](./AGENTS.md)，并按其中要求查阅本地 Next.js 文档。

架构、设计语言和完整流程从 [`docs/README.md`](../../docs/README.md) 进入。
