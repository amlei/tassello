# @tassello/obsidian

九漾 Onda 的 Obsidian 发布插件。它读取当前 Vault 的 Markdown，并把账号、发布任务和回执交给 Tassello 后端。

插件直接编辑 Markdown，不维护第二套发布引擎或浏览器连接。发布前强制保存当前 `MarkdownView`，随后通过本机 Elysia API 创建任务；浏览器登录态和平台操作由同一份 Chrome / Edge 扩展处理。

## 开发与验证

```bash
bun install
bun test src
bun run build
```

## 部署到本机 Obsidian

```bash
bun run deploy
```

部署后需要在 Obsidian 中重载插件，或执行 **Reload app without saving**。

插件设置中的本机 API 地址默认是 `http://127.0.0.1:4311`。平台驱动尚未迁移完成时，任务会明确失败或等待扩展，不会回退到插件内的 CDP 通道。

## 打包

```bash
bun run package
```

产物位于 `release/tassello-publisher/`。

## 文档

- [架构](../../docs/design/architecture.md)
- [开发流程](../../docs/workflow/development-workflow.md)
- [平台矩阵](../../docs/platforms/README.md)
