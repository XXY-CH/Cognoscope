# 学森 · 项目进度与待办

> 更新时间：2026-07-30  
> 设计权威：`UI_spec.md`（产品迭代与规范冲突见 §四 / [`HANDOFF.md`](./HANDOFF.md)）  
> 技术栈：Vite 6 + React 18 + TypeScript (strict) + Zustand + React Router Data API + IndexedDB (`idb`)  
> 行为检测：`monitor/`（Python Flask API，默认 `localhost:8765`）

---

## 一、总体进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| Step 1–5 | 初始化 / tokens / types / AppShell / 通用组件 | ✅ 完成 |
| Step 6 | 文件目录（§4） | ✅ 完成（含多选表头批量操作） |
| Step 6b | 个人仪表盘（§5 精简） | ✅ 已接 IndexedDB 真实会话（非占位常量） |
| Step 6c–6d | 阅读布局 + PDF / EPUB | ✅ 完成 |
| Step 6e | 知识图谱（§6） | ⏸ 占位（实现已清空；见 `HANDOFF.md`） |
| — | `useCamera` + 阅读页调 `monitor` 启停检测 | ✅ 完成（检测服务需本机另起） |
| Step 8 | 离线与数据层（§14） | ✅ 完成 |
| **P0** | **阅读核心（EPUB / Text Layer / 划词 / 行数 / 会话）** | ✅ 完成 |
| — | 回收站（§7） | ✅ 完成 |
| — | 阅读增强（搜索 / 全屏 / 书签 / 适应宽度） | ✅ 完成 |
| — | **设置抽屉落地**（外观 / 阅读 / 数据 / AI / 快捷键） | ✅ 完成（AI 仅存配置，未发请求） |
| — | **可自定义快捷键** + 全局/阅读热键 | ✅ 完成 |
| — | 划词高亮层 / 真实 AI 问答 | ⏳ 部分（划词工具条已通；§8.8 高亮层与真实 QA 未做） |

**主路径现状**：导入 PDF/EPUB → 打开阅读 → 翻页/缩放/划词批注与书签 → 文内搜索与全屏 → 已读行数与会话写入 IndexedDB → 仪表盘读真实会话；打开阅读时可请求 `monitor` 启停检测（服务未起则静默失败）。知识图谱仍为占位。真实 AI、批注原文高亮层、Toc 真实目录、monitor 会话合并进 IndexedDB 仍待接。

---

## 二、已完成明细

### 基础设施
- [x] Vite 6 + React 18 + TypeScript strict；Data Router + lazy（仪表盘 / 图谱 / 阅读）
- [x] IndexedDB **v4**：`files` / `fileBlobs` / `sessions` / `annotations` / `bookmarks`
- [x] `tokens.css`：浅/深主题、`data-accent` 强调色（蓝/绿/黄/粉）

### 全局与设置（2026-07-30）
- [x] Sidebar 品牌区：「学森」（已去「本地账户」）
- [x] SettingsDrawer：外观 / 阅读 / 数据管理 / AI / 快捷键（左滑入）
- [x] 外观：主题三态 + 强调色；阅读：页面模式、默认左右栏、**默认适应宽度**
- [x] 数据管理：清除会话 / 批注书签 / AI 配置
- [x] AI：API Key、Base URL、模型、回答语言、自动引用、温度、maxTokens（本机持久化）
- [x] 快捷键：可改绑；主题默认 **Ctrl/Cmd+Alt+T**（避开浏览器 Ctrl+Shift+L）；阅读页自挂 SettingsDrawer + `useAppShortcuts`
- [x] 导入按钮主色；半选复选框自定义样式（深色负号对比）

### A · 文件目录 / D · 回收站
- [x] 导入 / 搜索 / 筛选 / 多选表头批量 / 移动含回收站终点
- [x] 回收站还原 / 移动 / 彻底删除 / 清空

### B · 个人仪表盘（已接真会话）
- [x] 专注时长 / 阅读行数：当次 + 累计并排；迷你趋势条
- [x] 近 **1 年** 阅读热力图（周列自适应，无卡片内滚动）
- [x] 专注会话表：近 24h / 7 天 / 30 天 / 全部；固定列宽；分心列可换行
- [x] 指标卡图标/趋势条、热力图色阶均跟 **主题强调色** `--accent`
- [x] `sessionStore` + `dashboardMetrics`；演示种子可补热力图历史
- [x] 修复：离开阅读页时 `clearFile` 不再清零 `linesRead`（避免会话写库竞态）
- [ ] monitor JSONL → IndexedDB 完整合并（`monitorAdapter` 已有雏形，仪表盘六维仍偏前端聚合）

### E · 阅读界面
- [x] PDF / EPUB、划词工具条、书签、文内搜索、全屏、适应宽度
- [x] 已读行数 + 阅读会话；打开文件时可选调 `startDetection(fileId)`
- [ ] Toc 真实目录树；批注高亮层（§8.8）；真实 QA

### C · 知识图谱
- [x] 路由与 EmptyState 占位；实现清空（见 `HANDOFF.md`）

### monitor/（行为检测）
- [x] `ReadingMonitor` + `analyze.py` + Flask `server.py`（8765）
- [x] 前端 `monitorApi.ts`；阅读页启停；详见 [`monitor/README.md`](./monitor/README.md)

---

## 三、待办（按优先级）

### P0 · 阅读 / AI
- [ ] 批注高亮层（§8.8）；真实 AI 流式会话；整理习得
- [ ] Toc 从 PDF/EPUB 解析真实目录树

### P1 · 检测与会话质量（可加功能）
- [ ] **检测窗口是否在最上方**：浏览器/应用未前台时，不计入专注或降低权重（避免切走后仍记专注）
- [ ] **临近专注时段自动合并**：相邻会话间隔短于阈值则合并为一段，减少碎片记录
- [ ] **阅读论文小于 5s 不算专注**：过短打开即关的会话不写入有效专注时长 / 不进仪表盘有效统计

### P2 · 仪表盘 / 图谱 / monitor 打通
- [ ] 将 monitor 分析（专注分、分心事件）稳定写入 `ReadingSession` 并驱动会话表「综合」等列
- [ ] 知识图谱按 §6 从占位重做（见 `HANDOFF.md`）
- [ ] 实时推流检测状态（现为 start→stop→analyze 批处理）

### P3 · 工程与体验
- [ ] PDF 连续滚动虚拟化；`fileStore` 拆分（&lt; 300 行）
- [ ] 清理未使用依赖（如 `recharts`）或恢复图表后接回
- [ ] a11y（§11）补齐；RR `v7_startTransition` future flag

---

## 四、已知限制 / 技术债

1. 批注高亮层未画在原文上；长划词着色可能不连续。
2. EPUB 划词受 iframe 选区限制。
3. 连续滚动渲染全部 PDF 页 → 大文档易卡顿。
4. 知识图谱仅为 EmptyState；勿装伞包 `react-force-graph`。
5. monitor 会话与 IndexedDB 会话仍分离；未起 `server.py` 时检测不可用（前端不阻断阅读）。
6. 仪表盘布局已偏离 `UI_spec.md` §5 全文（以产品迭代为准）；会话表列为产品精简版，非规范六维原始字段全集。
7. AI 配置已落盘，问答请求未接。
8. 划词工具条以书签替代规范 §8.7「词典」（产品已拍板）。
9. `recharts` 仍在 `package.json` 但源码未引用。

### 已修复的黑屏根因（备忘）

| 问题 | 表现 | 修复 |
|---|---|---|
| `react-force-graph` 伞包拉 aframe | `AFRAME is not defined` | 用 `react-force-graph-2d`（重做时同样禁止伞包） |
| `BrowserRouter` + `useMatches` | `#root` 被卸空 | 迁 Data Router |
| `selectVisibleFiles` 每次新数组 | `Maximum update depth exceeded` | `useShallow` |

---

## 五、建议的下一步

1. **P1 三条会话规则**（前台检测 / 临近合并 / &lt;5s 不计）— 直接影响仪表盘可信度。  
2. **monitor → IndexedDB** — 分心与专注分进入会话表。  
3. **批注高亮层 + Toc 大纲** — 阅读体验闭环。  
4. **真实 AI** — 用已存 Base URL / Key / 模型发流式请求。  
5. **知识图谱重做** — 按 `HANDOFF.md`。

---

## 六、改进建议

### 性能
- PDF 连续滚动视口 ±N 页；`fileStore` 拆分。

### 离线与可靠性
- IndexedDB 升级失败可恢复提示；硬删级联 `sessions` / `bookmarks`。
- monitor 不可达时阅读页可给一次弱提示（可选）。

### 产品与规范
- 同步 `UI_spec.md`：设置 Tab、强调色、快捷键默认、仪表盘精简列、侧栏品牌名。

### 验证清单
- 导入 PDF → 阅读 / 搜索 / 书签 / 全屏 → 关阅读 → `/dashboard` 当次行数与时长更新。
- 设置改强调色 → 指标卡与热力图变色；改快捷键 → 阅读页生效。
- `python monitor/server.py` + 打开论文 → `/api/detect/status` 为 running。
- 多选半选表头深色主题负号清晰；导入按钮为强调色实心。

---

## 七、变更记录

| 日期 | 说明 |
|---|---|
| 2026-07-29 | 初稿至回收站 / 阅读增强 / 图谱清空 / 仪表盘占位 / `HANDOFF.md` |
| 2026-07-30 | 仪表盘接真实 `sessionStore`；热力图近 1 年；当次+累计；linesRead 写库竞态修复 |
| 2026-07-30 | 设置抽屉五 Tab；强调色；AI/阅读/数据管理；可自定义快捷键（主题 Alt+T） |
| 2026-07-30 | 侧栏品牌「学森」；仪表盘主题色；会话表列宽；半选复选框 / 导入主色 |
| 2026-07-30 | 刷新 PROGRESS；补充可加功能：窗口置顶检测、临近会话合并、&lt;5s 不计专注 |
| 2026-07-30 | 同步刷新 [`monitor/README.md`](./monitor/README.md)（Flask API 与前端对接） |
