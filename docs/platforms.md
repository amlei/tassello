# 平台矩阵与验证记录

> 通道选型依据 + 真机验证记录。验证环境：macOS + Chrome + tassello 专用 profile
> （`~/.local/share/tassello/chrome-profile`，由日常 Chrome 会话种子 + 手动登录），2026-09-19。

## 1. 平台矩阵（15 平台）

| 平台 | 通道 | 账号信息来源（已验证=✅） | 阶段 |
|---|---|---|---|
| 微信公众号 | **CDP** | ✅ CDP：mp 后台 `wx.commonData.data`（`nick_name/head_img/user_name`）+ DOM 兜底（API 通道已移除：IP 白名单漂移 + 需人工录入凭据，双通道维护成本不划算） | MVP |
| 微博 | **CDP** | ✅ CDP：`/ajax/profile/info`（页面上下文 fetch，无需签名） | MVP |
| 小红书 | **CDP**（creator 平台） | ✅ CDP：`creator.xiaohongshu.com/api/galaxy/user/info` | 二期首批（接口已预研） |
| 知乎 | CDP | ✅ CDP：`/api/v4/me`（干净 JSON） | 二期 |
| X | API（付费档）+ CDP 兜底 | baoyu `post-to-x` 成熟方案可移植 | 二期 |
| 抖音 | CDP 起步 | Open Platform 有 video.create，需企业资质，后期可切 API | 二期 |
| B站 | CDP 起步 | 投稿接口非官方（cookie-API 后期增强） | 二期 |
| 即刻 | CDP | 无官方开放 API | 二期 |
| 豆瓣 | CDP | 开放 API 早已停摆 | 二期 |
| 头条号 | CDP | 开放平台仅限合作方 | 二期 |
| 百家号 | CDP | 同上 | 二期 |
| 小宇宙 | RSS（生态）/ CDP | 播客分发走 RSS 托管；后台操作用 CDP | 音频阶段 |
| 喜马拉雅 | CDP | 不收 RSS，后台上传 | 音频阶段 |
| 荔枝播客 | CDP | 同上 | 音频阶段 |
| 蜻蜓FM | CDP | 同上 | 音频阶段 |

**结论：CDP 是主通道，API 是增强。** 微信开放 API（`draft/add`、素材上传、freepublish）与 X API 是仅有的两条例行官方通道。

## 2. 真机验证记录（2026-09-19）

### 2.1 小红书（creator 平台，信息最全）

- **发布入口**：`https://creator.xiaohongshu.com/publish/publish?source=official`，与主站共享登录态。
- **用户信息**：`GET https://creator.xiaohongshu.com/api/galaxy/user/info`（creator 页面上下文带 cookie fetch，**无需签名、不用 DOM**）：

  ```json
  { "code": 0, "data": {
      "userId": "62e7cef0…", "userName": "啊莱0al", "redId": "3860976518",
      "userAvatar": "https://sns-avatar-qc.xhscdn.com/avatar/…",
      "userDesc": "…", "role": "creator",
      "permissions": ["creatorCollege", …, "REF_PODCA…"] } }
  ```

- **发布形态**（页面实际 tab）：`上传视频 / 上传图文 / 写长文`（曾观察到「发播客」tab，疑与 `permissions` 有关，音频阶段再验）。
- **上传机制**：`input[type=file].upload-input` + CDP `DOM.setFileInputFiles`；网络抓包另见 `/api/media/v1/upload/creator/permit`（bucket/token/uploadId → `ros-upload.xiaohongshu.com`），大文件可预研「permit 直传」路线。
- **踩坑**：
  - 主站 REST 接口（`/api/sns/web/v1|v2/...`）全部要求 `x-s/x-t` 签名 → 放弃，走 creator 域。
  - 页面对象是 Vue 响应式 Proxy（`dep→computed` 循环引用），returnByValue 序列化直接报错 → CDP 封装层只允许标量出页面（`evaluateScalar` 铁律）。

### 2.2 微博

- 登录态：日常 profile 迁移即活；`window.$CONFIG.uid` 判登录。
- 用户信息：页面上下文 `fetch /ajax/profile/info?uid=<uid>`，数据在 `data.user` 下（注意不是 `data` 直下）：
  `id / idstr / screen_name / verified / verified_type / profile_image_url / profile_url / status_total_counter`。
- 开放 API 写权限基本对企业认证放开，不作为通道。

### 2.3 知乎

- 用户信息：`fetch /api/v4/me` → `{ id, name, urlToken, headline, isOrg, type }`，干净 JSON。
- 无开放发布 API，二期走 CDP（专栏/想法编辑器）。

### 2.4 微信公众号（CDP 通道）

- 登录态：扫码登录，session 短；mp 后台首页 URL 带 `token=<sessionToken>`，**每次登录会变** → verify 时刷新进 profile。
- 用户信息：后台 DOM（`G青春列车`、总用户数等）+ `wx.commonData.data`（`nickname / uin`）。
- API 通道（MVP 主路线）：`appid/appsecret` → `access_token`（2h，自动续）→ `draft/add` / 素材上传 / `freepublish`；受 **IP 白名单**限制。本机为移动动态公网 IP（实测会漂移），白名单只能 mp 后台手动改——预检/提示策略延后到验证阶段，`Setting.wechat_ip_whitelist` + `wechat_channel(api|browser)` 先留位。

## 3. 共性工程结论

1. **登录态迁移可行**：`Cookies(+journal)` + `Local Storage` + `Session Storage` + `Local State` + `Preferences` 拷贝到专用 profile 后，微博/知乎/公众号会话全部存活（macOS 下 cookie 加密密钥在用户 Keychain，同机同 Chrome 有效）。生产流程即此：**「重新获取账号」= 用日常 Chrome 的 Default profile 覆盖应用专用 profile（先停应用侧 Chrome 释放文件锁）→ 自动校验**；覆盖后仍失效说明源 Cookie 真过期，才落到打开浏览器人工登录的兜底。
2. **verify 两派**：JSON 接口派（微博/知乎/xhs-creator，页面上下文 fetch 即可）与 DOM 派（公众号）。差异收在平台包内部，接口层统一为「返回 profile 片段」。
3. **profile 非只读**：session token（公众号）、capabilities（xhs permissions）都会变，verify 必须把刷新写回 `PlatformAccount.profile`。
4. **Chrome 136+ 限制**：默认 user-data-dir 禁止远程调试端口；专用 profile 是硬前提，不是偏好。

## 4. 二期待验证清单

- [ ] 小红书「发播客」tab 与 `permissions` 的对应关系
- [ ] 小红书视频大文件：file input vs permit 直传
- [ ] 公众号 API 通道：IP 白名单漂移的预检与提示
- [ ] X API 付费档成本与 X Article 的 CDP 流
- [ ] 抖音 Open Platform 企业资质可行性
- [ ] 播客四平台：RSS 托管接入点与各后台 CDP 成本对比
