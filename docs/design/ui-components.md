# 可复用 UI 组件与代码结构

> 本文是组件命名、分层、复用边界、原型目录和生产目录的权威文档。
> 视觉规则见 [`design-language.md`](./design-language.md)，目录与命名总则见 [`repo-conventions.md`](../conventions/repo-conventions.md)。

## 目录

1. [术语](#terminology)
2. [分层与依赖方向](#layers)
3. [组件清单](#inventory)
4. [原型目录规范](#prototype-layout)
5. [生产目录规范](#production-layout)
6. [拆分规则](#rules)
7. [运行时与资源边界](#resources)

<a id="terminology"></a>
## 1. 术语

截图中的右侧圆角工作区称为 **Workspace Surface（工作区表面）**，不是 Card。

| 术语 | 组件名 | 含义 |
|---|---|---|
| 工作台外壳 | `WorkspaceShell` | 标题栏、导航 Rail、右侧工作区组成的整页骨架 |
| 窗口栏 | `WorkspaceTitleBar` | 侧栏开关、搜索、页面上下文、拖拽区和窗口级主操作 |
| 导航 Rail | `NavigationRail` | 左侧固定导航区域 |
| 工作区表面 | `WorkspaceSurface` | 右侧大圆角、承载页面内容的结构表面，不是内容卡片 |
| 页面容器 | `WorkspacePage` | Surface 内的滚动、最大宽度、内边距和页面级布局 |
| 内容卡片 | `ContentTile` | 单篇稿件、任务或账号等独立内容单元 |
| 空态 | `EmptyState` | 没有数据时的说明、插图和主操作 |

层级术语固定为：

```text
Shell → TitleBar / Rail / Surface → Page → Section → Pattern → Card → Content
```

`Surface`、`Panel`、`Card` 不得混用：Surface 表达页面结构，Panel 表达有明确边界的结构区域，Card 表达可独立识别的内容单元。

<a id="layers"></a>
## 2. 分层与依赖方向

| 层 | 内容 | 数据能力 | 放置位置 |
|---|---|---|---|
| Foundations | 颜色、字号、圆角、间距、主题 token | 无状态 | 样式入口或 `packages/ui/src/tokens/` |
| Primitives | Button、IconButton、Status、TypeMark、Badge | 只接收 props | `packages/ui/src/primitives/` |
| Layout | Shell、TitleBar、Rail、Surface、Page | 不获取业务数据 | `packages/ui/src/layout/` |
| Patterns | SettingRow、DialogShell、Toolbar、EmptyState | 只接收 props / slots | `packages/ui/src/patterns/` |
| Features | 账号行、扩展安装行、内容卡、任务卡、设置分区 | 接收 DTO 与回调 | `apps/web/features/` |
| Screens | 内容库、队列、编辑器 | 拥有页面状态、副作用和 API 调用 | `apps/web/screens/` |
| Routes | Next.js 页面入口 | 拉取路由数据并选择 Screen | `apps/web/app/` |

依赖只能向下：

```text
Routes → Screens → Features → UI package → Foundations
```

禁止：

- Layout 或 Primitives 请求 API、读取 Vault 或导入业务 DTO。
- `packages/ui` 反向导入 `apps/web`。
- Feature 通过全局变量寻找页面状态。
- 页面直接复制 Rail、Surface、Button、SettingRow 的样式。

<a id="inventory"></a>
## 3. 组件清单

### 3.1 Layout

| 组件 | 职责 | 关键 props / slots |
|---|---|---|
| `WorkspaceShell` | 全屏工作台骨架 | `titleBar`, `rail`, `children` |
| `WorkspaceTitleBar` | 窗口控制、搜索、上下文、主操作 | `context`, `actions`, `onSearch` |
| `NavigationRail` | 导航容器和折叠宽度 | `collapsed`, `children`, `footer` |
| `RailBrand` | Logo 与产品名 | `productName`, `logo` |
| `RailPrimaryAction` | 新建内容等主入口 | `label`, `icon`, `onPress` |
| `RailNavGroup` | 一组导航项 | `label`, `children` |
| `RailNavItem` | 色标、标题、数量、选中态 | `color`, `label`, `count`, `active` |
| `RailFooter` | 设置、帮助和账号入口 | `children` |
| `WorkspaceSurface` | 右侧圆角结构表面 | `variant`, `scroll`, `children` |
| `WorkspacePage` | Surface 内页面布局 | `width`, `padding`, `children` |

### 3.2 Primitives

| 组件 | 职责 |
|---|---|
| `AppButton` | primary / secondary / ghost / danger 语义按钮 |
| `IconButton` | 无文字或仅图标动作 |
| `SegmentedControl` | 主题等少量互斥选项 |
| `StatusDot` | 可用、等待、异常状态点 |
| `StatusChip` | 已连接、失败、等待等状态标签 |
| `TypeMark` | 内容类型色块或图标 |
| `CountBadge` | 数量、未读数和提示数 |
| `InlineNotice` | 行内错误、警告与说明 |

### 3.3 Patterns

| 组件 | 职责 |
|---|---|
| `SettingRow` | 图标、标题、说明、状态与右侧动作的统一设置行 |
| `EmptyState` | 空列表或未选择内容的说明与主操作 |
| `DialogShell` | 遮罩、对话框尺寸、圆角、Esc 和关闭语义 |
| `PopoverPanel` | 账号详情、行内菜单等浮层 |
| `Toolbar` | 页面、编辑器和筛选工具的连续操作条 |

### 3.4 Feature components

以下组件属于九漾 Onda 的业务语义，不进入通用 Primitives：

- `ContentTile`、`ArticleTile`、`ImageTile`、`VideoTile`、`AudioTile`
- `AccountRow`、`ExtensionInstallRow`、`VaultDirectoryRow`、`AttachmentDirectoryRow`
- `PublishTargetPicker`、`RssDestinationGroup`、`TaskCard`、`PublishResultPanel`
- `PodcastRssRow`、`PodcastRssDialog`
- `CoverRow`、`CoverPicker`
- `RichTextEditor`、`EditorToolbar`、`MediaAssetStrip`、`PhonePreview`

`CoverRow` 负责展示当前封面、默认图来源和平台适用范围；`CoverPicker` 只负责
从稿件已有图片或新上传文件中选择封面。两者不得复制媒体条或内容卡片的样式。

新项目可复制其交互模式，但不得把这些业务组件伪装成通用组件。

<a id="prototype-layout"></a>
## 4. 原型目录规范

原型与生产使用同名组件和相同解剖结构，但不直接引用生产运行时。Babel 原型继续使用 `window` 导出组件。

```text
designs/onda-explore/directions/mosaic/
├── index.html
├── app.jsx
├── styles/
├── components/
│   ├── layout/
│   ├── primitives/
│   └── patterns/
├── features/
├── screens/
├── mock/
└── assets/
```

原型目录规则：

- `app.jsx` 只持有跨页面状态，不承载完整页面 JSX。
- `mock/` 不包含行为；行为属于对应 Feature 或 Screen。
- 每个视觉模块只出现一次；页面不得复制 Rail、Surface 或 Button 结构。
- 原型可以先用简化数据，但组件边界必须与生产一致。

<a id="production-layout"></a>
## 5. 生产目录规范

```text
packages/ui/
├── package.json
└── src/
    ├── tokens/
    ├── primitives/
    ├── layout/
    ├── patterns/
    └── index.ts

apps/web/
├── app/
├── screens/
├── features/
├── adapters/
└── lib/
```

生产目录规则：

- `packages/ui` 只放跨页面、无业务数据依赖的组件。
- `packages/ui` 可将 React、HeroUI 和 Reicon 声明为 peer dependency；不得依赖 Next.js、Electron、Obsidian 或浏览器扩展 API。
- `apps/web/features` 放九漾 Onda 业务组件。
- `apps/web/screens` 拥有页面状态、副作用和 API 组合。
- `apps/web/app` 的页面文件只做路由级取数和 Screen 选择。
- Next.js router、API client 和快捷键适配放在 `adapters/`，不进入 `packages/ui`。
- `WorkspaceShell` 的纯布局位于 UI 包；Next 专用连接器位于 `apps/web/adapters/`。

<a id="rules"></a>
## 6. 拆分规则

- 组件边界按职责和状态所有权划分，不按行数拆分。
- 展示组件只接收 props 和回调；不得内部调用 API。
- 页面状态由 Screen 持有，跨页面状态由明确 App Provider 或 store 持有。
- 一个组件有多个布局形态时使用 `variant` 或 slots，不复制整个组件。
- Layout 组件不得接受领域 DTO，如 `PostDTO`、`PlatformDTO`、`TaskDTO`。
- Feature 组件可以使用领域 DTO，但不得直接读取 Markdown 文件或浏览器扩展连接。
- 视觉 token 只定义一次；组件不得写第二套近似颜色和圆角。
- 原型和生产允许技术实现不同，但组件名称、层级和交互状态必须一致。
- 新增组件前必须先检索现有组件和同类状态；没有复用评估不得创建重复实现。

<a id="resources"></a>
## 7. 运行时与资源边界

- Layout、Primitives 和 Patterns 的渲染复杂度必须保持 `O(1)`，列表复杂度由消费它的 Screen 决定。
- 不引入额外全局 store；跨页面状态必须有明确所有权。
- `packages/ui` 必须支持按子路径导入和 tree-shaking，禁止让使用一个 Primitive 的页面加载全部业务组件。
- 新增大依赖前必须评估包体积、首屏 JS、CSS 体积和桌面安装包增量。
- UI 拆包不改变 API、Vault 扫描或任务状态机的复杂度。
