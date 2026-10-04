# 即刻适配器 —— 通道选型与真机笔记（可并入 docs/platforms.md §2）

实测日期：2026-10-02。验证环境：隔离 Chrome（`--user-data-dir=~/.local/share/tassello/probe-profiles/jike`，端口 9341，visible），人工扫码登录后全部接口用 Bun 直连复测。

## 2.x 即刻（jike）

### 通道选型：纯 HTTP 接口通道（不走 CDP 发布）

即刻无官方开放发布 API，但 **web 端（web.okjike.com）本身就是纯接口驱动的 SPA**：所有数据与写操作都走 `https://api.ruguoapp.com/1.0/*`，鉴权只有两个请求头——

```
x-jike-access-token: <JWT，登录时下发>
platform: web
```

**不依赖 cookie（登录 cookie 全 HttpOnly 且不参与 API 鉴权）、无前端签名/加密参数**。CDP 抓包确认 web 端真实请求头后，用 Bun 脱离浏览器直连复测：拉资料、发文字动态、发图片动态、删动态全部 200。按「优先 API/HTTP 接口」规则，verify/publish 均为纯 HTTP，浏览器只在**首次绑定导入 token** 时用一次 CDP。

### 实测接口清单（均免 cookie）

| 用途 | 接口 |
| --- | --- |
| 当前用户资料 | `GET /1.0/users/profile`（任意用户加 `?username=`） |
| 发原帖 | `POST /1.0/originalPosts/create`，体 `{ content, pictureKeys: string[], syncToPersonalUpdates: true }` → `data.id` |
| 删帖（探针清理） | `POST /1.0/originalPosts/remove`，体 `{ id }` |
| 帖子详情 | `GET /1.0/originalPosts/get?id=` |
| 图片上传凭证 | `GET /1.0/upload/token?md5=<文件md5>` → `{ uptoken }` |
| 图片直传 | `POST https://upload.qiniup.com/`（FormData `file` + `token`）→ `{ key, fileUrl }` |
| 刷 token | `POST /app_auth_tokens.refresh`，头 `x-jike-refresh-token`（**未真机验证**，见遗留） |

发布回执：`https://web.okjike.com/originalPost/<id>`。

### 登录态/凭据形态

- token 存于 web 端 `localStorage`：`JK_ACCESS_TOKEN`（JWT，~668 字符）+ `JK_REFRESH_TOKEN`。
- 适配器把 token 入 `SecretBox`（`jike:<acctId>:accessToken` / `:refreshToken`），profile 只留 uid/username/name/avatarUrl。
- 首绑：用户在应用共享 Chrome profile 里登录 web.okjike.com 后，verify 兜底提示；token 导入可由 CDP 读 `localStorage` 完成（生产包未内置该步骤，由服务层绑定流程负责）。

### 登录态迁移（Default profile 整目录迁移）

- 迁移布局：`rsync -a`（排除 `Cache`/`Code Cache`/`GPUCache`）把日常 Chrome 的 `Default/` 整目录拷到 `<DST>/Default/`，再拷 `Local State` 到 `<DST>/` 根。
- **cookie 实际位置：`<DST>/Default/Cookies`**（Chrome 154，老位置；本机源 profile 无 `Default/Network/` 子目录，两种位置整目录拷贝都会覆盖到）。
- 登录态判定：迁移后冷启动打开 web.okjike.com 直接落在 `/following` 关注流（有真实 feed 内容），无需人工登录。即刻 API 鉴权其实不靠 cookie（靠 localStorage token，token 随 Local Storage/ 一起迁移存活）。

### 真机踩坑

1. **发帖限速**：连续两次 `create` 会撞 `400 {"error":"动态发送频率过快"}`，实测间隔 5-10s 重试即成功 → publish 内置指数退避重试（6s/12s，共 3 次）。图片上传后立刻 create 也会因七牛回调落库延迟失败，代码里固定 sleep 3s。
2. **上传凭证字段名**：`/1.0/upload/token` 返回的是 `uptoken`（不是 jike-sdk 文档暗示的 `token`），且限定 `mimeType: image/*`。
3. **鉴权头是 `x-jike-access-token` 而非 cookie**：页面 `document.cookie` 为空（全 HttpOnly），早期用 `credentials: "include"` 裸 fetch 只会拿到 401 `{"success":false}`。
4. 网上资料（open-jike/jike-sdk、okjike-cli）讲的是**移动端 App 通道**（`api.jike.ruguoapp.com`，需要伪装 iOS UA/bundleId/deviceId）；web 端走的是同一个 `api.ruguoapp.com` 域但只要 `platform: web` + token，简单得多。
5. probe Chrome 用 shell 后台 `&` 拉起会随命令结束被杀，改 `open -na "Google Chrome" --args …`（launchd 托管）才稳。
6. CDP 附着 okjike 页面后立刻读 `localStorage` 会偶发 `SecurityError: Access is denied for this document`（页面尚在导航/文档未就绪），等待页面稳定或重试即可；同理附着 target 时必须按 `type === "page"` 过滤，否则会摸到 service worker（`document is not defined`）。

### 真机验证记录

- 2026-10-02 首轮：verify-smoke `state: ok`（`呀土豆_fMHq` / uid `6a5ec873a6fb3ab23e339fd1` / 头像 URL）；e2e-publish 文字+1 图发布成功（id `6abf394b756bbb665886c2a2`），回执 get 200，remove 200 清理完毕。
- 2026-10-02 复跑（最终确认）：verify-smoke 再次 `state: ok`；e2e-publish 再次通过（新动态 id `6abf39eabd0563695bc6bccc`，回执 get 200，remove 200）。
- 预研期间共发 4 条探针动态，全部 create→remove 闭环清理（其中 1 条 UI 通道抓包探针首轮漏删，最终扫描 `followingUpdates`/`listForGallery` 后补删，feed 中已无 tassello 残留）。

### 限制与遗留

- **meta.supports 含 `video`（注册表锁定不可改）但视频上传链路未实现**：publish 遇到视频素材只记日志跳过（`jike.publish.videoSkipped`），不发也不报错。视频要走 `/1.0/video/upload` 分片 + 转码回查，工作量另立任务。
- `article` 形态即刻没有独立对应物（原帖无标题位），标题并入正文首行。
- token 刷新（`app_auth_tokens.refresh`）按 jike-sdk 的接口形态实现但未真机触发（触发会轮换 refresh token，不宜在探针里试）；token 失效时的恢复路径以「重新登录 + 重新绑定」为准。
- 即刻帖子无草稿态，`autoSubmit=false` 的注册表语义对本平台不适用：接口直发即真发布，`needsManualConfirm` 恒为 `false`。
