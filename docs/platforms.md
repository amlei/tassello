# 平台矩阵与验证记录

> 通道选型依据 + 真机验证记录。验证环境：macOS + Chrome + tassello 专用 profile
> （`~/.local/share/tassello/chrome-profile`，由日常 Chrome 会话种子 + 手动登录），2026-09-19。

## 1. 平台矩阵（15 平台）

| 平台 | 通道 | 账号信息来源（已验证=✅） | 阶段 |
|---|---|---|---|
| 微信公众号 | **CDP** | ✅ CDP：mp 后台 `wx.commonData.data`（`nick_name/head_img/user_name`）+ DOM 兜底（API 通道已移除：IP 白名单漂移 + 需人工录入凭据，双通道维护成本不划算） | MVP |
| 微博 | **CDP** | ✅ CDP：`/ajax/profile/info`（页面上下文 fetch，无需签名） | MVP |
| 小红书 | **CDP**（creator 平台） | ✅ CDP：`creator.xiaohongshu.com/api/galaxy/user/info` | 二期首批（接口已预研） |
| 知乎 | **接口（想法/文章直发，cookie + xsrf，签名头非强制）** | ✅ `/api/v4/me`（干净 JSON，字段 snake_case——旧记录的驼峰写法有误） | ✅ 已上线（2026-10-02，见 §2.8） |
| X | API（付费档）+ CDP 兜底 | baoyu `post-to-x` 成熟方案可移植 | 二期 |
| 抖音 | CDP 起步 | Open Platform 有 video.create，需企业资质，后期可切 API | 二期 |
| B站 | CDP 起步 | 投稿接口非官方（cookie-API 后期增强） | 二期 |
| 即刻 | **接口（web 端 HTTP，`x-jike-access-token`）** | ✅ verify：`/1.0/users/profile`；token 在 web 端 localStorage（CDP 只在首绑导 token 时用一次） | ✅ 已上线（2026-10-02，见 §2.7） |
| 豆瓣 | **接口（rexxar dwarf drafts）+ CDP visible 会话** | ✅ 页面 `__INIT_STATE__.user` + cookie `ck`（rexxar /user/self 是占位账号，不可用） | 二期（2026-10-02 草稿通道上线） |
| 头条号 | CDP | 开放平台仅限合作方 | 二期 |
| 百家号 | CDP | 同上 | 二期 |
| 小宇宙 | RSS（生态）/ CDP | 播客分发走 RSS 托管；后台操作用 CDP | 音频阶段 |
| 喜马拉雅 | CDP | 不收 RSS，后台上传 | 音频阶段 |
| 荔枝播客 | CDP | 同上 | 音频阶段 |
| 蜻蜓FM | CDP | 同上 | 音频阶段 |

**结论：CDP 是主通道，API 是增强。** 微信开放 API（`draft/add`、素材上传、freepublish）与 X API 是仅有的两条例行官方通道。

## 2. 真机验证记录（2026-09-19）

### 2.1 小红书（creator 平台，信息最全）

> **2026-10-02 更新：CDP 发布链路四种形态全部真机验证；产品语义为「一律存草稿、给草稿入口」**——
> 图文/视频/播客/长文填好后自动点「暂存离开」（shadow DOM 里的草稿按钮；长文编辑器本来就只有暂存），
> 返回草稿入口 `publish/publish?source=official`（右上角草稿箱，草稿存于浏览器本地），
> 发布与话题绑定由用户在草稿箱完成。
> 话题实测：insertText 的 `#话题` 是纯文本（发布请求 `hash_tag` 为空）；真实话题需键入 `#`
> 触发补全下拉并点选——已验证可行，但按产品决策不自动化，留给用户。
> 播客流程：上传音频（m4a/mp3/wav/flac/aac，**10 分钟～2 小时，≤1GB**）→ 封面对话框（必须，用内容的图片素材）
> → 去发布 → 表单与图文同构（xhs-publish-btn）。适配器在 `packages/platforms/xhs`，
> 探针/e2e 脚本在 `packages/platforms/xhs/scripts/`。
>
> **API 调研结论（2026-10-02，按「优先 API/HTTP 接口」规则核实）**：小红书开放平台
> （open.xiaohongshu.com）是**电商开放平台**，文档目录仅覆盖商品/订单/售后/财务/会员通/电子面单，
> 开发者须企业资质（商家自研须店铺主账号，个人/个体店不可），**无面向内容创作者的笔记发布开放 API**；
> 蒲公英/聚光是商业化合作与广告平台，不对外部内容工具开放发布接口。
>
> **URL 接口实测（2026-10-02）**：页面同款 HTTP 接口签名门槛如下——
> - 签名函数：creator 页面暴露 `window._webmsxyw(path, body?)` → `{ "X-s", "X-t" }`；
>   `anti_hp_sign_config.signIncludesUrl` 声明 `web_api/sns/v2/note` 签名需包含 URL。
> - ✅ 素材链路可纯接口化：`GET /api/media/v1/upload/creator/permit?biz_name=spectrum&scene=image&file_count=1&version=1&source=web`
>   （x-s/x-t 即可）→ 返回 COS `uploadTempPermits`（uploadAddr/fileId/token）→
>   `PUT https://ros-upload.xiaohongshu.com/{fileId}` 带 `x-cos-security-token` 即直传成功（实测 200）。
> - ❌ 发布提交 `POST https://edith.xiaohongshu.com/web_api/sns/v2/note` 除 x-s/x-t 外还要求
>   **动态 `X-S-Common`**（由混淆闭包按请求生成，页面外不可构造；实测回放旧值/补 traceid/换签名 URL 变体全部 406）。
> - 结论：接口能覆盖「上传」但不能覆盖「提交」，且无官方签名规范 → 按规则回退 CDP
>   （提交动作由页面自身代码发起签名请求，适配器只做一次可信点击）。若后续要求提速，
>   可做「HTTP 上传 + CDP 点击提交」混合通道，预留 `_webmsxyw` 签名入口见 `packages/platforms/xhs`。

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
- **上传机制**：`input[type=file].upload-input` + CDP `DOM.setFileInputFiles`；标题是
  `input[placeholder*="标题"]`（原生 setter 触发 Vue 更新），正文是 **tiptap ProseMirror**
  （`.tiptap.ProseMirror`，focus + `Input.insertText` 键入）。网络抓包另见 `/api/media/v1/upload/creator/permit`（bucket/token/uploadId → `ros-upload.xiaohongshu.com`），大文件可预研「permit 直传」路线。
- **发布按钮（最大的坑）**：自定义元素 `<xhs-publish-btn>` 的 **closed shadow DOM**——页面 JS 完全摸不到
  （`querySelector` 全空）。必须 `DOM.getDocument({depth:-1, pierce:true})` + `DOM.performSearch("发布")`
  拿文本节点的 `DOM.getBoxModel` 坐标，再用 `Input.dispatchMouseEvent` 真实点击；且 `mousePressed`
  **必须带 `buttons:1` + 按下约 80ms 延迟**，否则事件静默无效（真机踩坑）。窗口过小时按钮不渲染、
  且右下角客服悬浮球遮挡命中区 → 发布前先 `Emulation.setDeviceMetricsOverride(1400×1100)`。
- **可见范围**：`更多设置` 的 `d-select`（`.permission-card-select`，公开可见/仅自己可见），
  浮层对合成 `el.click()` 免疫，也要真实鼠标按坐标点，选项是浮层里的 `.name`。
  适配器支持 `TASSELLO_XHS_VISIBILITY=self`（测试用；切不成功即中止发布，避免测试内容公开）。
- **发布成功判定**：跳 `/publish/success` + 「发布成功」toast；发布接口
  `POST https://edith.xiaohongshu.com/web_api/sns/v2/note`（Network 域可抓响应 noteId 做回执）。
- **踩坑**：
  - 主站 REST 接口（`/api/sns/web/v1|v2/...`）全部要求 `x-s/x-t` 签名 → 放弃，走 creator 域。
  - 页面对象是 Vue 响应式 Proxy（`dep→computed` 循环引用），returnByValue 序列化直接报错 → CDP 封装层只允许标量出页面（`evaluateScalar` 铁律）。
  - D-UI 组件（`d-select` 等）与 shadow 组件对合成 `el.click()` 免疫，一律真实鼠标坐标点击。

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

### 2.5 微信公众号四种内容形态（2026-09-25 真机验证）

mp 后台首页「新的创作」四项与 tassello 内容类型一一对应，**共用同一个新编辑器**
`/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=<n>&token=…`：

| 形态 | createType | 自动化程度 | 通道要点 |
|---|---|---|---|
| 文章 | 0 | 全自动填充 | 标题 `textarea#title` + 摘要 `#js_description` + 正文 ProseMirror；正文配图走页面上下文 `filetransfer?action=upload_material&scene=8`（实测免 ticket），拿 `cdn_url` 换掉 `figure[data-asset]` 后合成 paste 进编辑器 |
| 贴图 | 8 | 首图自动 | 专用图片 input（accept 带 bmp）。**上传器喂过一次即失效**：mp 重建后旧 input 成死节点、重新喂不再触发，且合成/真实点击添加区都不再建新 input——第二张起只能人工点加图 |
| 视频 | 5 | 编辑器+弹窗自动开到「本地上传」，选文件人工 | `filetransfer scene=29` 能建 video 类素材但服务端探测不出时长（width/height/duration 全 0），进不了「选择视频」素材库；mp 正式视频上传是独立的分片协议（appmsgvideo），v1 未实现。`Page.setInterceptFileChooserDialog` 拦截在 Chrome 153（headless 与 visible 实测）均不触发 `fileChooserOpened`，chooser 通道整体作废 |
| 播客/音频 | 7 | 全自动填充 | `filetransfer scene=4` 上传音频素材（实测进「插入音频」素材库列表、时长正确）→ 点 `a.audio_cover_empty.js_replace_media` 开弹窗 → 勾选条目（**checkbox 是隐藏的，点 label 中心会落在试听按钮上，必须直接点 checkbox 本体**）→ 点「插入」 |

工程结论（全部踩坑实测）：

1. **正文填充必须走合成 paste**（`new ClipboardEvent("paste", { clipboardData })`）：编辑器是 ProseMirror，直接 innerHTML 只骗过 DOM 骗不过编辑器状态，发表时内容会丢。
2. **`DOM.setFileInputFiles` 只对「初始化即存在」的 input 有效**；mp 大量上传入口是点击后才懒创建的 input，且文件框只认 isTrusted 手势——`Input.dispatchMouseEvent` 真实点击也弹不出 chooser（headless/visible 均如此）。稳定通道是页面上下文 `filetransfer` fetch 与「初始化即存在」的 input。
3. 探针脚本保留在 `packages/platforms/wechat/scripts/`（probe / inspect2 / list-tabs 等，可独立运行），下次 mp 改版直接重跑对比。
4. 探测期间在 mp 素材库留下了少量测试文件（probe.mp3 / probe2.mp4 / probe.png 等），可在 mp 后台素材库手动删除。

### 2.6 豆瓣（2026-10-02 真机验证：只存草稿 + 草稿链接）

> 目标形态是**首页分享框「放大」（`.DRE-lite-editor-fullscreen`，同页全屏不跳转）进入的发言编辑器**
> 「可投递到小组 / 记到小事 / 收到文集 / 草稿箱 / 发布」——**不是**日记（`/topic/create?subtype=note`
> 是 subtype=note 形态，无投递小组）。小组投递与文集绑定豆瓣不开放接口，由用户在草稿编辑器里手动完成。

- **通道（按「优先 API/HTTP 接口」规则）**：编辑器草稿走干净 REST，页面上下文 fetch 即可覆盖，不碰编辑器 DOM：
  - `POST https://m.douban.com/rexxar/api/v2/dwarf/drafts`，body `{ draft_props: JSON.stringify({ title?, content: { blocks, entityMap }, image_ids: [], topic_tag_ids: [], subtype: "personal" }) }` → `200 { id, … }`（**免 ck**）
  - `DELETE …/dwarf/drafts?id=<id>` → 200（删单条草稿；`DELETE …/drafts` 不带 id 是**清空整个草稿箱**，禁用）
  - 草稿链接 `https://www.douban.com/topic/create?draft_id=<id>`：真机验证可恢复标题+正文，且带投递小组 UI
  - blocks 体：`{ key, text, type: "unstyled", depth: 0, inlineStyleRanges: [], entityRanges: [], data: { align: "" } }`，一段一个
  - **subtype：发言（可投递小组）= `personal`；日记 = `note`**。tassello 只发 personal
  - **图片（2026-10-03 真机验证）**：先 `POST https://upload.douban.com/j/group/topic/add_photo`
    （FormData：`ck` / `image_file` / `primary_color` / `upload_auth_token`，token 读页面 `__INIT_STATE__`）
    → `{ r: 0, photo: { id, url, width, height, … } }`。草稿带 `image_ids: [id…]` + `image_layout`：
    **画廊模式 = `"horizontal"`**（≤18 张；tassello 约定正文为空时用）、
    **图文混排 = `"vertical"`**（atomic block `{type:"atomic", text:" ", entityRanges:[{key,offset:0,length:1}]}` +
    entityMap `{type:"IMAGE", mutability:"IMMUTABLE", data:{src,width,height,id}}`）。
    坑：`data.id` 缺失时编辑器报「有未上传完成的图片」；**horizontal 也必须在 content 里放 atomic 图块**，否则草稿恢复不出图。
- **verify**：页面 `__INIT_STATE__.user`（`{id, name}`）+ `_GLOBAL_NAV.USER_ID` 兜底 + cookie `ck`；导航「X的账号」文本再兜底 name。
  **不能用 rexxar `/user/self`**：免鉴权参数时返回占位账号（id 1178175「风凌子」，账号状态异常），与真实登录态无关。
- **⚠️ 豆瓣 CDN 对 headless Chrome 返回空响应体**（curl 与 visible Chrome 均正常，疑似指纹识别）→ 豆瓣一切页面任务必须 `mode: "visible"`。
  且**绝不能用共享 profile 跑 headless 探测**：空响应带 `cache-control: max-age=1年`，会缓存投毒，之后 visible 也吃坏缓存（本次真踩，重拷 profile 才恢复）。
- 认证：共享 cookie（`dbcl2`，.douban.com 全域）+ `ck`；m.douban.com 无独立登录态。
- 适配器 `packages/platforms/douban`，脚本 `scripts/`（verify-smoke / e2e-draft / probe-upload）。
- 遗留：`GET/POST …/dwarf/drafts/:id`（单条读写）实测 404（bundle 里是 `:id` 字面量路径，疑似 axios 实例有模板拦截器，未深究）；
  需要更新已有草稿时直接另存新草稿即可。图片走本机→页面 base64 中转上传，超大图（数 MB 级）可能受 CDP 求值体积限制，后续可改直传。

### 2.7 即刻（2026-10-02 真机验证：纯 HTTP 接口直发）

> 适配器 `packages/platforms/jike`，完整实测笔记见 `packages/platforms/jike/NOTES.md`。

- **通道**：web 端（web.okjike.com）本身是纯接口驱动 SPA，所有读写走 `https://api.ruguoapp.com/1.0/*`，
  鉴权只靠 `x-jike-access-token`（JWT，存页面 localStorage `JK_ACCESS_TOKEN`）+ `platform: web` 两个头——
  不依赖 cookie（登录 cookie 全 HttpOnly 且不参与 API 鉴权）、无签名参数。Bun 脱离浏览器直连复测
  资料/发帖/删帖全 200 → **verify/publish 纯 HTTP，浏览器只在首绑导 token 时用一次 CDP**。
  接口直发即真发布，`needsManualConfirm` 恒为 false。
- **关键接口**：`POST /1.0/originalPosts/create`（`{content, pictureKeys, syncToPersonalUpdates:true}` → `data.id`）；
  `POST /1.0/originalPosts/remove`（删帖清理）；`GET /1.0/upload/token?md5=` → `{uptoken}` →
  `POST upload.qiniup.com` 七牛直传 → `{key}`。回执 `https://web.okjike.com/originalPost/<id>`。
- **token 入 SecretBox**（`jike:<acctId>:accessToken`），profile 只留 uid/username/name/avatarUrl。
- **登录态迁移**：Default profile 整目录 rsync（排除三个 Cache）+ `Local State` → 一次成功直接进
  `/following`；cookie 实际在 `<DST>/Default/Cookies`（本机 Chrome 154 老位置）。即刻 API 鉴权靠
  localStorage token（随 Local Storage/ 迁移存活），不靠 cookie。
- **踩坑**：① 连续 create 撞 400「动态发送频率过快」，6s/12s 退避重试可过（内置 3 次）；
  ② 图片上传后七牛回调有秒级延迟，create 前固定 sleep 3s；③ 上传凭证字段是 `uptoken`；
  ④ 网上 open-jike/jike-sdk 资料是移动端通道（伪装 iOS），web 端简单得多；
  ⑤ CDP 附着后立刻读 localStorage 偶发 SecurityError（等文档就绪/重试），附着 target 必须
  `type==="page"` 过滤（会摸到 service worker）；⑥ probe Chrome 须 `open -na` 拉起（launchd 托管），
  shell `&` 后台会随命令被杀。
- **限制/遗留**：视频上传链路未实现（publish 遇视频素材记日志跳过，视频走分片+转码回查另立任务）；
  原帖无标题位，article 标题并入正文首行；`app_auth_tokens.refresh` 按 jike-sdk 形态实现但未真机触发
  （会轮换 refresh token），失效恢复以重新登录+重绑为准。

### 2.8 知乎创作（2026-10-02 真机验证：想法 + 文章接口直发）

> 适配器 `packages/platforms/zhihu`，完整实测笔记见 `packages/platforms/zhihu/NOTES.md`。

- **通道**：想法与文章全部 HTTP 接口直发，无需 CDP 操作 DOM。页面上下文 fetch（带 cookie）+
  `_xsrf` cookie 作 `x-xsrftoken` 头即可；`x-zse-96 / x-zse-93 / x-zst-81` 签名头**实测非强制**。
  老接口已死：`POST /api/v4/pins` 400、`zhuanlan /api/posts/drafts` 404；form-encoded 被 openresty 403。
- **verify**：`GET /api/v4/me` 干净 JSON，字段 snake_case（`id/url_token/name/avatar_url/is_org`）。
- **想法（贴图）**：`POST /api/v4/content/publish`，`action:"pin"`，正文在 `data.hybrid.html` +
  `textLength`；回执 `https://www.zhihu.com/pin/<id>`（响应 `data.result` 是转义 JSON 字符串，
  id 是 15-19 位大整数，必须在原始文本上正则抠，勿 JSON.parse）。删除 `DELETE /api/v4/pins/<id>` 可用。
- **文章**：三步直发——① `POST zhuanlan.zhihu.com/api/articles/drafts` → draftId；
  ② `PATCH /api/articles/<id>/draft` 存正文；③ `POST /api/v4/content/publish`（action=article，
  `data.draft.id`）。发布成功 articleId==draftId，回执 `https://zhuanlan.zhihu.com/p/<id>`；
  第 3 步失败则 `needsManualConfirm=true` 回 `/p/<draftId>/edit` 草稿链接。删文章 `DELETE /api/v4/articles/<id>`。
- **接口必须配对同域页面上下文**：www↔zhuanlan 跨域 fetch 会 `Failed to fetch`（文章链路开
  zhuanlan/write 页面）；about:blank 上下文一律 `Failed to fetch` + `document.cookie` SecurityError，
  求值前先等 `location.hostname` 就位。运行时走 `withPage("zhihu", ...)` 共享池（应用专用 profile）。
- **登录态迁移**：Default profile 整目录 rsync + `Local State`（cookie 在 `Default/Cookies` 与
  `Default/Network/Cookies` 两种位置都在）→ 拉起即登录，零人工登录。
- **踩坑**：① 备用想法草稿接口 `api.zhihu.com/content/drafts` 的 `data` 必须是 JSON 对象，
  序列化成字符串会 200 但不落库；② 想法草稿无删除接口（405），只能在创作中心手动删；
  ③ CDP 回退链路已验证（点「发想法」→ 真实鼠标点 Draft.js 编辑器聚焦 + `Input.insertText` →
  发布解禁，合成 click 即可），探针 `scripts/probe-cdp-pin.ts`——签名头若未来收紧按此回退。
- **限制/遗留**：视频（独立分片上传协议）与带图想法（vupload 图片上传链路未打通）本期显式报错；
  签名头存在收紧风险。

### 2.9 播客四平台（2026-10-02 真机接入：账号→频道两级，一律只存草稿/填好即停）

> 产品语义（四平台统一）：**绝不代点发布**——平台有草稿的就存草稿，没有草稿的就填好表单停住，
> `needsManualConfirm: true`，发布动作由用户在平台后台完成。
> 账号模型：一个账号多个发布目标（小宇宙多个节目 / 喜马拉雅多个专辑 / 荔枝多个播单 / 蜻蜓多个专辑），
> verify 统一回填 `profile.channels: [{id, name, …}]`。各自独立 Chrome profile
> （`~/.local/share/tassello/probe-profiles/<平台>`），细节见各包 `NOTES.md`。

- **小宇宙**（`packages/platforms/xiaoyuzhou`）：verify 走 podcaster-api 域 `/v1/profile/get` +
  `/v1/podcast/list`（必须带头 `x-jike-allow-app-token-in-cookie: true` + `x-app-build-time`，否则 401）。
  **平台无单集草稿**（bundle 证实 `/v1/episode/hosted/create-free` 即创建即发布）→ 落地为「编辑器填好即停」：
  真实点击展开懒创建的音频 file input（页面已有的 input 是封面口，塞了没反应）→ `DOM.setFileInputFiles`
  → 页面自走七牛直传 → 填标题/shownotes → 不点「创建」。
- **喜马拉雅**（`packages/platforms/ximalaya`）：verify 走 `/api/home/userInfo` + `/reform-upload/album/list`
  （pageSize 上限 album 50 / track 20，超限返回 `200 + ret:-3 + 空 data`，极易误判无数据）。
  上传走 WebUploader 隐藏 input；表单是 React 受控（原生 setter 填充）；**专辑下拉浮层要分两次求值**
  （异步渲染，同步点选查不到项）。平台无「存草稿」按钮 → 停在「确认发布」前。
- **蜻蜓FM**（`packages/platforms/qingting`）：业务主域 `papi.qingting.fm`（早期 NOTES 猜的 papi-go
  只是边缘域）；verify 走 `/papi/podcasters/{uid}/info` + `channels_for_page`。上传入口
  `upload_program?channel_id=<id>` URL 参数直选专辑；条目行内名称/导语是纯展示 div，
  唯一编辑入口是 `qt-clickable-div` 图标弹层。平台无草稿按钮 → 停在「发 布」前，页面 keepOpen 留给用户。
- **荔枝播客**（`packages/platforms/lizhi`）：**登录态过期（服务端 `200 + rcode:403`），阻塞于人工登录**
  ——verify fail 分支真机验证通过（判据是 rcode 不是 HTTP 码/页面落点），已登录分支与存草稿链路
  代码就位但未验证；上传通道线索 `voice/getHuaWeiCloudUploadToken`（华为云，可能可接口化）。
  用户在日常 Chrome 重新登录 nj.lizhi.fm 后跑 `sync-profile.ts` 按 NOTES §5 续探。

**共性遗留（记入各 NOTES，待排期）**：① `PostDraft` 缺目标频道字段（账号→频道两级平台都需要，
现各用环境变量/单频道默认过渡）；② `evaluateScalar` 的 per-call timeoutMs 未透传 `cdp.send`；
③ `withPage` 缺 waitForSelector 语义、缺 onNavigatedAway 回调（重定向销毁 target 时 evaluate 抛错）；
④ attachFiles / 真实鼠标点击 helper 在 xhs 与音频包各写了一遍，可下沉共享；
⑤ 「账号→频道 channels」结构四个包已对齐，可抽公共类型进 platform-core。

## 3. 共性工程结论

1. **登录态迁移可行**：`Cookies(+journal)` + `Local Storage` + `Session Storage` + `Local State` + `Preferences` 拷贝到专用 profile 后，微博/知乎/公众号会话全部存活（macOS 下 cookie 加密密钥在用户 Keychain，同机同 Chrome 有效）。生产流程即此：**「导入登录态」（`importProfile`，全局唯一入口）= 用日常 Chrome 的 Default profile 覆盖应用专用 profile（先停应用侧 Chrome 释放文件锁）→ 后台自动重校验全部账号**；单平台「重新校验」只跑 verify 不复制文件，失效落到打开浏览器人工登录的兜底。
2. **verify 两派**：JSON 接口派（微博/知乎/xhs-creator，页面上下文 fetch 即可）与 DOM 派（公众号）。差异收在平台包内部，接口层统一为「返回 profile 片段」。
3. **profile 非只读**：session token（公众号）、capabilities（xhs permissions）都会变，verify 必须把刷新写回 `PlatformAccount.profile`。
4. **Chrome 136+ 限制**：默认 user-data-dir 禁止远程调试端口；专用 profile 是硬前提，不是偏好。

## 4. 二期待验证清单

- [x] 小红书图文/视频/播客发布链路（2026-10-02 真机全链路自动发布通过）
- [x] 小红书长文（2026-10-02 真机验证：网页端仅草稿无发布，适配器存草稿+返回草稿入口；发布需 App 或后续探索）
- [x] 豆瓣发言草稿通道（2026-10-02 真机验证：rexxar dwarf drafts 接口存草稿 + draft_id 链接恢复；投递小组/文集与发布留人工，见 §2.6）
- [x] 即刻接入（2026-10-02 真机验证：web 端 HTTP 接口直发文字+图片动态，token 入 SecretBox，见 §2.7；视频链路遗留）
- [x] 知乎创作接入（2026-10-02 真机验证：想法+文章接口直发，签名头非强制，见 §2.8；视频/带图想法遗留）
- [ ] 小红书「发播客」tab 与 `permissions` 的对应关系（已确认本账号可用）
- [ ] 小红书视频大文件：file input vs permit 直传
- [ ] 公众号 API 通道：IP 白名单漂移的预检与提示
- [ ] X API 付费档成本与 X Article 的 CDP 流
- [ ] 抖音 Open Platform 企业资质可行性
- [x] 播客四平台接入（2026-10-02：小宇宙/喜马拉雅/蜻蜓真机存草稿语义通过，荔枝待人工登录续探，见 §2.9）
