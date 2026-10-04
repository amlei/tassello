# 喜马拉雅适配器 NOTES（2026-10-02 真机验证）

> 结论先行：**verify 全链路真机通过（账号 + 专辑列表）；publish 链路真机走到「表单填好、
> 停在确认发布按钮前」，绝不自动发布**。上传是 cupload 分块协议（页面 JS 自管），不接口化；
> 读接口与清理接口均可页面上下文直连（同源 + cookie，无签名）。

## 0. 产品语义的落点（重要）

任务语义是「只存草稿，绝不自动发布」。真机证据：**喜马拉雅网页上传流程没有「存草稿」按钮**——
上传完成后的编辑表单只有「确认发布」（`button.confirm-publish`，见 §3）与「继续添加」。
因此适配器的红线落点是：**上传 + 填表 + 选专辑后停住，绝不点「确认发布」**，
`needsManualConfirm: true`，返回上传页 URL 由用户检查后自己点发布（发布后有平台审核流）。
这与小红书「自动点暂存离开」的形态不同：喜马拉雅没有可点的草稿动作，只能停表单。

## 1. 端点清单（全部有真机证据，2026-10-02）

| 端点 / URL | 方法 | 证据 | 用途 |
|---|---|---|---|
| `https://studio.ximalaya.com/api/home/userInfo` | GET | probe-userinfo.ts 真机 200，`{code:"success",data:{uid:391908628,nickName:"Amlei",logoPic:…}}` | verify：登录校验 + 账号信息 |
| `https://studio.ximalaya.com/reform-upload/album/list?page=N&pageSize=20..50` | GET | probe-albums.ts 真机 200 `ret:0`，3 个专辑（青春列车/无名草/节气拾光） | verify：专辑列表 → `profile.channels` |
| `https://www.ximalaya.com/reform-upload/page/webCenter/upload` | 页面 | probe-upload-iframe/flow 真机 | 上传编辑表单本体（studio /upload 的 iframe，www 域与 studio 共享登录） |
| `https://cupload.ximalaya.com/clamper-token/token` → `/upload/file/blk?…` → `/upload/merge/mkfile` | POST | probe-upload-flow.ts Network 抓包（真机完整走完一次 30s m4a 上传） | 上传链路（页面 WebUploader 自管，见 §4） |
| `https://studio.ximalaya.com/reform-upload/anchorWork/track/list?pageSize=20&keyword=<kw>&status=1&page=1&needTopic=true` | GET | probe-userinfo / cleanup-e2e 真机 200（keyword=tassello → totalSize:0） | 声音列表/清理查询 |
| `https://studio.ximalaya.com/reform-upload/manage/album/track/delete` | POST `{trackId}` | sound/manage 内页 chunk：`trackDelete({trackId})` → `ret===0`「删除成功」；页面本体真机加载证实（`/reform-upload/page/sound/manage/<albumId>`） | cleanup-e2e 删除测试声音（未真删过——无残留可删，见 §6） |

**未验证/不采用的端点**：`/reform-upload/anchorWork/album/list` 等候选全部 404（probe-albums 记录）；
发布提交接口未抓（我们从不点确认发布，无证据不写）。

### pageSize 上限坑（两个接口一致）

`pageSize=100` 或 `50`（track/list 为 50）→ HTTP 200 但 **`ret:-3`、data 为空**——不是报错是空成功，
极易误判成「没数据」。上限：album/list 实测 50 可用、100 不行；track/list 实测 20 可用、50 不行。
适配器统一取保守值（album 用 50，track 用 20）+ 按 `totalSize` 翻页。

## 2. verify（已真机验证）

- 流程：headless 开 studio 首页 → 轮询 `GET /api/home/userInfo` 直到 `data.uid` 出现（登录态就绪）
  → `GET /reform-upload/album/list` 拉全量专辑 → 写回 profile：
  `channels: [{id: String(albumId), name: title, coverUrl: fullCoverPath, isFinished, isPublic}]`。
- verify-smoke 真机输出：uid 391908628 / Amlei + 3 专辑，字段全部来自接口真实响应，无编造。
- 登录态失效判定：userInfo 拿不到 uid（30s 超时）→ `state:"fail"`，指引用 sync-profile.ts 重新同步。

## 3. publish（真机走到表单停住，2026-10-02 e2e 通过）

链路（全部 CDP，visible + keepOpen）：

1. 开 `www.ximalaya.com/reform-upload/page/webCenter/upload`（iframe 本体直接当页面开，共享登录）。
2. `DOM.setFileInputFiles` 喂 WebUploader 隐藏 `input[type=file]`——**input 初始化即存在**，
   无需真实点击；喂完页面自动 clamper-token → 分块 blk → mkfile 合并。
3. 等编辑表单：标题 `input[placeholder="请输入声音标题"]` 被预填成文件名即就绪（~秒级）。
4. 填标题/简介：**React 受控组件**，必须原生 value setter + `input` 事件（原生 setter 模板，与一般 React 页一致）。
5. 选专辑：`TASSELLO_XIMALAYA_ALBUM` 指定目标专辑名。**下拉浮层 React 异步渲染，必须分两步求值**：
   先点 `button[class*=search-select-album-btn]` 展开 → sleep ~1s → 再在 `[class*=select-album-wrapper]`
   里找文本精确匹配且可见的项点击 → 复读按钮文本确认切换生效，不生效即中止（防发错专辑）。
   表单初始按钮文本即「上次选择」的专辑名。
6. 停住：不点「确认发布」，`needsManualConfirm: true`。

表单控件真机清单（probe-upload-flow.ts FORM dump）：标题 input、简介 textarea、
专辑下拉（search-select-album-btn + wrapper 浮层，项为「专辑名 公开」列表）、
「继续添加」/「确认发布」按钮、删除单条按钮（delete-btn，多文件时）。

## 4. 上传通道结论（为什么不接口化）

cupload 分块协议的块参数（clamper token、blk 的 id/name/lastModifiedDate、分块偏移）全部由页面
WebUploader JS 生成（probe-upload-flow 抓包可见完整四步），无文档、复刻成本高且脆；
而 `DOM.setFileInputFiles` 喂隐藏 file input 一步到位、页面自己完成全部上传与合并——
按「接口无法覆盖发布能力时回退 CDP」规则，发布整体走 CDP。读接口（verify/专辑/清理）保持 HTTP 直连。

## 5. 踩坑实录

1. **pageSize 超限返回 `ret:-3` + 空 data**（HTTP 200），不是异常——见 §1，必须按 totalSize 翻页。
2. **专辑下拉在同一次 evaluate 里「点开+点选」拿不到项**：浮层 React 异步渲染，同步查询为空。
   必须分两次求值中间 sleep（e2e 首跑即踩，修复后通过）。
3. 上传 UI 在 iframe 里，直接开 iframe URL（www 域）即可，不必处理 frame 会话。
4. studio 各未知路径（/track /works /anchorWork /sound /content）SPA 全部回退渲染首页——
   作品管理真实入口是 `/opus`，声音管理是 iframe `/reform-upload/page/sound/manage/<albumId>`。
5. React 受控 input 直接赋值不生效（原生 setter + input 事件）；按钮合成 `click()` 在本页可用
   （非 xhs 的 D-UI/shadow 免疫形态）。
6. `evaluateScalar` 铁律照旧：页面是 React 响应式结构，只允许标量/纯结构出页面。

## 6. 验证状态与遗留

- ✅ 真机已验证：verify 全链路（账号 + 3 专辑写回 profile）；publish 上传→填表→切专辑→表单停住
  （e2e-publish.ts 输出 `needsManualConfirm:true`）；cleanup-e2e 查询分支（tassello 残留 = 0）。
- ⚠️ 未真机触发：`track/delete` 的实际删除调用（当前平台侧无测试残留可删——e2e 从不点确认发布，
  表单丢弃即无落库条目；endpoint/body 形态来自官方 chunk + 页面加载证据，第一次真删时留意 `ret` 值）。
  封面选择未自动化（表单默认取音频自带/自动生成封面，任务要求的「填封面」可后续按图片上传通道补）。
- 遗留：发布提交接口未抓取（红线使然，不点确认发布就没有流量）；多文件批量上传未支持；
  `queryLastUpload`/`upload/publish/check` 等表单页辅助接口只记录未使用。
- 测试音频：`/tmp/ximalaya-test.m4a`（30s AAC，未入仓库），过期重造：
  `ffmpeg -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 30 -c:a aac /tmp/ximalaya-test.m4a -y`

## 7. 给 Lead 的公共层建议

- `@tassello/cdp` 无事件订阅的类型化出口：probe 里只能 `(cdp as any).on(...)` 订阅 Network 域事件，
  建议给 `CdpConnection` 补 `on(method, handler)` 的公开类型。
- `withPage` 可见性等待（waitForSelector 语义）缺失，各平台脚本各自 sleep 轮询，可考虑收编。
- registry 的 `supports: ["audio"]` 平台（ximalaya/荔枝/蜻蜓/小宇宙）共用「音频 + 专辑两级频道」
  模型，qingting NOTES 的 `channels` 结构与本包已对齐（{id,name,coverUrl,...}），建议抽公共类型。
