# Data Model & Layout

> Source: Deep Interview, 2026-07-30

## Key Points
- 近义合并后的显示名：**原文关键词写法优先**
- 词间建边时旧词候选：**全量**喂给 AI（当前论文规模可接受）
- 桌面布局：**左 = 论文关系图 | 右 = 关键词图谱**

## Details
### 显示名（10A）
- 近义簇内若含「来自 PDF 原文 Keywords」的写法 → 用该写法做 canonical label
- 若簇内仅有 AI 生成词 → 用 AI 给出的代表词
- 实现时可在词节点上存 `label` + `aliases[]` + `sources: { paperNodeId, origin: 'pdf'|'ai' }[]`

### 候选集（11A）
- v1 不做 Top-N / 向量召回；将全局已有关键词节点全量传入 prompt
- 若后续词量暴涨，再改为召回（记入 open questions）

### 布局（12A）
- 宽屏：左右分栏，可拖拽分隔条（复用现有 panel resize 习惯更佳）
- 窄屏：建议上下堆叠降级（实现时可先左右，窄屏 CSS 换列）

## Open Questions
- 窄屏断点具体值
- aliases 是否在 UI 展示
