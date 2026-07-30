# Interview: 关键词图谱（Keyword Graph）
**Date:** 2026-07-30  
**Status:** Complete（规格已收敛，转入实现）  
**Depth:** medium  
**Output:** `docs/interviews/keyword-graph-2026-07-30/`

## Seed Request
1. 与原图谱并列的关键词图谱  
2. 摘要生成关键词并与原文词合并  
3. 建立关键词之间的联系  

## Themes Discovered
- 并列 UI（左论文 | 右关键词）
- 关键词生成与合并（≤10、近义、入图时、原文 label 优先）
- 词间建边（仅 AI、新词↔旧词全量旧词）
- 双向联动 + 数据模型/布局

## Files Created
| File | Topic |
|---|---|
| `_interview-index.md` | 索引 |
| `overview.md` | 角色/目标/并列形态 |
| `keyword-generation-merge.md` | 生成与合并 |
| `keyword-edges-linking.md` | 词边与跨图联动 |
| `data-model-layout.md` | 显示名/候选/布局 |
| `_summary.md` | 实现规格摘要 |
| `_open-questions.md` | 遗留问题 |
