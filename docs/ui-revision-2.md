# 第二轮修订：UI/UX、配色与平台图标

> 本文件是对 `prototype-spec.md` 的追加修订。两者冲突时，**以本文件为准**。

## 1. 问题诊断（已核实，附证据）

### 1.1 状态色不可用（用户明确指出）

- `app/globals.css` 里 `--destructive` 仍是 shadcn 默认值 `oklch(0.577 0.245 27.325)`，**没有映射到产品色板**，和整套墨/灰/白体系割裂。
- 完全没有 success / warning 语义令牌。
- `components/PublishPanel.tsx` 的 `ConnectionBadge`：
  - 「已连接」用 `text-ink-300`（`#9CA3AC` 浅灰）——一个**正常**状态被画成了「不可用」的样子；
  - 「未连接」与「已过期」**共用同一个 destructive 红**，两者需要不同的用户动作（一个去授权、一个去重新授权），却长得一模一样。
- 结论：整个状态语义层需要重建，而不是换个色值。

### 1.2 平台缺图标

`reicon-brands@1.0.2` 已在 `package.json` 里（`reicon-brands`），含官方品牌图标与官方品牌色。可用对应关系：

| 平台 id | 图标导出 | 官方色 |
|---|---|---|
| `wechat` | `Wechat` | `#07C160` |
| `zhihu` | `Zhihu` | `#0084FF` |
| `weibo` | `Sinaweibo` | `#FFFFFF` ⚠️ 见下 |
| `bilibili` | `Bilibili` | `#00A1D6` |
| `douban` | `Douban` | `#2D963D` |
| `juejin` | `Juejin` | `#007FFF` |
| `csdn` | `Csdn` | `#FC5531` |
| `xiaohongshu` | `Xiaohongshu` | `#FF2442` |
| `x` | `X` | `#000000` |
| `toutiao` | **没有对应图标** | 见下 |

**三个必须注意的点：**

1. **API 与 `reicon-react` 完全不同。** `reicon-brands` 导出的是**返回 `SVGSVGElement` 的普通函数**（vanilla DOM），不是 React 组件。可用成员：调用 `Icon({ size, color })` 得到元素、`Icon.toSvg({ size, color })` 得到 SVG 字符串、以及 `Icon.hex` / `Icon.title` / `Icon.pascal`。在 React 里必须自己包一层组件（推荐 `toSvg()` + `dangerouslySetInnerHTML`，或 `createElement` 注入）。**不要把它当 `<Wechat />` 直接渲染。**
2. **微博的官方色是白色（`#FFFFFF`）**，直接用在浅色底上等于隐形。微博需要走「红色圆底 + 白色图标」这类反白处理，或退化为中性墨色。不要盲目套 `hex`。
3. **头条号没有品牌图标。** 两个选项，二选一并说明理由：用 `Bytedance`（`#3C8CFF`，字节系通用标识）；或从 `reicon-react` 取一个通用图标（如 `Doc` / `Comment`）。倾向后者，因为 Bytedance 不代表头条号，会误导。

### 1.3 平台选择用的是原生 checkbox

全仓库只有一处原生表单控件：`components/PublishPanel.tsx:166` 的 `<input type="checkbox" className="h-3.5 w-3.5 shrink-0 accent-ink" />`。

改法：`npx shadcn@latest add checkbox`（当前 `components/ui/` 里没有 checkbox），用 shadcn 的 `Checkbox` 替换，并处理好 `disabled` 与 `checked` 的视觉状态。

其余输入框（`Editor.tsx`、`NewContentDialog.tsx`）已经在用 shadcn 的 `Input` / `Textarea`，无需替换，但要检查它们在禁用、聚焦、报错三种状态下是否有清晰反馈。

## 2. 本次要做的调整

### 2.1 重建配色与状态语义

保留第一轮的立意（印刷制版、冷灰纸底、墨色文本、五种内容类型专色**只用于格式标记**），但必须建立一套**可用**的状态色：

1. 定义 success / warning / danger / idle 四档状态语义令牌，并把 shadcn 的 `--destructive`、`--ring` 等语义令牌映射到它们。
2. 状态色**不能和五个内容类型专色混淆**——专色是身份的，状态色是处境的。
3. 状态必须在**不依赖颜色**的情况下也能区分：文字、图标、形状至少再给一个线索（色盲友好）。
4. 所有文字对比度要达到 WCAG AA（正文 ≥4.5:1，小字与大字按规范）。当前 `text-ink-300` 承担正常状态文字就是反例。
5. 「已连接 / 未连接 / 已过期」三态要一眼可辨，各自指向明确的下一步动作。

### 2.2 平台行加品牌图标

- 发布面板的每个平台行、以及「查看全部平台」弹层里，都在平台名前显示品牌图标。
- 图标尺寸与文字基线对齐，默认单色（跟随文字色）或用官方色，但要保证在浅色底上可辨识；微博按 1.2 的说明特殊处理。
- 禁用状态的图标要跟着一起降低存在感，但**不能低到看不见**——用户仍需要认出是哪个平台。

### 2.3 平台选择控件

- 用 shadcn `Checkbox` 替换原生 checkbox。
- 三种状态都要清楚：可选中、已选中、禁用（禁用时必须同时给出理由，现有逻辑保留）。

## 3. 约束（沿用第一轮，不得违反）

- 禁止对代码文件做格式化操作（prettier / eslint --fix 等）。
- `components/ui/**` 与 `components/ai-elements/**` 是注册表生成代码，已在 ESLint 中忽略；其中 4 个文件有最小类型补丁（`attachments.tsx`、`context.tsx`、`agent.tsx`、`voice-selector.tsx`），**不要用 `--overwrite` 重装**。
- 项目使用 TypeScript 7，`typescript6` 别名与 `eslint.config.mjs` 的重定向逻辑**不要改**。
- 不引入新的状态管理库、不引入新的 UI 库（平台图标用 `reicon-brands`，界面图标仍用 `reicon-react`）。
- 不改变第一轮已确认的信息架构（顶层只有「发布 / 任务」，类型在顶部切换）。

## 4. 验收标准

- [ ] `npm run build`、`npm run typecheck`、`npm run lint` 三者零错误
- [ ] 三档连接状态在视觉上明确区分，且「已连接」不再呈现为灰色不可用
- [ ] 状态区分不单纯依赖颜色（有文字或图标线索）
- [ ] 平台行与平台弹层都显示品牌图标，图标在浅色底上清晰可见
- [ ] 微博、头条号两个特殊情况的处理有明确理由
- [ ] 平台选择使用 shadcn `Checkbox`，仓库内不再有裸 `<input>`
- [ ] 用 playwright 连接真实 Chrome 实测并截图，确认：编辑页发布面板三态可辨、图标渲染正常、勾选与禁用交互正确、控制台零错误
- [ ] 桌面与 390px 窄屏下均无布局破损
