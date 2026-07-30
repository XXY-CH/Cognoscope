# 学森 · 项目进度与待办

> 更新时间：2026-07-29（晚 · 仪表盘/图谱占位交接后）  
> 设计权威：`UI_spec.md`（产品迭代与规范冲突见 §四 / [`HANDOFF.md`](./HANDOFF.md)）  
> 技术栈：Vite 6 + React 18 + TypeScript (strict) + Zustand + React Router Data API + IndexedDB (`idb`)

---

## 一、总体进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| Step 1 | 项目初始化（Vite / 依赖 / 目录结构） | ✅ 完成 |
| Step 2 | 设计令牌 `tokens.css` | ✅ 完成 |
| Step 3 | 类型定义 `src/types`（§9） | ✅ 完成 |
| Step 4 | 全局布局 AppShell（§2） | ✅ 完成 |
| Step 5 | 通用组件库（§3） | ✅ 完成 |
| Step 6 | 文件目录页面（§4） | ✅ 完成（含多选表头批量操作） |
| Step 6b | 个人仪表盘（§5） | ⏸ 精简占位（假数据；见 `HANDOFF.md`） |
| Step 6c | 阅读界面布局框架（§8） | ✅ 完成 |
| Step 6d | PDF 渲染（§8 ReaderCanvas） | ✅ 完成 |
| Step 6e | 知识图谱（§6） | ⏸ 占位（实现已清空；见 `HANDOFF.md`） |
| — | `useCamera`（阅读器底栏 / 顶栏） | ✅ 完成（仪表盘页已卸状态条） |
| Step 8 | 离线与数据层（§14） | ✅ 完成 |
| — | 黑屏修复（Data Router + 图谱勿用伞包） | ✅ 完成 |
| **P0** | **阅读核心（EPUB / Text Layer / 划词 / 行数 / 会话）** | ✅ 完成 |
| — | 回收站（§7） | ✅ 完成 |
| — | 阅读增强（搜索 / 全屏 / 书签 / 适应宽度） | ✅ 完成 |
| — | 划词高亮层 / 真实 AI 问答 | ⏳ 部分（划词工具条已通；§8.8 高亮层与真实 QA 未做） |

**主路径现状**：导入 PDF/EPUB → 打开阅读 → 翻页/缩放/划词批注与书签 → 文内搜索与全屏 → 已读行数与会话写入 IndexedDB；软删除进入回收站可还原 / 移动 / 彻底删除。仪表盘与知识图谱当前为占位 UI（不读真实会话图数据）。真实 AI、批注原文高亮层、Toc 真实目录仍待接。

---

## 二、已完成明细

### 基础设施
- [x] Vite 6 + React 18 + TypeScript strict
- [x] 依赖：zustand、react-router-dom、idb、pdfjs-dist、epubjs、lucide-react；`recharts` / `react-force-graph-2d` 均未在当前页面使用（后者已卸；重做图谱再装 **2d** 包）
- [x] 目录：`features/`、`hooks/`、`stores/`、`db/`、`styles/`、`types/`、`components/`
- [x] `src/styles/tokens.css`：浅/深主题、间距、动效、z-index、图表色、布局尺寸
- [x] IndexedDB **v4**：`files` / `fileBlobs` / `sessions` / `annotations` / **`bookmarks`**
- [x] **路由**：`createBrowserRouter` + `RouterProvider`（Data Router）；`useMatches` / `handle` 可用
- [x] **拆包**：仪表盘 / 知识图谱 / 阅读页 `React.lazy`

### 全局与通用
- [x] AppShell：Sidebar（240/64）、PageHeader、SettingsDrawer 骨架、OfflineBanner
- [x] 主题三态：`system | light | dark`，localStorage + `matchMedia`
- [x] 通用组件：Button、IconButton、Input、SearchInput、Select、Table、Dialog、Toast、Skeleton、ProgressRing、Badge、Tooltip、EmptyState、Tag
- [x] Dialog focus trap；Toast 全局挂载；Tooltip portal（避免表头遮挡）
- [x] `uiStore.isOnline` + `useNetworkStatus`；Sidebar 离线胶囊（§14.1）

### A · 文件目录（§4）
- [x] 搜索 / 类型筛选 / 刷新 / 新建文件夹 / 导入（搜索框为类型筛选约 2 倍宽）
- [x] 文件表格：排序、多选、行 hover 操作（重命名 / 新建副本 / 移动 / 删除）
- [x] **多选表头**：文件名 →「已选 n 项」；时间列区 → 取消 / 移动到 / 删除（无独立批量条）
- [x] 取消多选后需重新移入行才显示操作按钮（避免 :hover 粘滞）
- [x] 移动 Dialog：根目录 → 缩进文件夹树 → 回收站（置底，可作为移入终点 = 软删除）
- [x] `fileStore` + IndexedDB；软删除可撤销；`selectVisibleFiles` + `useShallow`
- [x] 单击文件进入 `/read/:fileId`

### D · 回收站（§7）
- [x] 列表列：文件名 / 原始路径 / 更新时间 / 最后阅读 / 大小（左对齐）
- [x] 悬停：原路径始终可见；还原 / 移动到（新路径） / 彻底删除
- [x] 多选表头：取消 / 恢复 / 移动到 / 彻底删除
- [x] 清空回收站、30 天自动清理提示；顶栏仅标题「回收站」（无「文件目录 /」）
- [x] 与文件目录共用 `MoveDialog`

### B · 个人仪表盘（§5 · 产品精简版）
- [x] 布局：专注时长 / 阅读行数（两卡）→ 近 30 天热力图 → 按时间升序的专注会话六维表
- [x] 六维列：注视中心占比、分心事件密度、头部姿态方差、眼睑闭合百分比、眨眼频率、综合评分
- [x] 数据：`src/utils/dashboardPlaceholders.ts` **固定占位**（页面不读 `sessionStore`）
- [x] 组件：`MetricCards` / `ReadingHeatmap` / `FocusSessionList`（见 `HANDOFF.md` 第一部分）
- [ ] 已移除：摄像头状态条、分心/疲劳卡、折线图、分心时间轴、顶栏会话选择器/导出
- [ ] 接真实检测数据；六维字段尚未写入 `types` / `UI_spec §9`

### 摄像头（useCamera）
- [x] 暴露 `status` / `deviceId` / `previewVisible` + 启停；MediaStream 单例
- [x] 阅读底栏芯片、阅读顶栏状态点（仪表盘页不再挂状态条）
- [x] 首次开启 toast 隐私说明（§13 决策7）

### E · 阅读界面（§8）
- [x] 独立全屏路由；OfflineBanner；面板折叠/拖宽（拖拽时关过渡，右缘贴窗）
- [x] **PDF**：Vite `?url` 本地 worker、Text Layer、单/双页/滚动、←→↑↓ / PgUp·Dn 翻页、缩放
- [x] **EPUB**：epub.js 主题变量 / 分页·滚动 / 字号行距（zoomPercent）
- [x] **划词工具条**：高亮 / 批注 / 提问 / 复制 / **书签（选色）** / 搜索本文（产品侧已去掉词典）
- [x] **文内搜索**：顶栏框内上一个 / 下一个；划词「搜索本文」灌入并查找
- [x] **适应宽度**：再点还原进入前缩放；手动改缩放退出切换态
- [x] **全屏**：Fullscreen API（`navigationUI: 'hide'`）；Esc 退出；进入约 1.2× 放大
- [x] **书签**：IndexedDB + TocPanel Tab；可重命名 / 换色；页缘丝带 + 划词原文着色
- [x] SidePanel：QA / 批注分隔真正分配剩余高度；输入框默认一行高
- [x] **已读行数**（§8.5）+ **阅读会话** 写入 IndexedDB（`sessionStore` / `sessions`）
- [x] **批注** CRUD + 划词引用；**QA** 离线禁用、引用块可移除（真实会话未接）
- [ ] Toc 真实目录树；批注高亮层（§8.8）

### C · 知识图谱（§6 · 占位）
- [x] 路由 `/knowledge-graph`、侧栏入口、页面 EmptyState **占位**
- [x] 类型保留：`GraphNode` / `GraphEdge`（`src/types`）
- [x] 实现已清空：Canvas / Toolbar / Detail / Banner / `graphStore` / seed；依赖 `react-force-graph-2d` 已卸
- [ ] 按 `UI_spec.md §6` 重做；交接见根目录 **`HANDOFF.md`** 第二部分

### 离线与数据层（§14 / Step 8）
- [x] files / sessions / annotations / bookmarks CRUD；硬删级联批注
- [x] 网络监听 + 顶部离线条 + Sidebar 胶囊 + QA 离线降级

### 文档
- [x] [`HANDOFF.md`](./HANDOFF.md) — 仪表盘 + 知识图谱：文件位置、数据接口、接入顺序

---

## 三、待办（按优先级）

### P0 · 阅读核心
- [x] epub.js / PDF Text Layer / 划词 / 已读行数 / 会话

### P1 · 阅读交互深化
- [ ] 批注高亮层（§8.8）；真实 AI 会话；整理习得
- [ ] Toc 从 PDF/EPUB 解析真实目录树（现空态「无目录」）
- [x] 回收站（§7）
- [x] 书签 / 文内搜索 / 全屏 / 适应宽度切换

### P2 · 仪表盘 / 图谱 / 设置
- [ ] 仪表盘接真实检测数据（替换 `dashboardPlaceholders`；六维入 `types`）；是否回补 §5 其余块与产品对齐
- [ ] 知识图谱按 §6 从占位重做（见 `HANDOFF.md`）
- [ ] Settings 表单项落地；摄像头权限 Dialog

### P3 · 工程与体验
- [x] ~~路由 lazy~~
- [ ] PDF 连续滚动虚拟化；`fileStore` 拆分（&lt; 300 行）
- [ ] 清理未使用依赖（如 `recharts`）或仪表盘恢复图表后接回
- [ ] a11y（§11）、快捷键（§10）；RR `v7_startTransition` future flag

---

## 四、已知限制 / 技术债

1. 批注高亮层（§8.8）未画在原文上；高亮/书签着色依赖 Text Layer span 匹配，长划词可能不连续。
2. EPUB 划词受 iframe 选区限制，工具条对 PDF Text Layer 最可靠。
3. 连续滚动渲染全部 PDF 页 → 大文档易卡顿（P3 虚拟化）。
4. 知识图谱仅为 EmptyState；重做见 `HANDOFF.md`；勿装伞包 `react-force-graph`。
5. 仪表盘 UI 为占位假数据，与 IndexedDB 真实 `sessions` **未打通**；六维指标尚无规范类型。
6. 仪表盘结构已偏离 `UI_spec.md` §5 全文（以产品迭代 + `HANDOFF.md` 为准）。
7. Settings 仍为占位；真实 AI / 整理习得未接。
8. 划词工具条以书签替代规范 §8.7「词典」（产品已拍板）。
9. 回收站表头含「更新时间 / 最后阅读」，与规范 §7「删除时间」列表述不完全一致（以产品迭代为准）。
10. 便携 Node 需自行加入 PATH；`recharts` 仍在 `package.json` 但源码未引用。

### 已修复的黑屏根因（备忘）

| 问题 | 表现 | 修复 |
|---|---|---|
| `react-force-graph` 伞包拉 aframe | `AFRAME is not defined` | 用 `react-force-graph-2d`（重做图谱时同样禁止伞包） |
| `BrowserRouter` + `useMatches` | `#root` 被卸空，深色底全黑 | 迁 Data Router（方案 A） |
| `selectVisibleFiles` 每次新数组 | `Maximum update depth exceeded` | `useShallow(selectVisibleFiles)` |

---

## 五、建议的下一步

1. **批注高亮层（§8.8）** — 与现有书签/划词着色统一几何层。  
2. **Toc 真实大纲** — PDF outline / EPUB toc。  
3. **真实 AI 问答** — 接流式会话与整理习得。  
4. **仪表盘 / 图谱接真** — 按 `HANDOFF.md` 替换占位、重建图谱画布。  
5. **PDF 连续滚动虚拟化** — 大文档性能。

---

## 六、改进建议

### 性能
- PDF 连续滚动改为视口 ±N 页按需渲染。
- `fileStore` 按 list / import / selection 拆分，单文件 &lt; 300 行。

### 离线与可靠性
- IndexedDB 升级失败给出可恢复提示；硬删时级联清理该文件 `sessions` / `bookmarks`。

### 产品与规范
- 同步更新 `UI_spec.md`：划词书签替代词典、回收站列与多选表头、移动 Dialog 含回收站终点、**仪表盘精简布局与六维指标**。
- 摄像头权限正式 Dialog；离线条与 Sidebar 胶囊是否并存可再收敛。

### a11y / 健壮性
- 全站 focus / landmark 走查；批注写库 debounce；多选表头窄屏可改为图标+tooltip。

### 验证清单
- 导入 PDF → 阅读翻页 / 搜索 / 书签 / 全屏 Esc → 批注 → Offline 看横幅与 QA 禁用。
- 多选移动到回收站 → 回收站恢复 / 移动到新路径 / 彻底删除。
- `/dashboard`：两指标卡 + 热力图 + 五条占位会话；`/knowledge-graph`：EmptyState 指向 `HANDOFF.md`。
- IndexedDB：Application → `xuesen`（**v4**，含 `bookmarks`）。

---

## 七、变更记录

| 日期 | 说明 |
|---|---|
| 2026-07-29 | 初稿：汇总 Step 1–6c |
| 2026-07-29 | Step 6d：PDF.js；Step 6e：知识图谱；useCamera；Step 8 离线数据层 |
| 2026-07-29 | 整理 PROGRESS / 改进建议 |
| 2026-07-29 | 黑屏：force-graph-2d + lazy；Data Router + useShallow |
| 2026-07-29 | 同步更新 PROGRESS 与 README（路由/黑屏备忘/启动说明） |
| 2026-07-29 | **回收站 §7**；阅读增强（搜索/全屏/书签/适应宽度）；文件目录多选表头与移动树；IndexedDB v4 `bookmarks` |
| 2026-07-29 | 知识图谱清空实现（保留路由/类型）；仪表盘精简为两卡+热力图+六维会话表（占位） |
| 2026-07-29 | 根目录 `HANDOFF.md` 交接（仪表盘+图谱）；同步刷新 PROGRESS / README |
