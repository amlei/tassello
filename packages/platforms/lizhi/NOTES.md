# 荔枝播客适配器 NOTES（2026-10-02 真机探测）

> 结论先行：**verify 的「登录态失效 fail」分支已真机验证；已登录分支与整条存草稿链路因服务端会话过期未探测**。
> 阻塞属于允许的例外（人工验证码/扫码登录），不是技术死路；续探步骤见 §5。

## 1. 端点清单（全部有真机证据）

| 端点 / URL | 证据 | 结论 |
|---|---|---|
| `https://nj.lizhi.fm/static/newsite/#/manage/sheet` | probe-home.ts：未登录访问被前端路由弹回 `/account/login` | 创作者后台，hash 路由 SPA |
| `https://nj.lizhi.fm/account/login` | probe-home.ts 真机 DOM：`手机登录 / 二维码登录 / 获取验证码 / QQ账号登录 / 微博账号登录` | 唯一登录入口，均为人工操作 |
| `https://njnew.lizhi.fm/user/getCurrentUserInfo` | probe-api.ts（200 + `{"rcode":403,"msg":"没有权限访问"}`）；probe-headers.ts 抓到 SPA 自身调用 | 账号信息接口，业务域 `njnew.lizhi.fm` |
| `https://njnew.lizhi.fm/playsheet/list?type=0&keyword=` | 同上 | 播单列表接口（verify channels 数据源） |
| `https://njnew.lizhi.fm/voice/getUserHasRedPoint?voiceType=-1` | probe-headers.ts 抓到 SPA 调用 | 后台杂项 |
| `https://njnew.lizhi.fm/voice/getHuaWeiCloudUploadToken` | probe-headers.ts 抓到 SPA 登录页也预取（GET，带 content-type 头，先 OPTIONS 预检） | **上传通道线索**：音频上传走华为云对象存储，token 由后台接口签发。响应体未验证 |
| `https://njnew.lizhi.fm/user/getGrayVersion` | probe-headers.ts | 灰度配置，无关发布 |
| `https://njnew.lizhi.fm/user/getAnchorPodcastMarkStatus` | probe-api.ts（同样 403 未验证响应体） | 主播标记状态 |

## 2. 登录态调查（阻塞根因，2026-10-02 实测）

- 探针 profile（`~/.local/share/tassello/probe-profiles/lizhi`）cookie 库里 `hash`（`.lizhi.fm`，2027-03 过期）
  与 `PLAY_SESSION`（host-only nj.lizhi.fm，会话 cookie）都在；
- probe-cookies.ts：`hash blocked:[]` —— **cookie 有随请求发出**，但接口仍回 `rcode:403 没有权限访问`，
  SPA 弹回 `/account/login` → 服务端会话已失效，不是 cookie 没带上；
- `PLAY_SESSION` 不在请求关联 cookie 列表里（已失效/未恢复）；
- headless 与 visible 模式结果一致（probe-visible.ts），排除 headless 指纹拦截；
- `sync-profile.ts` 从日常 Chrome 重同步成功（`{"ok":true,...}`）后复测依旧 → 源头登录态也已过期。

**解法（人工，约 1 分钟）**：用户在日常 Chrome 打开 https://nj.lizhi.fm/static/newsite/ 用手机验证码或
扫码登录，然后重跑 `bun packages/platforms/lizhi/scripts/sync-profile.ts`。

**踩坑**：荔枝把未登录语义做成 `HTTP 200 + {"rcode":403,"msg":"没有权限访问"}`，不能靠 HTTP 状态码判登录，
要靠 `rcode` 字段或页面落点（`/account/login`）。

## 3. verify 实现与验证状态

- 已验证分支：headless 打开 `#/manage/sheet` → 轮询落点，`/account/login` 即 `state:"fail"`，
  failReason 指引人工登录。真机跑通（见 §6 冒烟输出）。
- 未验证分支（代码已就位、防御式）：
  - 页面上下文 `fetch`（credentials:include）`getCurrentUserInfo` + `playsheet/list`——端点本身已抓包
    确认（SPA 自身在调），但**已登录响应体结构未验证**，字段映射用候选名宽松匹配
    （uid/nickname/headurl/…），解析不出就带原文报 fail，不编造；
  - 播单列表写入 `profile.channels: [{id, name, coverUrl?}]`（账号→播单两级模型的频道层），
    同样是候选字段名宽松映射，待真实响应修正。

## 4. publish 通道结论（产品语义红线）

**已接入手动向导（2026-10-05）**：用户选择播单后，打开 `#/content/batchToSheet`，把音频交给页面 uploader 后停住。
荔枝未验证“保存草稿”能力；为避免误发布，不自动填完整表单、不点击任何「发布 / 保存 / 创建」类按钮，
播单选择、标题/简介/发布由用户在可见页面完成。

- 上传通道唯一线索：`voice/getHuaWeiCloudUploadToken`（§1）——若续探时确认 token 接口可直接调，
  上传可纯接口化（华为云 PUT），只有「存草稿」提交一步走页面或已探明接口。
- e2e-publish.ts 保留为续探入口（红线：最多到草稿保存成功即停）；cleanup-e2e.ts 本期为空操作
  （e2e 根本没跑过，无平台侧残留）。

## 5. 续探步骤（拿到登录态后）

1. `bun packages/platforms/lizhi/scripts/sync-profile.ts`（同步新登录态）
2. `bun packages/platforms/lizhi/scripts/verify-smoke.ts` → 复核已登录分支，把 getCurrentUserInfo /
   playsheet/list 的**真实响应体**记进本文档，收紧候选字段映射
3. `bun packages/platforms/lizhi/scripts/probe-net.ts`（已登录后台 DOM + 请求清单，补录播单管理页接口）
4. 新增 probe-upload 探针：从「上传节目」入口走一遍（不提交），记录 file input 位置
   （DOM.setFileInputFiles）、标题/简介控件、播单选择控件、草稿保存按钮；确认
   getHuaWeiCloudUploadToken → 华为云 PUT 的上传链路是否可接口化
5. 实现 publish（存草稿为止）→ `scripts/e2e-publish.ts` 真机走通 → cleanup-e2e.ts 实现测试草稿清理

## 6. 2026-10-02 冒烟记录

- `probe-home.ts`：`href: https://nj.lizhi.fm/account/login`（登录页 DOM 完整渲染）
- `probe-api.ts`：四个端点全部 `200 + rcode:403 没有权限访问`
- `sync-profile.ts`：`{"ok":true}` 后复测不变 → 判定「登录态过期需人工登录」，停止后续探测
- `verify-smoke.ts`（适配器真机跑通）：稳定输出 `state:"fail"` + failReason 指引人工登录。
  两次踩坑已修复：① 页面被弹回登录页时 target 销毁，CDP evaluate 抛
  `Inspected target navigated or closed` —— 归因为未登录而不是异常；
  ② 未登录时 SPA 有时先渲染 `#/manage` 再因接口 403 弹回登录页（路由时序不定），
  故 verify 不能只看页面落点，还以 `getCurrentUserInfo` 的 `rcode:403` 为准判会话失效。

## 7. 遗留问题 / 公共层建议

- 已登录 verify 分支、getCurrentUserInfo / playsheet/list 真实字段、uid 真实来源：全部待登录态。
- 手动上传向导已接入；完整表单自动化和草稿/发布接口仍待登录态有效后验证。
  `hash` + `PLAY_SESSION` 双 cookie 的会话有效期未知，续探时记录。
- 公共层建议（交 Lead）：CDP `withPage` 的 headless UA 带 `HeadlessChrome` 字样，本次荔枝排除了
  指纹拦截，但未来平台若按 UA 拦截会反复踩坑，可考虑公共层统一支持 UA 覆盖（本期未动公共层）。
- 测试音频 `/tmp/lizhi-test.m4a`（30s 静音 AAC）不入仓库，过期重造：
  `ffmpeg -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 30 -c:a aac /tmp/lizhi-test.m4a -y`
