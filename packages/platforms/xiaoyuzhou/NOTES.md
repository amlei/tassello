# 小宇宙适配器 NOTES（2026-10-02 真机验证）

> 结论：**verify 全链路与 publish「草稿为止」链路均已真机跑通**（账号 啊莱 / uid `63ff451cedce67104afc8a27`，5 个节目）。
> 发布红线：小宇宙创建单集页**没有草稿功能**，适配器停在填好的创建页，绝不点「创建 / 定时发布」。

## 1. 端点清单（全部有真机证据）

| 端点 | 证据 | 结论 |
|---|---|---|
| `GET https://podcaster-api.xiaoyuzhoufm.com/v1/profile/get` | probe-api-headers / probe-profile-full（200，完整 body） | 账号信息：`uid / nickname / avatar.picture.picUrl / ownedPodcasts[]` |
| `POST https://podcaster-api.xiaoyuzhoufm.com/v1/podcast/list`，body `{}` | 同上（200） | 节目列表：`pid / title / author / image.picUrl / syncMode` |
| `GET …/v1/podcast/get?pid=` | probe-create-full Network 抓包 | 节目详情 |
| `POST …/v1/hosted-resource/list`，body `{title,pid,type:AUDIO\|IMAGE,skip,limit}` | Network 抓包（`{"total":0,"data":[]}`） | 节目资源库查询；e2e 后复查仍为 0 → 平台侧无残留 |
| `POST https://upload.qiniup.com/`（multipart） | probe-upload5 Network 抓包，响应含 `file.avInfo`（ffmpeg 解析的音频元数据） | 页面音频上传走七牛直传，一次 POST 完成上传+元数据回读 |
| `POST …/v1/episode/hosted/create-free` | bundle `router-4lzf2fF9.js`：`createFreeHosted → /v1/episode/hosted/create-free`，zod schema `{id,audioResourceId,pid,uid,title,pubDate?,shownotes?,brief?,imageUrl?,imageFile?,audioFile,pay?,…visibility…}` | **创建即发布**（响应是完整 episode）；适配器**绝不调用** |
| `POST …/v1/episode/hosted/publish`、`/v1/episode/hosted/update`、`/v1/episode/hosted/remove` | 同 bundle | publish（上线）/改/删单集；全部不在自动化范围内（remove 仅 cleanup 显式确认时可用） |
| `POST …/v1/episode/list` | bundle 端点字符串（cleanup-e2e 用其查残留，真机返回正常） | 单集列表（请求体 `{pid,skip,limit}` 按 bundle 形态推断，cleanup 实测通过） |

- **鉴权**：cookie `x-jike-access-token`（即刻系 JWT）+ 两个必需头 `x-jike-allow-app-token-in-cookie: true`、
  `x-app-build-time: 2026-09-24 14:25:46 +0800`（build time 值来自页面请求抓包；不带 → openresty 401）。
- **无草稿**：bundle 全文检索 `draft/草稿` 只命中 immer 内部与视频草稿枚举描述，episode 无草稿接口 →
  「只存草稿」语义在此平台落地为「编辑器填好即停」。

## 2. 频道列表来源

`/v1/profile/get` 的 `ownedPodcasts` 与 `/v1/podcast/list` 双源一致；profile 写回
`profile.channels: [{pid, title, author, coverUrl, syncMode}]`。publish 目标节目选择：
`TASSELLO_XIAOYUZHOU_PID` 环境变量 > profile 只有一个节目时默认 > 多节目报错列出可选。
（公共层缺口：`PostDraft` 没有目标频道字段，见 §5。）

## 3. 上传通道与发布链路（真机验证）

1. 打开 `/podcast/<pid>/episode/create`，`Emulation.setDeviceMetricsOverride(1400×1100)`，
   关首次引导弹层（「我知道了」/「稍后再说」）。
2. **必须真实鼠标点击「点击上传播客」**：上传面板（及其音频 file input）是懒创建的，不点不存在。
   直接对页面已有 file input 塞文件是最大的坑：页面上先出现的是封面/弹层的 `accept=image/*` 口，
   往里塞音频只会触发一次 qiniu avInfo 探测上传然后**页面纹丝不动**（无报错、无后续请求，t=100s 仍无状态）。
3. 面板展开后按 `accept*=audio` 定位音频 input（`audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/x-m4a`），
   `DOM.setFileInputFiles` 塞入，页面自行 POST upload.qiniup.com。
4. 上传完成判定：页面出现「音频 · 时长」**或**「重新上传」。注意面板上传完会自动收起，
   「重新上传」不一定可见（首版用 `重新上传 && 音频·` 合取条件导致误等超时，已修正为析取）。
5. 填标题：`input[placeholder="输入单集标题"]`（原生 setter + input 事件）。
   shownotes：`.tiptap.ProseMirror`（focus + `Input.insertText`，空行用 Enter keyEvent）。
   **单集表单没有简介字段**——「节目简介」textarea 只在首次引导弹层里，代码做了存在性判断兼容。
6. **到此为止**：不点「创建」、不点「定时发布」。`needsManualConfirm: true`，返回创建页 URL，
   标签页 keepOpen 留给用户人工检查发布。

e2e 真机结果（`scripts/e2e-publish.ts`，音频 5 分钟 AAC）：上传 → 填充 → 停止全部通过；
dump 页面确认标题与 shownotes 已在表单；`cleanup-e2e.ts` 复查 episode/list + hosted-resource/list 均 0 残留。

## 4. 踩坑

- podcaster-api 不带上述两个头直接 401（openresty），且错误页是 HTML 不是 JSON。
- 懒创建 file input + 封面/弹层图片口在前面：盲选第一个 input 塞音频必然静默失败（见 §3.2）。
- 面板 file input 定位必须在真实点击展开**之后**做，且按 accept 过滤（面板里还有视频口 `video/*`）。
- 「音频 · 05:00」中的间隔符是 `·`，正则按 `/音频\s*·\s*\d/` 匹配。
- probe Chrome 用 `open -na` 拉起的旧会话会一直持有 profile（SingletonLock）；@tassello/cdp pool 能复用
  存活调试端口，不冲突，但残留标签页会越积越多（keepOpen 的创建页），人工清一下即可。
- 小宇宙 CDN 无豆瓣式 headless 指纹问题（探针全程 visible Chrome，headless 未单独验证——verify 也用的默认 visible）。

## 5. 公共层建议（给 Lead，未动手）

1. **`PostDraft` 缺目标频道/专辑字段**：账号→频道两级平台（小宇宙/蜻蜓/喜马/荔枝）都需要
   「发到哪个节目/专辑」。目前只能环境变量（`TASSELLO_XIAOYUZHOU_PID`）或单节目默认，建议接口层加
   `post.targetChannelId`（服务层从 UI 选择传入）。
2. **`evaluateScalar` 丢弃 `opts.timeoutMs`**：`packages/cdp/src/evaluate.ts` 只把 `sessionId` 透传给
   `cdp.send`，声明的 per-call 超时实际不生效（走 15s 默认值）。本次靠外层轮询兜底，建议 cdp 层修复。
3. 注册表 meta 已就位（`autoSubmit: false`，lands 文案说「进草稿」）——实际语义是「停在创建页」，
   lands 文案与真实行为略有出入，是否更新由 Lead 定（涉及 registry，未动）。

## 6. 遗留

- 单集封面（`image/*` input）未自动化：表单可不含封面创建，留人工补（后续如需，通道同 §3，按 accept=image 定位）。
- headless 模式 verify 未验证（现走 visible，稳）；如需省窗口可试 `mode:"headless"` 后回归。
- `TASSELLO_XIAOYUZHOU_CONFIRM_DELETE=1` 时 cleanup 会调 `/v1/episode/hosted/remove` 删测试单集，
  该调用本身未真机触发过（无残留可删），首次使用请先人工核对。
- 诊断小工具：`scripts/diag-dump.ts <port>`（附着现有 Chrome dump create 页文本）、
  `scripts/probe-*` 系列为本轮探测脚本，均可独立重跑。
