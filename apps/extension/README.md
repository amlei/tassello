# 九漾 Onda 浏览器扩展

## 手动安装

1. 从 [GitHub Releases](https://github.com/amlei/tassello/releases) 下载 `onda-extension-v*.zip`。
2. 解压压缩包。
3. 打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式。
4. 选择“加载已解压的扩展程序”，指向解压目录。
5. 保持九漾 Onda 应用运行。扩展会通过 Native Messaging 自动发现本机服务并连接，不需要地址或配对码。

修改扩展后需要重新执行 `bun run build`，并在浏览器扩展页点击刷新。

扩展重载并连上本机后端后，会自动检查缺失或过期的平台账号。登录态仍保存在浏览器自身；账号检查遇到未登录平台时显示“需要登录”，不会复制 Cookie 或 profile。

## 本地平台驱动验证

先构建扩展，再构建独立的测试入口：

```bash
bun run build
bun run build:e2e
```

在 Chrome 扩展页刷新已加载的 `dist/`，然后打开
`chrome-extension://ablhokoljngdpaicipgpaigjeagmbhkl/e2e-browser.html`。
测试页会直接调用真实平台驱动，只创建草稿或停在发布前，不点击最终发布。
