# 播客 RSS 与平台认领

> 状态：RSS 快照、账号探测、服务端直传拦截、Web 与 Obsidian 界面已落地；蜻蜓 FM 账号与单音频上传已真机通过。
> 关联文档：[架构](./architecture.md)、[账号同步](./account-sync.md)、[平台矩阵](../platforms/README.md)、[设计语言](./design-language.md)。

## 1. 目标

把同一个播客的多个平台落地收敛为一份 RSS 分发关系：

1. 用户只维护当前播客的一个源 Feed URL 和一个源节目。
2. 新单集只需上传到 RSS 源平台一次。
3. 已认领或已收录该 Feed 的平台自动同步，不生成重复上传任务。
4. 未认领且支持直传的平台仍可在 Onda 中上传。
5. 认领状态在平台账号登录校验时获取一次；成功后长期复用，不在每次发布时重复访问平台。

## 2. 非目标

- 不由 Onda 生成或托管公网 RSS。当前 Vault 只有本地文件和本地媒体地址，不能作为播客 Feed 直接发布。
- 不在发布时轮询 RSS 内容、单集更新或平台同步进度。
- 不自动操作“认领 RSS”“导入 RSS”“添加 RSS”这些平台管理动作。
- 不把豆瓣、Apple Podcasts 当作可上传平台。
- 第一阶段不处理一个账号同时属于多个播客的多 Feed 管理；界面只维护当前选中的一个 Feed，数据模型仍按播客节目关联。

## 3. 核心模型

```ts
type PodcastRssDTO = {
  feedUrl: string;
  title: string;
  episodeCount: number | null;
  coverUrl: string | null;
  sourcePlatformId: string | null;
  sourceChannelId: string | null;
  sourceChannelName: string | null;
  claims: Array<{
    platformId: string;
    state: "claimed" | "indexed";
    label: string;
    evidenceUrl: string | null;
    checkedAt: string;
    accountUid: string | null;
  }>;
  checkedAt: string;
};
```

- RSS 属于具体播客节目，不做全局单例；前端第一阶段只展示一个当前 Feed。
- `claimed` 表示平台已导入或认领该 Feed。
- `indexed` 表示平台已公开收录该播客，但不能直接上传，例如豆瓣、Apple Podcasts。
- 平台账号 UID 或 Feed URL 变化时，旧关联失效。
- 负结果不进入 DTO，也不写永久缓存。
- Feed URL 可能带私有访问参数，日志中不得完整打印；设置页允许复制。

## 4. Feed 获取

采用“自动发现优先、手动输入兜底”：

1. 平台账号校验时，扩展读取该账号已存在的 RSS 导入记录：
   - 小红书「管理 RSS 订阅」
   - 微信公众号「素材库 → 音频 → RSS 导入」
   - 蜻蜓 FM「认领 RSS 节目」
2. URL 去掉 fragment、默认端口和已知跟踪参数后做规范化比较。
3. 同一 URL 由至少两个平台共同确认，或所有候选都指向同一 URL 时自动关联；互相冲突的候选不猜测，保留手动填写兜底。
4. 没有任何候选时，显示手动输入框。用户从播客托管平台复制 Feed URL，Onda 解析标题、封面和单集数用于确认。
5. 豆瓣、Apple Podcasts 没有发布账号。它们在获得主 Feed URL 后，同一次账号检查周期内以播客名称和 Feed 地址进行一次公开检索。

当前真机调查得到同一 Feed：

```text
https://feed.xyzfm.space/9kawahhdv9tp
```

- 小红书：已导入「青春列车」，约 20 期。
- 微信公众号：RSS 导入状态「已完成」，21 期。
- 蜻蜓 FM：RSS 获取状态「成功」。
- 豆瓣：可搜到播客页 `douban.com/podcast/38480717/`。
- Apple Podcasts：按播客名搜索可匹配到相同 feedUrl。

## 5. 一次性状态获取

- 有账号的平台在账号登录校验成功时顺带读取 RSS 列表，不额外轮询。
- `claimed` / `indexed` 成功结果写入 `.onda` 状态文件后永久复用；普通发布不再次访问平台。
- `not_found` / `failed` 不写入永久否定缓存；下一次显式账号校验可以重试。
- Feed URL 或平台账号 UID 改变时清除对应旧结果，仅重新检查一次。
- 旧用户升级后如果没有 RSS 状态，下次账号校验补齐一次；发布弹层不主动联网。

算法与资源边界：

- 发现：`O(P × K)`，其中 `P` 为可读取 RSS 的扩展账号数（当前为 3），`K` 为每个账号的 RSS 记录数（通常 < 20）。
- 发布读取：`O(1)` 命中账号文件中的缓存。
- 不下载音频；只读取小型页面/JSON 响应。
- 典型新增磁盘不足 10 KiB/Feed，最坏预留 1 MiB；CPU、内存和网络开销可忽略。

## 6. 平台语义

| 平台 | 未认领 RSS | 已认领/收录 RSS |
|---|---|---|
| 小宇宙 | 直接上传到指定节目，作为 Feed 源 | 不适用；RSS 源本身 |
| 喜马拉雅 | 直接上传到指定专辑 | 当前设计无 RSS 认领来源 |
| 微信公众号 | 仅支持短语音素材 | 长播客走 RSS 导入，不创建直传任务 |
| 小红书 | 直接上传播客音频与封面 | 通过 RSS 同步，不创建直传任务 |
| 荔枝播客 | 直接上传单个声音到播单 | 当前设计无 RSS 认领来源 |
| 蜻蜓 FM | 直接上传到指定专辑 | 通过 RSS 认领同步，不创建直传任务 |
| 豆瓣 | 不支持直传 | 显示“RSS 已收录” |
| Apple Podcasts | 不支持直传 | 显示“RSS 已收录” |

蜻蜓 FM 使用用户提供的 512×512 PNG 作为平台图标。登录校验、专辑频道和单音频上传已真机通过：音频进入「青春列车」专辑，标题和导语正确，任务停在发布按钮前。

## 7. 发布交互

音频稿的发布弹层分为两组：

```text
直接发布
[小宇宙] [喜马拉雅] [荔枝]

RSS 已同步
[小红书] [微信公众号] [蜻蜓 FM] [豆瓣] [Apple Podcasts]
青春列车 · 21 期
```

- RSS 分组默认折叠，只显示播客名、期数和自动同步平台数；点击后展开已认领/已收录平台。
- 展开后的已认领平台必须显示，不得直接隐藏。
- 已认领平台不可选，使用平台真实图标并附 RSS 标记。
- RSS 平台不计入“已选”，也不创建扩展上传任务。
- 底部任务数只统计直接上传目标；RSS 平台单独显示“自动同步 N 个平台”。
- 如果所有可用目标都已通过 RSS 认领，确认操作只保留 RSS 源平台；没有源上传通道时明确提示“请先在 RSS 托管平台更新单集”。

当前实现中，RSS 平台不参与 `selectedIds` 或任务计数；服务端会再次校验平台账号与 Feed 认领，防止绕过 UI 创建重复直传任务。

## 8. 音频设置

「默认发布」中的音频行最右侧增加一个紧凑的播客 RSS 查看入口：

```text
[RSS 图标]
```

- 入口只显示一个 RSS 图标；点击后打开管理弹层，Feed 标题、期数、URL 和平台状态都在弹层中查看。
- 自动发现成功时显示 Feed 标题、期数和平台状态。
- 候选冲突或没有候选时提供手动输入入口。
- URL 可编辑；设置页不另设常驻说明或重复状态卡片。

## 9. 状态与失败

- `claimed`：可用平台品牌色，显示 RSS 标识，发布时不可选。
- `indexed`：中性色，显示“已收录”，永远不可上传。
- `not_found` / `failed`：不持久化；保留上次成功状态，下一次显式账号检查可重试。
- Feed URL 无法读取、不是播客 Feed 或超过大小限制时，不保存为有效 Feed。
- 后端拉取远程 Feed 时必须限制协议、重定向、响应大小并拒绝私网地址，防止 SSRF。

## 10. 验收

- 同一 Feed 在三个已登录平台被发现时自动合并为一个 RSS。
- 小红书、微信公众号、蜻蜓 FM 显示已认领，豆瓣和 Apple Podcasts 显示已收录。
- 已认领平台在发布弹层中可见但不可选，也不生成任务。
- 已认领状态在后续发布中不产生新的平台账号或 RSS 网络请求。
- 更换 Feed URL 或平台账号后，旧认领结果失效并只重查一次。
- 小宇宙作为源平台时，确认发布只创建一个小宇宙任务。

截至 2026-10-29 已验收：Web 默认发布只显示一个 RSS 图标；发布弹层默认折叠并在展开后显示 5 个平台状态；已认领平台不出现于直传目标；服务端直传拦截有单元测试；蜻蜓 FM 真实账号检查和单音频上传通过且未点击最终发布。

## 11. 实现位置

| 职责 | 位置 |
|---|---|
| 共享 DTO、输入校验 | `packages/shared/src/index.ts` |
| Feed 读取、URL 安全、发现、认领缓存 | `packages/server/src/podcast-rss.ts` |
| 账号检查附带 RSS 探测 | `packages/server/src/account-sync.ts` |
| 直传任务最终拦截 | `packages/server/src/task-service.ts` |
| HTTP API | `apps/api/src/app.ts` 的 `GET/PUT /api/v1/podcast-rss` |
| 扩展平台探测 | `apps/extension/src/accounts.ts` |
| 蜻蜓 FM 单音频驱动 | `apps/extension/src/drivers/qingting.ts` |
| Web 设置与发布弹层 | `apps/web/features/settings/settings-dialog.tsx`、`apps/web/features/editor/publish-sheet.tsx` |
| Obsidian 发布面板 | `apps/obsidian/src/views/publisher-app.tsx` |

状态文件为 `.onda/state/podcast-rss.json`；只保存当前 Feed、候选、已检查账号和正向认领，不保存音频内容。
