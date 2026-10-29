<p align="center">
  <img src="apps/web/public/logo.svg" width="88" height="88" alt="九漾 Onda Logo" />
</p>

<h1 align="center">九漾 Onda</h1>

<p align="center">面向中文创作者的多平台内容发布工作台。</p>

## 项目定位

九漾 Onda 把文章、贴图、视频和音频从一份内容准备到多个平台发布的过程集中到一个本机工作台。内容、平台账号和发布任务都在本地处理，不依赖云端内容服务。

产品包含：

- Next.js Web 工作台
- Electron 桌面宿主
- 本机 CLI
- Obsidian 发布插件
- Chrome / Edge 浏览器发布扩展
- Bun + ElysiaJS 本机后端

## 当前状态

Markdown 直编与独立本机后端已经落地；旧平台 CDP 逻辑仍在按扩展驱动逐步迁移：

| 能力 | 状态 |
|---|---|
| 内容事实源 | Vault Markdown + `tassello` frontmatter |
| 运营状态 | `TASSELLO_DATA_DIR/state/` 文件状态库 |
| 后端 | 独立 Bun + ElysiaJS，HTTP / WebSocket / 文件读写 |
| Web | Next.js 只负责 UI，经 rewrite 访问本机 API |
| Obsidian | 直接编辑 Markdown，发布和任务经本机 API |
| 桌面 | Electron 同时托管 API 与 Web |
| CLI | 按需启动，通过本机 API 创建、等待和取消豆包生图任务 |
| 浏览器扩展 | Native Messaging 自动发现/配对、连接、任务协议和 popup 已完成；平台页面驱动仍迁移中 |

目标架构和迁移边界见 [`docs/design/architecture.md`](docs/design/architecture.md)。

## 开发

```bash
bun install
bun run dev
```

常用验证：

```bash
bun run typecheck
bun test packages/vault/src packages/render/src packages/server/src apps/api/src
cd apps/web && bun run lint && bun run build
cd apps/obsidian && bun test src && bun run build && bun run deploy
cd apps/extension && bun run build
```

完整流程见 [`docs/workflow/development-workflow.md`](docs/workflow/development-workflow.md)。

## CLI

`onda` 是九漾 Onda 的按需 CLI，不启动第二个后台服务。它通过本机 API 创建生图任务，实际页面操作仍由已连接的 Onda 浏览器扩展完成。使用前需要：

1. 启动九漾 Onda。
2. 启动 Chrome 或 Edge，并确认 Onda 扩展已连接。
3. 在浏览器中登录豆包。

桌面安装包会把 CLI 放在：

```text
macOS:   /Applications/Tassello.app/Contents/Resources/bin/onda
Windows: <安装目录>\resources\bin\onda.exe
```

仓库开发时可以直接运行：

```bash
bun run cli -- image list --json
```

也可以先构建独立可执行文件：

```bash
bun run build:cli
./apps/cli/dist/onda image list --json
```

### 创建生图任务

请求文件示例：

```json
{
  "platform": "doubao",
  "model": "Seedream 5.0 Flash",
  "name": "autumn-window",
  "idempotencyKey": "article-cover-20261029",
  "items": [
    {
      "prompt": "温暖的生活方式插画，一只戴着深绿色围巾的橘猫坐在木质窗台上，柔和纸张纹理，画面中不要出现文字",
      "ratio": "16:9",
      "slug": "orange-cat"
    }
  ]
}
```

创建后立即返回任务 ID：

```bash
onda image generate ./request.json --json
```

创建并等待任务完成：

```bash
onda image generate ./request.json --wait --timeout 20m --json
```

请求也可以从 stdin 传入：

```bash
onda image generate - --json < request.json
```

默认模型为 `Seedream 5.0 Flash`，默认比例为 `16:9`。同一任务中的提示词会按顺序在同一个豆包对话里执行。

### 查询与取消

```bash
onda image status <task-id> --json
onda image wait <task-id> --timeout 20m --interval 2s --json
onda image list --json
onda image cancel <task-id> --json
```

`wait` 超时不会取消任务，只返回最后一次任务状态并退出。中断 CLI 也不会取消后台任务；需要停止时显式执行 `cancel`。

成功任务的 `outputs` 包含绝对路径、相对 Vault 路径、分辨率和 SHA-256。默认输出到 Vault 配置的资源目录下：

```text
generated/YYYY-MM-DD-<name>/
```

### 服务发现与 JSON

CLI 按以下顺序查找本机 API：

1. `--api http://127.0.0.1:<port>`
2. `TASSELLO_API_ORIGIN`
3. `TASSELLO_RUNTIME_FILE` 或 `~/.onda/runtime.json`
4. `http://127.0.0.1:4311`

`--json` 输出稳定信封：

```json
{
  "ok": true,
  "data": {
    "id": "g...",
    "status": "success",
    "outputs": []
  }
}
```

失败时输出 `ok: false` 和错误码，并使用稳定退出码：

| 退出码 | 含义 |
|---|---|
| `0` | 成功，或任务已创建 |
| `1` | CLI 内部错误 |
| `2` | 参数、请求或 API 拒绝 |
| `3` | 无法连接九漾 Onda |
| `6` | 豆包额度耗尽 |
| `7` | 生图明确失败 |
| `8` | 结果未知，不要自动重试 |
| `9` | 任务已取消 |
| `10` | `wait` 超时，任务仍在运行 |

CLI 只接受结构化生图命令，不读取浏览器 Cookie，不直接连接扩展，也不暴露通用页面自动化能力。

## 文档

- [文档目录与阅读路线](docs/README.md)
- [架构](docs/design/architecture.md)
- [设计语言](docs/design/design-language.md)
- [仓库约定](docs/conventions/repo-conventions.md)
- [开发流程](docs/workflow/development-workflow.md)
- [平台矩阵与验证记录](docs/platforms/README.md)
- [发布通道模型](docs/platforms/publish-channels.md)

## License

MIT
