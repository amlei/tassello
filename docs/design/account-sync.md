# 浏览器扩展平台账号同步

> 状态：核心链路已实施；平台账号仍以真机逐项回归为准。
> 关联架构：[`architecture.md`](./architecture.md#extension)。平台真机事实见 [`platforms/README.md`](../platforms/README.md)。

## 1. 目标

把“浏览器扩展已连接”补全为“浏览器中的平台账号已发现”：

1. 扩展在用户安装它的 Chrome 或 Edge 中验证平台登录态。
2. 后端把账号名称、UID、头像、频道和检查时间写入 `.onda/state/accounts/`。
3. Web、Obsidian 与未来 Agent 读取同一份账号事实，不各自保存复制品。
4. 用户只维护浏览器里的正常登录；不复制 profile、Cookie、LocalStorage 或 Token。
5. 首次连接、账号缺失、账号过期和用户手动刷新都有明确结果。

## 2. 重构前问题

实施前曾只完成扩展连接和发布任务通道：

- `listPlatforms()` 读取 `state/accounts/<platform>.json`。
- 新安装没有账号文件，因此每个平台的 `account` 都是 `null`。
- 现有 `verifyAccount()` 只读取旧账号文件；文件不存在就报“尚未连接”。
- 现有 `acquireAccount()` 没有打开登录页。
- 扩展没有 `account.verify` / `account.open-login` 指令。

因此问题不是 Chrome 登录态不可用，而是账号验证链路仍是旧 CDP 语义的桩。

## 3. 非目标

- 本文不定义平台发布驱动；发布链路见 [`architecture.md`](./architecture.md#publish)。
- 不把 Cookie、Session Token、CSRF Token 或 LocalStorage 写入后端。
- 不支持同一平台同时绑定多个账号；当前模型仍是一平台一账号，取当前浏览器会话。
- 不自动处理验证码、扫码确认或平台风控；这些步骤保持可见并等待用户。
- 不为 `planned` 平台制造验证结果。

## 4. 数据流

```text
扩展连接成功
  → 后端找出缺失或过期的 active 平台
  → 向扩展发送 account.verify（串行，最多 1 个在途标签页）
  → 扩展打开非激活平台标签页
  → 扩展在页面 MAIN world 读取账号信息
  → 返回非敏感 profile
  → 后端校验、原子写 accounts/<platform>.json
  → 通过 /ws/client 广播账号快照
  → Web / Obsidian 刷新账号显示
```

用户点击“在浏览器中打开登录页”：

```text
Web
  → POST /accounts/:platformId { action: "acquire" }
  → 扩展打开该平台的可见登录页
  → 用户在当前浏览器完成登录
  → Web 重新可见时自动触发 verify
  → 成功后账号状态变为 connected
```

账号来源始终是当前唯一活跃的浏览器扩展。Web 与 Obsidian 同时使用时，两者共享同一后端和同一扩展，不存在“桌面端连接了谁”的歧义。

## 5. 协议

扩展连接仍使用 `/ws/extension`。新增两类服务端请求和一类扩展回包。

```ts
type ExtensionAccountRequest = {
  type: "account.verify" | "account.open-login";
  requestId: string;
  platformId: string;
};

type ExtensionAccountResult = {
  type: "account.result";
  requestId: string;
  platformId: string;
  state: "ok" | "needs_login" | "failed";
  error: string | null;
  profile: {
    uid: string;
    name: string | null;
    avatarUrl: string | null;
    authExpiresAt: string | null;
    channels: Array<{
      id: string;
      name: string;
      coverUrl: string | null;
    }>;
  } | null;
};

type ExtensionLoginOpened = {
  type: "account.login-opened";
  requestId: string;
  platformId: string;
  ok: boolean;
  error: string | null;
};
```

协议约束：

- 扩展在 `hello` 中上报 `accountProtocolVersion: 1`。后端只向支持该版本的扩展下发账号指令；旧扩展明确收到“请更新浏览器扩展”，不进入等待超时。
- `requestId` 由后端生成；扩展回包必须原样带回。
- 单条扩展消息上限 256 KiB；账号 profile 上限 64 KiB。
- 后端只接受已完成 `hello` 鉴权的扩展连接。
- 同一 `platformId` 只允许一个进行中的 verify；重复请求复用同一 Promise。
- verify 超时 45 秒；超时后移除在途表并返回可重试错误。
- `account.open-login` 只负责打开可见标签页，使用独立 `account.login-opened` 回包，不等待用户完成登录。
- 扩展回包不包含原始 Cookie、Token 或页面 HTML。
- 扩展断线、被替换或凭据撤销时，后端立即拒绝全部在途账号请求并清理去重表。
- 扩展重复收到同一 `requestId` 时幂等返回已有结果，不重复打开标签页。

## 6. 平台验证矩阵

只处理 `status: "active"` 的平台。验证 URL、读取点和身份字段如下。

| 平台 | 验证页面 | 账号来源 | 频道 |
|---|---|---|---|
| 微信公众号 | `mp.weixin.qq.com` | `wx.commonData.data` + 页面 token 存在性 | 无 |
| 微博 | `weibo.com` | `$CONFIG.uid` + `/ajax/profile/info` | 无 |
| 小红书 | `creator.xiaohongshu.com` | `/api/galaxy/user/info` | 无 |
| 即刻 | `web.okjike.com` | LocalStorage access token 校验 `/1.0/users/profile`；token 不离开扩展请求 | 无 |
| X | `x.com/home` | account switcher / avatar test id | 无 |
| 知乎 | `www.zhihu.com` | `/api/v4/me` | 无 |
| 豆瓣 | `www.douban.com` | `__INIT_STATE__`、`_GLOBAL_NAV`、导航文案 | 无 |
| 头条号（planned，代码保留） | `mp.toutiao.com/profile_v4/index` | `/c/user/<uid>/` 账号链接、账号名和头像；当前不自动验证 | 无 |
| 百家号 | `baijiahao.baidu.com/builder/rc/home` | `window.user_id`、账号菜单问候语和头像 | 无 |
| 小宇宙 | `podcaster.xiaoyuzhoufm.com` | `/v1/profile/get` + `/v1/podcast/list` | 节目 |
| 喜马拉雅 | `studio.ximalaya.com` | `/api/home/userInfo` + 专辑列表 | 专辑 |
| 荔枝播客 | `nj.lizhi.fm` | `getCurrentUserInfo` + `playsheet/list` | 播单 |

实现要求：

- 页面读取在扩展打包代码内完成，不能接受服务端下发任意脚本或选择器。
- 优先使用平台自身页面上下文请求；DOM 只作为已真机验证的兜底。
- 返回字段先按平台归一化，再由服务端统一校验，不允许页面对象直接落入状态库。
- 平台未登录、登录页重定向、接口 401/403 都映射为 `needs_login`，不显示“检查成功”。
- 页面结构变化、网络异常和超时映射为 `failed`，保留可诊断原因。
- 即刻按扩展通道处理，并同步修改平台注册表和架构迁移矩阵。页面只在本轮请求内短暂读取 LocalStorage token；token 不返回后端、不写入账号文件。

需要补齐的 `host_permissions`：

```text
https://passport.weibo.com/*
https://mp.toutiao.com/*
https://www.toutiao.com/*
https://sso.toutiao.com/*
https://baijiahao.baidu.com/*
https://passport.baidu.com/*
https://web.okjike.com/*
https://podcaster.xiaoyuzhoufm.com/*
https://studio.ximalaya.com/*
https://passport.ximalaya.com/*
```

导航 URL 由扩展内固定的平台白名单产生。服务端和扩展都不得接受 Web 客户端提供的任意 URL 或脚本。

## 7. 标签页生命周期

后台 verify：

1. 创建一个非激活标签页。
2. 等待页面完成并轮询平台验证函数，最长 30 秒。
3. 成功后关闭该标签页。
4. 失败后也关闭该标签页；失败原因写回后端。
5. 不复用用户正在编辑的标签页，避免改变其页面状态。

默认使用非激活标签页。标记 `verifyMode: "visible"` 的平台只在用户主动点“重新检查”时使用激活标签页；自动扫描遇到这类平台时跳过并显示“待手动检查”，不能偷偷抢焦点。

用户主动登录：

1. 使用 `chrome.tabs.create({ active: true })` 打开登录页。
2. 不自动关闭标签页。
3. 用户可以扫码、验证码登录或处理平台提示。
4. Web 重新可见时触发一次 verify；也保留手动“重新检查”入口。

## 8. 状态模型

持久化 `StoredAccount`：

```ts
type StoredAccount = {
  platformId: string;
  state: "ok" | "fail";
  failReason: string | null;
  name: string | null;
  uid: string | null;
  avatarUrl: string | null;
  authExpiresAt: string | null;
  lastCheckedAt: string;
  /** 只允许归一化后的发布频道，不保存平台原始 profile。 */
  profile: { channels: ChannelDTO[] };
  extensionClientId: string;
  browserLabel: string;
  lastOutcome: "ok" | "needs_login" | "failed";
  updatedAt: string;
};
```

账号名称、UID、头像和有效期各有独立字段；`profile` 固定只有 `channels`。`profile` 不得包含 `cookie`、`ck`、`sessionToken`、`accessToken`、`refreshToken` 或任意平台返回对象中的未知键。

共享 DTO 增加非持久化的账号视图状态，由账号文件、扩展能力和在途请求共同派生：

```ts
export type AccountSyncPhase =
  | "unsupported"
  | "extension_offline"
  | "unverified"
  | "checking"
  | "source_changed"
  | "needs_login"
  | "failed"
  | "connected";

export type AccountSyncDTO = {
  phase: AccountSyncPhase;
  reason: string | null;
};

export type PlatformDTO = PlatformMeta & {
  account: AccountDTO | null;
  sync: AccountSyncDTO;
};
```

| 条件 | 显示 |
|---|---|
| 扩展离线 | `等待扩展`，不能推断为未登录 |
| 扩展在线、账号文件缺失 | `待检测`，首次连接会自动检测 |
| verify 进行中 | `检查中…` |
| 返回 `ok` | `已连接`，显示账号名和频道数 |
| 返回 `needs_login` | `需要登录` |
| 网络或页面异常 | `检查失败` |
| 平台非 active | `尚未接入` |

账号来源变化时显示 `source_changed`。`/ws/client` 的初始 `snapshot`、账号变化事件和 `GET /platforms` 都携带同一个完整 `PlatformDTO[]`，而不是要求各页面自行猜测。

账号来源是 `extensionClientId + browserLabel`，不是后端 installationId。扩展更换浏览器、客户端 ID 改变或首选浏览器切换时，后端主动把已有账号标记为 `source_changed`；新的 verify 结果覆盖旧来源字段。旧账号文件缺少来源字段时直接派生为 `source_changed`，在 verify 成功前不改写旧文件。

Web 编辑器、内容库、发布队列、导航角标和设置页都消费同一份账号事件快照。Obsidian 本期通过 `/api/v1/platforms` 获取默认发布目标的账号可用性并定时刷新，不再只使用编译期静态平台表。两端都不得用整页刷新同步账号，以免破坏编辑器未保存 Buffer。

## 9. 自动同步策略

- 扩展完成握手后，异步扫描缺失账号。
- 已连接账号超过 24 小时才在连接时自动重验。
- 失败账号不在每次重连时自动重试，避免反复打开登录页；由用户手动重试或完成登录后重验。
- 自动扫描串行执行，保证任一时刻最多一个账号后台验证标签页；与发布任务打开的标签页合并计算资源。
- 扫描期间不阻塞发布任务通道；账号请求和发布任务共用已验证 WebSocket，但消息类型独立。

## 10. 安全与一致性

- 后端只监听 `127.0.0.1`，扩展来源继续使用固定扩展 ID 白名单。
- 账号身份属于 `extensionClientId + browserLabel`，不属于 Web、Obsidian 或后端 installation。
- 服务端校验协议 JSON 后写入；非法 UID、过长文本、非 HTTP(S) 头像 URL 和超量频道均拒绝。
- 账号文件只保存展示与发布选择所需信息，不保存登录凭据。
- 状态写入复用 `writeJsonAtomic`；同一文件写入由现有写队列串行化。
- 账号事件与任务事件分开广播，避免 UI 为账号刷新反复轮询。
- 扩展服务 worker 被回收时，后端按超时结束在途请求；下一次自动/手动检查会重新建立。

## 11. 算法与资源

设 `P` 为 active 扩展平台数，`C` 为同时验证数，当前 `C = 1`，`P = 13`。

- 时间复杂度：一次全量扫描为 `Σ O(D_i + R_i)`，其中 `D_i` 是第 `i` 个平台页面 DOM 上限，`R_i` 是网络响应量；在平台数上为 `O(P)`，不随 Vault 文章数或媒体大小增长。
- 最坏时间：单平台等待上限 30 秒，扩展请求上限 45 秒；13 个平台串行最坏约 585 秒。用户主动登录不计入。
- 网络：每平台一次页面加载和 1–2 个账号接口请求；典型账号接口响应小于 100 KiB。页面资源由平台站点决定，X 等重页面最坏可显著高于 5 MiB，必须按实际站点观测，不能承诺固定上限。
- 内存：扩展同时最多保有一个验证页面；账号 profile 上限 64 KiB，待处理账号 Promise 为 `O(P)` 个轻量对象。
- 磁盘：每个平台一次原子 JSON 写入，典型小于 100 KiB；不会扫描或复制 Markdown、图片、音频、视频。
- CPU/GPU：账号同步会执行平台页面脚本，重页面可能产生合成与 GPU 开销；后端 CPU 仅做 JSON 校验和少量文件 IO。资源峰值按“一个账号验证标签页 + 当前发布任务标签页”合并计算。

## 12. 实施边界

服务端：

- 增加扩展账号请求调度器、超时、去重、结果校验和持久化。
- `POST /api/v1/accounts/:platformId`：
  - `verify` 等待扩展结果并返回更新后的 `AccountDTO`；
  - `acquire` 打开登录页并返回 `{ opened: true }`；
  - 平台不存在返回 404；
  - 扩展离线或协议版本不兼容返回 409。
- 扩展握手完成后异步触发缺失账号扫描。
- 通过 `/ws/client` 广播账号快照。

扩展：

- 增加经过白名单约束的平台账号验证器。
- 增加后台标签页生命周期和页面上下文执行器。
- 处理 `account.verify`、`account.open-login` 和 `account.result`。
- 补齐平台登录域与验证域的 `host_permissions`。

客户端：

- 设置页、编辑器、内容库、发布队列和 Obsidian 在账号事件或轮询到达时刷新平台数据。
- 登录按钮通过后端让扩展打开标签页，不再用 `window.open` 绕过当前浏览器上下文。
- 用户从登录页返回后触发一次重验。

## 13. 验证

- Shared：协议 schema 的有效/无效负载测试。
- Server：去重、超时、扩展离线、账号持久化、快照广播和来源更换测试。
- Extension：每个平台验证函数的结构化返回、未登录映射、标签页关闭和异常路径测试。
- 协议兼容：旧扩展缺少 `accountProtocolVersion` 时必须明确拒绝，不能等待超时。
- 断线清理：扩展 WebSocket 关闭后，所有在途 Promise 立即失败。
- 客户端传播：账号事件必须能更新编辑器发布弹层，不得要求整页刷新。
- API 契约：verify、acquire、404 和 409 分支均有测试。
- 端到端：使用当前已连接的 Chrome 验证至少一个现有登录平台；其他平台逐个记录真实结果，不能用 mock 冒充全平台成功。
- 基础门禁：`bun run typecheck`、API tests、extension build、Web lint/build。

## 14. 上线顺序

1. 发布共享协议与服务端调度。
2. 重启本机后端，确保新协议服务端已就绪。
3. 发布扩展账号验证器及权限，然后重新加载扩展。
4. 发布 Web / Obsidian 事件刷新和登录回跳重验。
5. 以当前 Chrome 登录态核对账号名称与频道；未登录平台进入“需要登录”，页面结构问题进入“检查失败”。
