# Tassello Publisher (Obsidian)

Obsidian 桌面插件。它把当前 Markdown 文件实时解析为平台 payload，并通过用户当前 Chrome 的审批式远程调试连接填充微博页面或创建知乎 / 小红书草稿。

## 构建

```bash
cd /path/to/tassello
bun install
bun run build:obsidian
bun run package:obsidian
```

产物在 `apps/obsidian/release/tassello-publisher/`。

## 手动安装

1. 打开 Obsidian：`Settings → Community plugins`
2. 如果没开启 restricted mode，先选择 `Turn on community plugins`
3. 点击 `Open plugins folder`
4. 在里面建立目录：

```bash
mkdir -p "<your-vault>/.obsidian/plugins/tassello-publisher"
cp -R /path/to/tassello/apps/obsidian/release/tassello-publisher/ \
  "<your-vault>/.obsidian/plugins/tassello-publisher/"
```

5. 重启 Obsidian，或在 Community plugins 里执行 Reload
6. 启用 `Tassello Publisher`

## 使用前开启 Chrome

1. 打开 Chrome
2. 进入：

```text
chrome://inspect/#remote-debugging
```

3. 开启 Remote debugging
4. 在 Obsidian 里点击连接
5. Chrome 弹出远程调试授权框时选择允许

## Frontmatter

```yaml
---
tassello:
  type: image
  platforms:
    - xhs
    - weibo
  title: 自定义标题
  options:
    intent: draft        # auto = 平台能力允许时自动发送；draft = 停在草稿/人工确认
    zhihu:
      channel: article   # 知乎可显式选择 article 或 pin
    x:
      channel: post      # X 当前只有普通帖子；article 会显式报错
---
```

### 当前文章 / 想法平台

| 平台 | 方式 | 说明 |
|---|---|---|
| 知乎 | `article` / `pin` | 文章和想法；`intent` 支持 auto/draft |
| X | `post` | 普通帖子/想法，最多 4 图；X Articles 暂不接入 |
| 即刻 | 动态 | 读取当前 Chrome 登录态；默认自动发送 |
| 豆瓣 | 发言草稿 | 文字/图片草稿；投递和发布由你完成 |
```

插件不保存正文快照；Preview 和 Publish 都读取 Obsidian 当前最新内容。

## 发布库

插件不会创建台账 Markdown。发布状态写回源笔记自己的 frontmatter；用户笔记可以放在 Vault 任意位置。

插件只维护一个默认 Base：

```text
Tassello/Publishments.base
```

发布后源笔记会得到一组 `tassello-*` 属性，例如：

```yaml
tassello-publish: true
tassello-status: 完成
tassello-platforms:
  - weibo
tassello-weibo-status: 完成
tassello-weibo-draft-url: https://example.com/draft
tassello-weibo-publish-url: https://example.com/post
```

Base 内置“全部发布 / 待处理 / 已发布 / 失败”视图。任务面板只保留排队、执行中、待确认和失败；成功或取消的任务写入发布库后从短期队列移除。

## 命令

- `Tassello Publisher: Open publisher`
- `Tassello Publisher: Publish current note`
- `Tassello Publisher: Open publication base`
- `Tassello Publisher: Connect default Chrome`
- `Tassello Publisher: Disconnect default Chrome`

## 当前能力

| 平台 | 行为 |
|---|---|
| 微博 | 打开微博 / 长文编辑器并填充；不点击发送 |
| 知乎 | 创建想法或文章草稿；不点击最终发布 |
| 小红书 | 上传素材、填充笔记并尝试保存草稿；不点击发布 |

发布任务停在 `awaiting_confirm`，用户在平台页面检查并手动完成后，回到 Obsidian 点“标记完成”。弹窗里可以粘贴最终发布链接；留空则只记录完成状态，不伪造发布链接。
