# 铺稿 · 原型设计简报

> 本文档是原型实现的唯一输入。实现前请完整阅读，实现时严格遵循「技术约束」与「验收标准」两节。

## 1. 产品定位

**铺稿**是一个多平台内容发布工作台。创作者写一次，铺到多个平台。

核心判断：**这个应用的主体不是平台，而是内容本身。** 平台是内容的出口，不是导航对象。用户打开它，第一眼看到的应该是「我有哪些稿子」，而不是「我连了哪些平台」。

当前阶段是 PM / PoC 原型：验证信息架构、内容类型抽象、以及「发布不阻塞界面」的交互模型。**不对接任何真实平台，不实现文件上传。**

## 2. 内容类型（产品的第一等公民）

五种类型，各有独立的字段与编辑形态：

| 类型 | id | 标题 | 内容描述 | 其他字段 |
|---|---|---|---|---|
| 长文 | `longform` | 必填 | Markdown 正文 | 摘要、标签 |
| 短文 | `shortform` | 选填 | 纯文本正文 | 标签 |
| 贴图 | `gallery` | 必填 | 一句话描述（≤1000 字） | 图片素材列表（占位）、标签 |
| 视频 | `video` | 必填 | 简介 | 视频素材（占位）、封面（占位）、标签 |
| 音频 | `audio` | 必填 | 简介 | 音频素材（占位）、时长、标签 |

设计要点：

- 五种类型共享「标题 + 内容描述」的骨架，但**编辑形态必须明显不同**——长文是写作，短文是速记，贴图是编排，视频/音频是素材 + 元信息。不要用同一个表单换个 label 糊弄过去。
- **素材一律用占位卡**（可添加、可删除、显示序号与尺寸/时长占位文案），不做真实上传。素材区要能传达「以后这里会放真实文件」。
- **「活动」字段本期不实现**，留一个注释说明将来按平台处理即可。

## 3. 平台矩阵（约束驱动 UI）

平台数据是静态配置。每个平台声明支持的内容类型，以及该类型下的硬约束：

| id | 名称 | 支持类型 | 关键约束 |
|---|---|---|---|
| `wechat` | 微信公众号 | longform / gallery / video / audio | 长文标题 ≤64、摘要 ≤120；贴图标题 ≤20、描述 ≤1000、图片 ≤9 |
| `weibo` | 微博 | shortform / gallery / video / longform | 头条文章：标题 ≤32、导语 ≤44；图片+视频合计 ≤18 |
| `x` | X | shortform / longform / gallery / video | 短文 ≤280 字符 |
| `zhihu` | 知乎 | longform | — |
| `juejin` | 掘金 | longform | — |
| `csdn` | CSDN | longform | — |
| `bilibili` | B站 | longform / video | — |
| `toutiao` | 头条号 | longform / shortform / gallery / video | — |
| `xiaohongshu` | 小红书 | gallery / video | 标题 ≤20、正文 ≤1000、图片 1–18 |
| `douban` | 豆瓣 | longform | — |

这个矩阵必须体现在 UI 上，不是死数据：

1. **不支持当前内容类型的平台，显示为禁用状态并给出理由**（如「不支持贴图」），不可勾选。
2. **内容超出平台约束时，在该平台行内联提示**，例如「标题 38 字，超出微博 32 字上限」。
3. 提供「选中全部可用平台」的快捷操作。
4. 平台与账号的连接状态（mock：已连接 / 未连接 / 已过期）在发布面板内展示，并通过抽屉/弹层查看全部平台。**不单独占一个导航入口。**

## 4. 发布模型与状态呈现

### 4.1 任务模型

一次发布 = 每个被选中的平台生成一个独立任务：

```
PublishJob { id, contentId, platformId, status, stage, progress, message, attempt, createdAt, startedAt, finishedAt }
status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
stage:  'queued' | 'render' | 'assets' | 'fill' | 'review' | 'done'
```

阶段命名来自真实发布链路：`render` 渲染排版 → `assets` 上传素材 → `fill` 填充编辑器 → `review` 等待人工确认。

### 4.2 关键交互决策（已定，直接实现）

**发布绝不允许阻塞界面。** 点击发布后立刻把任务推进队列，用户可以立刻去编辑别的稿子或关掉当前页面。

采用**两层呈现**：

1. **顶部全局进度条**：贴在顶栏下沿的一条细线（3px 以内），只在存在活跃任务时出现，显示聚合进度（如 `3/5`）。点击跳转到发布队列。任务全部结束后短暂显示结果后淡出。
2. **任务页 `/tasks`**：这是状态的**真相源**。展示每个任务的平台、阶段、进度、耗时、错误信息，并支持**重试失败任务**、取消排队任务、清空已完成任务。

不采用模态弹窗——模态会阻塞，与需求直接冲突。

### 4.3 模拟发布引擎

前端模拟即可，但要**可解释，不要随机失败**：

- 任务按阶段推进，每阶段有可读的进行中文案（如「正在上传第 3 / 8 张素材」）。
- **失败必须是确定性的、可归因的**：如果内容违反目标平台的硬约束（超字数、图片超限），该任务失败，错误信息指明具体原因与数值。合法内容则成功。
- 各平台耗时不同（短视频平台更慢），体现真实感。
- 队列状态持久化到 localStorage，刷新后继续。

## 5. 信息架构与路由

### 5.1 顶层导航只有两项

侧栏固定导航**只有两个入口**：

- **发布** → `/`
- **任务** → `/tasks`

内容类型**不作为导航层级**。不要出现「长文」「短文」这类菜单项，也不要让人先选类型再进工作台。

### 5.2 类型在顶部切换

「发布」页的**顶部**是内容类型切换条（长文 / 短文 / 贴图 / 视频 / 音频），默认选中长文。切换类型时**主区域随之切换**——列表、新建入口、编辑形态都跟着变。切换状态要体现在 URL 上（如 `/?type=gallery`），保证刷新和分享能还原。

```
/                    发布页：顶部类型切换 + 该类型的内容列表
/content/[id]        稿件编辑（从列表点进来，不是导航项）
/tasks               任务页：发布队列与历史
```

### 5.3 各区域职责

- **发布页主区域**：当前类型的内容列表。每行是一个「版面样本」——格式标记、标题、已选平台 chip、最近发布状态、更新时间。列表要密集有序，不要卡片瀑布。
- **新建**：在发布页通过「新建」触发创建（对话框或弹出菜单均可），创建后进入编辑页。新建的内容自动属于当前选中的类型。
- **稿件编辑页**：左侧编辑区（按类型渲染不同形态），右侧发布面板（平台多选 + 约束提示 + 发布按钮 + 该稿件的最近任务）。窄屏收为单栏。
- **平台**：平台与账号状态**不单独占一个导航入口**。放在发布面板里（每行展示连接状态），并提供抽屉/弹层查看全部平台及其连接状态。
- **任务页**：全部发布任务与历史记录。

## 6. 视觉方向

### 6.1 主题与立意

立意：**内容类型即版面形态。**

这套界面的视觉语言取自印刷制版的工艺现场——制版标记、色标条、稿纸网格。不是为了怀旧，而是因为「一份内容被排成多种版面、分发到不同渠道」这件事，本身就是制版车间的日常。

### 6.2 触发自省（必须遵守）

不要落入当下 AI 生成设计的三个套路：奶油底 + 高对比衬线 + 赤陶色；近黑底 + 单一荧光色；报纸式细线分栏 + 零圆角密排。上面选定的方向不在这三个之中，实现时也不要滑向它们。

### 6.3 色彩

中性冷灰底 + 墨色文本，克制的圆角与描边：

- `--bg` 冷灰纸底 `#EDEEF0`
- `--surface` `#FFFFFF`
- `--ink` `#16181D`
- `--ink-600` `#4A4F57`
- `--ink-300` `#9CA3AC`
- `--rule` `#D5D8DE`

五种内容类型各有一个**专色**，取自印刷色标系统：

- 长文 青 `#0E7C99` ／ 短文 品红 `#C9256E` ／ 贴图 黄 `#D98A00` ／ 视频 墨 `#16181D` ／ 音频 绿 `#2E7D4F`

**专色只用在格式标记上**，界面其余部分保持墨/灰/白的克制。把胆量花在一个地方。

### 6.4 字体

界面以中文为主，字体配对要有编辑气质：

- **标题/版面名**：中文衬线（如系统「宋体」「Source Han Serif」，或通过 `next/font` 引入 Noto Serif SC），克制使用——只用于页面标题与内容标题。
- **界面/正文**：系统中文字体栈（PingFang SC / Microsoft YaHei / Noto Sans SC）+ 拉丁文无衬线。
- **数据/元信息**：等宽字体用于字数统计、任务编号、时间戳、阶段名——这是「校对」的质感来源。

正文可读性优先：长文编辑区行高不低于 1.75，正文宽度有上限（约 34em），避免满屏长行。

### 6.5 签名元素：版面标记（Format Mark）

每种内容类型有一个精确的小型 SVG 标记，**形状即类型**，用于类型切换器、列表行、编辑页头部、队列行：

- 长文：竖直的文本行柱
- 短文：两条短横线
- 贴图：2×2 方格
- 视频：带齿孔条的 16:9 画框
- 音频：波形

这是整套界面唯一被记住的东西，其余保持安静。标记必须是矢量绘制（inline SVG 组件），线条精细、比例准确，不要用 emoji 或现成图标代替。

### 6.6 版面与质感

- 工作台是**密集但有序**的信息表，不要做成大卡片瀑布。
- 写作区给一层极淡的稿纸网格底纹（`repeating-linear-gradient`，透明度低于 4%），提示「这里是写作面」。
- 动效克制：任务推进的进度、顶部进度条、列表进入。**必须尊重 `prefers-reduced-motion`。**

### 6.7 文案

界面文案用中文，遵循产品语言的一致性：

- 动作即结果：按钮「发布」，完成后提示「已发布」。
- 用用户能识别的词，不用系统术语（说「发布队列」，不说「任务编排层」）。
- 空状态与错误是引导，不是情绪：说清发生了什么、下一步该做什么。错误不道歉、不含糊。
- 例：队列空状态写「还没有发布记录。去工作台挑一篇稿子，选好平台就能发。」，而不是「暂无数据」。

## 7. 技术约束

按优先级：

1. **先读 Next.js 自带文档**：`node_modules/next/dist/docs/`。本项目使用 Next.js 16.3.4，与训练数据里的版本有破坏性差异，写任何代码前必须查阅相关章节（`01-app/01-getting-started/`，尤其 `18-upgrading.md`、`05-server-and-client-components.md`、`03-layouts-and-pages.md`）。
2. **Next.js 16 破坏性变更，注意**：
   - `params` / `searchParams` 是 **Promise**，需要 await。
   - 使用类型化的 props 辅助类型，如 `PageProps<"/content/[id]">`、`LayoutProps<"/">`（现有 `app/layout.tsx` 即此写法）。
   - Turbopack 为默认打包器；`middleware` 已更名 `proxy`；ESLint 使用 flat config。
3. **技术栈**：Next.js 16.3.4（App Router）+ React 19.2 + TypeScript 7.0.2 + Tailwind CSS 4 + shadcn/ui + AI Elements + reicon-react。

### 7.1 组件体系：优先使用 AI Elements

项目已装好 **shadcn/ui**（`components.json` 的 style 为 `radix-nova`，底层是 Radix UI）与 **AI Elements 全部 48 个组件**，位于 `@/components/ai-elements/`；基础 UI 原语在 `@/components/ui/`。

**使用原则：先看 AI Elements 有没有合适的，有就用，没有才自己写。** 但不要为了用它而硬塞——组件必须真实承担信息职责。

与本产品高度贴合的组件：

| 组件 | 用在哪 |
|---|---|
| `queue` | 任务页主体：发布队列 |
| `task` | 单个平台的发布任务条目 |
| `plan` | 一次发布的分步计划（渲染 → 上传素材 → 填充编辑器 → 等待确认） |
| `confirmation` | 「等待人工确认」状态：需要人确认才继续 |
| `tool` | 智能体调用的一次具体动作（含输入 / 输出） |
| `reasoning` / `chain-of-thought` | 发布过程中的判断与推理展开 |
| `terminal` | 发布日志（等宽、可滚动） |
| `artifact` | 发布产物：草稿链接、生成的版面 |
| `checkpoint` | 分阶段发布里的检查点 |
| `commit` | 每次发布记录（编号、时间、状态），适合历史条目 |
| `stack-trace` | 失败任务的错误详情 |
| `shimmer` / `spinner` | 加载与进行中状态 |
| `attachments` / `file-tree` | 素材清单（贴图 / 视频 / 音频的占位素材） |
| `image` | 图片素材预览 |
| `audio-player` | 音频类型的内容预览 |
| `web-preview` | 平台效果预览 |
| `code-block` | 长文里的代码片段渲染 |
| `sources` / `inline-citation` | 长文的引用来源 |
| `prompt-input` | 让用户用一句话描述要写什么内容 |
| `message` / `conversation` | 智能体与用户的内容准备对话 |
| `suggestion` | 给用户的下一步建议 |
| `context` / `model-selector` | 上下文用量与模型选择 |
| `schema-display` | 结构化的发布参数 |

其余组件（`sandbox`、`jsx-preview`、`canvas`、`node`、`edge`、`panel`、`toolbar`、`connection`、`controls`、`persona`、`voice-selector`、`speech-input`、`mic-selector`、`transcription`、`test-results`、`package-info`、`environment-variables`、`snippet`、`agent`）按需使用，不确定就不要用。

**注意**：`components/ai-elements/` 与 `components/ui/` 是安装生成的代码。其中 4 个文件为适配当前依赖版本做过最小类型修补（`attachments.tsx`、`context.tsx`、`agent.tsx`、`voice-selector.tsx`），**不要用 `--overwrite` 重装**，否则补丁会被覆盖。

### 7.2 图标

界面图标统一用 **reicon-react**：`import { Gear } from 'reicon-react'`，支持的 props：`size`、`color`、`secondaryColor`、`weight`（`'Outline' | 'Filled'`）、`strokeWidth`，共 2676 个。

AI Elements 与 shadcn 组件内部使用 `lucide-react`，那是它们自带的，不要改动，也不要在自己写的界面里混用 lucide。

### 7.3 主题令牌必须统一

`app/globals.css` 里现在有两套变量：shadcn 的语义令牌（`--background`、`--foreground`、`--popover`、`--primary`、`--border` 等，AI Elements 与 shadcn 组件全部依赖）和上一轮定义的产品色板（`--color-bg`、`--color-ink`、`--color-type-*` 等）。

**必须把 shadcn 语义令牌重新指向本产品的色板**，否则 AI Elements 会渲染成 shadcn 默认中性灰，和自定义部分割裂。第 6.3 节的色值是唯一来源：

- `--background` ← `--color-bg`
- `--foreground` / `--card-foreground` / `--popover-foreground` ← `--color-ink`
- `--card` / `--popover` / `--primary-foreground` ← `--color-surface`
- `--primary` ← `--color-ink`
- `--muted-foreground` ← `--color-ink-600`
- `--border` / `--input` ← `--color-rule`

暗色模式本期不做，但不要留下会破坏浅色表现的 `.dark` 覆盖。保留 `--color-type-*` 五个专色与 `--color-ink-*` 层级，供格式标记与自定义部分使用。

### 7.4 其余约束

4. **纯前端**：无后端、无数据库、无接口调用。状态用 React Context + `useReducer` 管理，持久化到 localStorage。**不引入任何状态管理库**（不要 zustand / redux / jotai）。
5. **不做文件上传**：素材用占位数据结构表示。
6. **质量门槛（全部必须通过）**：`npm run build`、`npm run typecheck`、`npm run lint` 三者零错误。
7. **禁止对代码文件做格式化操作**（prettier、eslint --fix、等），避免产生无关 diff。
8. 如写测试，放在项目根的 `test/` 目录。

### 7.4.1 TypeScript 7 与 ESLint 的共存方式（已配置好，不要改回）

项目按要求使用 **TypeScript 7**（`typescript@^7.0.2`，`tsc` 即 TS 7，`next build` 也走它）。

但 `typescript-eslint` 目前不支持 TS 7（peer 范围是 `<6.1.0`）。已按 TypeScript 官方文档的 side-by-side 方案处理：额外以别名 `typescript6` 装了 TS 6，并在 `eslint.config.mjs` 里把 **ESLint 进程内**对 `typescript` 的 `require` 重定向到 TS 6 的 API。项目本身仍然是 TS 7。

另外，`components/ui/**` 与 `components/ai-elements/**` 是注册表安装的生成代码，已在 ESLint 中整体忽略；**lint 只需要对自己写的代码零报错**。

### 7.5 上一轮的遗留

信息架构重构（第 5 节）已经完成：`app/page.tsx` 顶部为类型切换条，`components/Sidebar.tsx` 顶层只剩「发布 / 任务」，`components/Workbench.tsx` 与 `components/NewContentDialog.tsx` 已按新架构重写，`components/AppShell.tsx`、`GlobalProgress.tsx` 已指向 `/tasks`。`lib/` 数据层与 `components/FormatMark.tsx` 沿用。

剩余待办只有收尾：修掉自己代码里剩下的 lint 报错，然后逐条核对第 8 节验收标准。

## 8. 验收标准

实现完成后逐条自检：

- [ ] **顶层导航只有「发布」「任务」两项**，不存在按内容类型的导航入口
- [ ] 发布页顶部可切换五种内容类型，切换时主区域随之变化，且类型反映在 URL 上（刷新可还原）
- [ ] 五种内容类型都能创建、编辑、保存，且编辑形态彼此明显不同
- [ ] 空状态文案到位
- [ ] 每个稿件可独立选择发布平台；未选中的平台不会被发布
- [ ] 不支持当前类型的平台被禁用并给出理由
- [ ] 超出平台约束的内容在对应平台行内联提示，且该平台发布任务会以明确的错误失败
- [ ] 点击发布后界面**立即**可用，顶部出现全局进度条
- [ ] `/tasks` 展示每个任务的状态、阶段、错误，可重试失败任务、取消排队任务
- [ ] 平台连接状态在发布流程内可见，且没有独立的平台导航入口
- [ ] 至少 6 个 AI Elements 组件被真实使用在合适位置（见 7.1 表格），且渲染正常
- [ ] shadcn 语义令牌已指向本产品色板（检查方式：AI Elements 组件呈现的底色/文字色与自定义部分一致，而非默认中性灰）
- [ ] 界面图标全部来自 reicon-react，未混用 lucide
- [ ] 刷新页面后内容与队列状态保持（localStorage）
- [ ] 移动端可用（窄屏下双栏收为单栏）
- [ ] 键盘焦点可见；`prefers-reduced-motion` 下动效降级
- [ ] 浏览器控制台零错误、零警告
- [ ] 无任何模板化残留（默认 Create Next App 内容、默认图标、默认标题必须全部清除，`metadata` 要改成产品名）

## 9. 明确不做（本期非目标）

- 真实平台对接、Cookie / CDP / API 调用
- 文件上传与真实素材处理
- 「活动」字段
- 账号授权流程（`/platforms` 只做状态展示）
- 多用户、权限、分享
