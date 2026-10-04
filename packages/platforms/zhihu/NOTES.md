# 知乎平台包 NOTES（2026-10-02 真机验证）

> 可并入 docs/platforms.md §2 的小节。验证环境：macOS + 独立 Chrome（visible，端口 9342，
> profile `~/.local/share/tassello/probe-profiles/zhihu`，全新目录不碰共享 profile）。
> 账号：呀土豆（uid 3cbcecce…，url_token an-wen-18-42）。

## 1. 通道选型（按「优先 API/HTTP 接口」规则）

**结论：想法 + 文章全部走 HTTP 接口直发，不需要 CDP 操作编辑器 DOM。**
页面上下文 `fetch`（带 cookie）+ `_xsrf` cookie 作 `x-xsrftoken` 头即可调用全部写接口；
`x-zse-96 / x-zse-93 / x-zst-81` 签名头**实测非强制**（页面原生请求带，裸 fetch 不带也放行）。

| 形态 | 通道 | 接口 |
|---|---|---|
| 想法（贴图） | **API 直发** | `POST https://www.zhihu.com/api/v4/content/publish`，`action:"pin"` |
| 文章（专栏） | **API 直发** | 建草稿 → PATCH 正文 → 发布（三步见下） |
| 视频 | 未实现 | 创作平台视频是独立分片上传协议，本期显式报错（见 §4） |

## 2. 接口明细（真机实测）

### verify
- `GET https://www.zhihu.com/api/v4/me`：干净 JSON，无需签名、无需 `x-xsrftoken`。
  字段是 **snake_case**：`id / url_token / name / avatar_url / is_org / headline / vip_info…`
  （docs/platforms.md 旧记录里的 `urlToken/isOrg` 驼峰写法有误，以本节为准）。
- 401 时返回 `{"error":{"code":100,"name":"AuthenticationInvalidRequest",...}}`。

### 想法（pin）直发
```
POST https://www.zhihu.com/api/v4/content/publish
headers: Content-Type: application/json, x-requested-with: fetch, x-xsrftoken: <_xsrf cookie>
body: {"action":"pin","data":{
  "publish":{"traceId":"<ms>,<uuid>"},
  "commentsPermission":{"comment_permission":"all"},
  "extra_info":{"view_permission":"all","publisher":"pc"},
  "draft":{"disabled":1},
  "hybrid":{"html":"<p>…</p>","textLength":<纯文本长度>}}}
→ 200 {"code":0,"data":{"result":"{\"id\":\"<pinId>\",\"url\":\"https://www.zhihu.com/pin/<pinId>?native=0\",…}"}}
```
- **注意 `result` 是转义过的 JSON 字符串**（不是对象），要再解析/正则抠 id；里面的引号是 `\"`，正则写成 `\\?"id\\?"` 兜底更稳。
- 删除（探针/e2e 清理用）：`DELETE https://www.zhihu.com/api/v4/pins/<pinId>`（同样裸 fetch + xsrf，200 `{"success":true}`）。
- 回执：`https://www.zhihu.com/pin/<pinId>`。

### 文章三步直发
1. `POST https://zhuanlan.zhihu.com/api/articles/drafts`，body `{title, delta_time:0, can_reward:true}` → 200，响应里 `"id": "<draftId>"`（**冒号后带空格**，正则别写死 `"id":"`）
2. `PATCH https://zhuanlan.zhihu.com/api/articles/<draftId>/draft`，body `{content:"<p>…</p>", table_of_contents:false, delta_time:1, can_reward:true}` → 200
3. `POST https://www.zhihu.com/api/v4/content/publish`，`action:"article"`，`data.draft.id=<draftId>`，其余字段复刻页面原生请求体（见 src/index.ts）→ 200 `{"code":0,"data":{"result":"{\"publish\":{\"id\":\"…\"}}"} }`
- 第 3 步从 **zhuanlan 域页面** fetch www 域接口实测可跨域放行；发布成功后文章 id 与草稿 id 相同。
- 第 3 步失败但草稿已建成时：`needsManualConfirm=true`，回执给 `https://zhuanlan.zhihu.com/p/<draftId>/edit`（草稿编辑链接）。
- 删除已发文章：`DELETE https://www.zhihu.com/api/v4/articles/<id>`（裸 fetch，200 `{"success": true}`）。
- 回执：`https://zhuanlan.zhihu.com/p/<articleId>`。

### 老接口已死（踩坑）
- `POST https://www.zhihu.com/api/v4/pins` → 400 `Missing argument content`（端点已迁走，别用）。
- `POST https://zhuanlan.zhihu.com/api/posts/drafts` → 404（已迁到 `/api/articles/drafts`）。
- 请求体用 `application/x-www-form-urlencoded` → openresty 403（只接受 JSON）。
- 在 www 域页面 fetch zhuanlan 域接口 → CORS `Failed to fetch`；接口必须配对同域页面上下文。

## 3. 真机验证结果

| 项 | 结果 |
|---|---|
| verify-smoke（独立 profile） | ✅ state ok，profile 全字段正确 |
| e2e 想法直发 | ✅ code 0，pin 2089339770379964523，`needsManualConfirm=false`，已删 |
| e2e 文章三步直发 | ✅ code 0，文章 2089339781792768580，`needsManualConfirm=false`，已删 |
| 想法/文章删除清理 | ✅ 裸 fetch DELETE 200 |
| CDP UI 链路（回退参考） | ✅ 可行：点「发想法」→ 弹窗（标题 textarea + Draft.js 编辑器）→ 真实鼠标点编辑器 + `Input.insertText` → 「发布」解禁。探针见 `scripts/probe-cdp-pin.ts` |
| 第三轮独立复跑（收尾会话） | ✅ verify-smoke ok；e2e pin 2089341907176527815 / article 2089341933147763345 直发均 `needsManualConfirm=false`，e2e 内置清理 DELETE 200 |

CDP 链路踩坑（若接口通道未来被签名封死，按此回退）：
- 创作平台「发想法」入口按钮真实坐标点击后弹窗内才渲染编辑器；Draft.js 编辑器必须真实鼠标点击聚焦后再 `Input.insertText`（普通 `el.focus()` 事件流不完整）。
- `insertText` 写入后「发布」按钮才解禁；合成 `btn.click()` 对该按钮有效（无需坐标点击）。
- 页面里有多个隐藏的 Draft 编辑器实例（0×0），选元素必须过滤 `getBoundingClientRect().width > 0`。

## 4. 遗留问题

- **视频**：未实现。创作平台视频上传是独立分片协议（非 content/publish），工作量大，本期 `publish` 显式报错引导手动上传。
- **图片想法（贴图）**：文字想法已通，带图想法需先走知乎图片上传（vupload）拿图片 token 再拼进 `hybrid.content`，未实现；当前带图资产会显式报错。
- 签名头 `x-zse-96/x-zst-81` 目前非强制，但知乎随时可能收紧（小程序/风控变更）；若未来被强制，回退方案是 CDP UI 链路（§3 探针），或页面内定位签名闭包（xhs `_webmsxyw` 同类思路）。
- 探针期间在账号上发布并删除了 3 条想法 + 2 篇文章（均已确认删除成功，回收站里可能仍可见，可在知乎后台彻底清除）。

## 5. 文件

- `src/index.ts` 适配器（verify + publish 想法/文章）
- `scripts/verify-smoke.ts` verify 冒烟
- `scripts/e2e-publish.ts` 想法 + 文章直发 e2e（内置探针内容清理）
- `scripts/cleanup-e2e.ts` 按回执 id 删除测试想法/文章
- `scripts/probe-pin3.ts` 想法通道探针（纯接口直发 + 删）
- `scripts/probe-article.ts` 文章通道探针（三步链路 + 删）
- `scripts/probe-cdp-pin.ts` CDP 回退链路探针（不自动发布）

真机验证时用独立 profile 跑脚本（不碰共享池 profile）：

```bash
TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/zhihu \
  bun packages/platforms/zhihu/scripts/verify-smoke.ts
TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/zhihu \
  bun packages/platforms/zhihu/scripts/e2e-publish.ts
```

## 6. 独立复核与预研增量（2026-10-02 第二轮，另一个会话复跑）

- **登录态迁移**：按 §3 通用方案从日常 Chrome `Default/` 拷 `Cookies(+journal)`、`Preferences`、
  根 `Local State`、`Local Storage`、`Session Storage` 到 `probe-profiles/zhihu`（拷前确认应用侧
  Chrome 已关停），拉起即登录，`/api/v4/me` 直接 200——**零人工登录**。
- **独立复跑**：`tsgo --noEmit` 干净；`verify-smoke` ✅（profile 全字段正确）；
  `e2e-publish` 想法 ✅（pin 2089340881736295116）+ 文章 ✅（2089340850706853943），
  `needsManualConfirm` 均为 false；`cleanup-e2e` 全部 200 删除（回收站可能仍可见）。
- **想法草稿通道（备用）**：`POST https://api.zhihu.com/content/drafts`，body
  `{action:"pin", data:{...}}`（**data 必须是 JSON 对象，序列化成字符串会 200 但内容不落库**），
  草稿箱 `https://www.zhihu.com/creator/manage/creation/draft?type=pin`。删草稿接口未找到
  （DELETE 多变体 405），草稿只能在创作中心手动删。
- **专栏草稿直达链接**：草稿箱在 `/creator/manage/creation/draft?type=article`，
  每条草稿编辑页是 `https://zhuanlan.zhihu.com/p/<draftId>/edit`——发布第 3 步失败时兜底回执就用它。
- **图片想法（贴图）实测**：创作平台弹窗里的 `input[type=file]`（接受 jpg/png/webp/gif/avif/heic）
  对 `DOM.setFileInputFiles` 有效（blob 预览立即出现），但**上传到服务端的请求在选图后 15s 内不发生**
  （疑为发布时才触发或走 worker），纯接口上传链路未打通 → 维持「带图资产显式报错」策略。
- **pin 大整数 id**：接口响应里 id 是 15-19 位数字，页面内 `JSON.parse` 会丢精度——解析一律在
  原始文本上用正则抠字符串（适配器与脚本均已如此处理）。
