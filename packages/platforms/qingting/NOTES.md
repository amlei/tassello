# 蜻蜓FM 适配器 NOTES（2026-10-02 真机探测 + 已登录续探）

> 结论先行：**登录态已拿到，verify 已登录分支、真实业务端点、上传链路全部真机验证通过。**
> publish 按「只存草稿」语义实现到「发 布」按钮前一步，`needsManualConfirm: true`。

## 1. 端点清单（全部有真机证据）

| 端点 / URL | 证据 | 结论 |
|---|---|---|
| `https://admin.qingting.fm/content/channels` | probe-net.ts / verify 真机 | 专辑管理页，登录墙后；未登录 302/前端路由跳 `/login?showType=qr_code` |
| `https://admin.qingting.fm/login?showType=qr_code` | probe-net.ts DOM | 唯一登录入口（扫码/账密，均人工） |
| `GET https://papi.qingting.fm/papi/podcasters/{uid}/info?filter={"details":1}&…&user_id={uid}&device_id=…&user_token=…&ut=1` | probe-api.ts 已登录 fetch → 200，`errcode:0` | **账号信息**：`data.id / nick_name / avatar / channel_count` 等。业务主域是 **papi.qingting.fm**（此前 NOTES 猜的 papi-go 只承担 message 等边缘接口） |
| `GET https://papi.qingting.fm/papi/podcasters/{uid}/channels_for_page?order=create_time desc&page=1&pagesize=100&filter={"channel_type":""}&…&user_id={uid}&…&user_token=…` | probe-api.ts 已登录 fetch → 200 | **专辑列表**：`data.items[{id, title, category, cover, source, channel_type, read_only, programs_total, …}]`。上传页用的是同端点 + `filter={"channel_type":"1,95,97,99"}`（上传白名单类型） |
| `GET https://admin.qingting.fm/content/upload_program?channel_id={id}` | 真机打开 → `.ant-select` 显示专辑名 | **上传节目页**，URL 参数直选目标专辑（免点下拉） |
| `GET https://upload.qtfm.cn/api/v1/token?storage=huawei&method=formapi&bucket=appuploader&fileName=…` → `POST https://appuploader.obs.cn-east-3.myhuaweicloud.com/` | 上传页塞文件后 performance 记录 | **音频上传通道**：页面自走 token + 华为 OBS 表单上传（适配器只塞 file input，不自己实现） |
| `GET https://papi.qingting.fm/papi/channels/{channelId}/programs?page=1&pagesize=50&order=create_time desc&…` | cleanup-e2e.ts 已登录 fetch → `errcode:0`（探测性调用命中） | **专辑节目列表**（cleanup 残留检查在用） |

凭据机制：`user_id` / `user_token`（JWT）由页面拼进业务接口 query；页面上下文里可从
`performance.getEntriesByType("resource")` 找到任一 `papi.qingting.fm` 请求解析复用（verify/cleanup 同款做法）。
**适配器不做页面外的直接 API 调用**（无 CORS/token 刷新保障），只在页面上下文 fetch。

## 2. 登录态

- 用户已在日常 Chrome 完成扫码登录；`sync-profile.ts` 重跑后探针 profile 获得登录态（本次已验证）。
- verify「未登录 fail」分支此前已验证；本次「已登录 ok」分支真机通过（uid/name/avatar/channels 全部回填）。

## 3. verify 实现（已真机验证）

- headless 打开 `/content/channels` → `/login` 即 fail；
- 已登录：页面上下文从 performance 记录取 uid/token → fetch `info` + `channels_for_page` →
  `profile = { uid, name, avatarUrl, channels: [{id, name, kind(category), coverUrl(cover), source, channelType}] }`。
- 真机输出：uid `1c95f298…`，name `Amlei`，专辑「青春列车」id `530120`（source=rss，channel_type=99，分类 播客）。

## 4. publish 实现（草稿语义，已真机走到「发 布」前一步）

流程（`src/index.ts`，e2e-publish.ts 真机通过）：
1. 目标专辑：`TASSELLO_QINGTING_CHANNEL_ID` 环境变量优先，否则账号恰一个专辑时自动选；
2. 打开 `upload_program?channel_id={id}`（URL 直选，等 `.ant-select` 文案=专辑名确认）；
3. `DOM.setFileInputFiles` 塞音频（file input 初始化即存在，accept `.MP3,.WAV,.WMA,.AAC,.FLAC,.AIFF,.OGG,.M4A,.MP2,.AMR`）；
4. 轮询到条目出现（`节目名称`+文件名 且无 `N%` 进度文案）——页面自走 OBS 上传；
5. 点行右侧第一个 `.qt-clickable-div` 图标开**编辑表单**：`input[placeholder="请输入节目名"]` +
   节目简介 textarea（≤200 字）+ 节目导语 textarea（≤50 字，听头条导语），原生 setter 填充，
   点「确 认」保存条目编辑（仅更新待发布条目的页面态，不提交）；
6. **红线：绝不点「发 布」**。页面 `keepOpen` 留给用户核对提交。

踩坑记录：
- 条目行里显示的「节目名称/节目导语」是**纯展示 div（无 onClick、非 contenteditable）**——
  单击/双击/合成 click 均无效；唯一编辑入口是行右侧 `qt-clickable-div` 图标按钮（hover 才明显），
  且编辑表单是真实 input/textarea，合成 click + 原生 setter 即可。「确 认」≠「发 布」。
- 节目名称默认取文件名（去扩展名）；不传标题时适配器用文件名兜底。
- 上传页的专辑下拉（ant-select）不必点：URL `channel_id` 直选。
- 未点发布前**平台侧不产生节目记录**（文件只在 OBS 暂存 + 页面本地态），关页即弃——
  这是「草稿」在蜻蜓的唯一形态：上传页没有存草稿按钮，所以页面必须保持打开交用户确认。
- ⚠️ 账号唯一专辑「青春列车」是 RSS 认领（`source:"rss"`, `read_only:true`）：专辑管理页**没有**
  「新建声音」入口，但上传节目页仍可选中它（channel_type=99 在白名单 "1,95,97,99" 内，真机验证）。
  RSS 节目按理应从 RSS 源同步，网页直传的实际效果建议用户首用人工确认一次。

## 5. 续探清单（已完成 ✅ / 遗留）

1. ✅ `sync-profile.ts` 同步登录态
2. ✅ 真实端点确认（§1），适配器占位 `/api/channels` 已替换为 `channels_for_page`
3. ✅ verify-smoke 复核：channels 抓到「青春列车」（id/分类/封面/来源齐全）
4. ✅ 上传链路探明 + publish 实现 + e2e-publish 真机走到「发 布」前（needsManualConfirm）
5. ✅ cleanup-e2e.ts：登录态下拉取专辑 + `channels/{id}/programs` 检查 tassello 测试残留（真机跑通，本期无残留）

遗留：
- 「发 布」提交后的服务端回执（program id）未取——红线内拿不到，needsManualConfirm 语义下不需要。
- `papi/channels/{id}/programs` 的返回字段未做完整梳理（cleanup 只用了 title 过滤）。
- 删除节目的接口未在页面流量中观察到，cleanup 只「发现并报告」，不做自动删除。
- 非 rss 自建专辑的链路未实测（账号没有自建专辑；理论同构，channel_type 白名单已含）。

## 6. 工具与环境

- 探针脚本：probe-api（端点结构）/ probe-upload-page（上传页+表单控件）/ probe-entry（全站入口扫描），
  其余一次性探针已清理。
- 测试音频 `/tmp/qingting-test.m4a`（30s 静音 AAC，13.8KB）不入仓库，过期重造：
  `ffmpeg -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 30 -c:a aac /tmp/qingting-test.m4a -y`
- 探针 Chrome 需手动拉起（launchd 托管，shell `&` 会被杀）：
  `open -na "Google Chrome" --args --user-data-dir=$HOME/.local/share/tassello/probe-profiles/qingting --remote-debugging-port=63168 --no-first-run --no-default-browser-check about:blank`
  probe-live.ts 依赖该端口；withPage 系脚本（verify-smoke/e2e/cleanup/probe-api 等）自管实例。
