# AI 功能链路确认清单

## ✅ 统一 AI 链路基础设施

### 后端
- ✅ `AIClient` - OpenAI 兼容接口客户端
- ✅ `get_ai_client()` - 动态依赖注入（支持配置热更新）
- ✅ AI 配置 API (`/api/v1/preferences/ai-config`)
  - GET - 获取当前配置
  - PUT - 更新配置并动态生效

### 前端
- ✅ `aiApi.ts` - AI 服务接口
- ✅ `aiConfigApi.ts` - AI 配置管理接口
- ✅ 设置面板 AI 配置（BaseURL、API Key、Model）
- ✅ 配置自动同步到后端

---

## ✅ AI 功能实现状态

### 1. AI 问答（QAPanel）✅
**位置**: 阅读器右侧栏 > QAPanel
**后端**: `POST /api/v1/ai/chat`
**前端**: `chatCompletion()`
**功能**:
- 多轮对话
- 划词引用支持
- 上下文保持
- 实时状态反馈

**AI 链路**: ✅ 使用统一 `AIClient`

---

### 2. AI 概要（文档总结）✅
**位置**: 待添加 UI 入口
**后端**: `POST /api/v1/documents/{id}/summarize`
**前端**: `summarizeDocument()`
**功能**:
- 提取文档标题
- 生成 200 字摘要
- 识别关键词
- 提取主题

**AI 链路**: ✅ 使用 `AIGraphService` → `AIClient`

---

### 3. AI 提取（内容节点）✅
**位置**: 阅读器右侧栏 > "整理习得"按钮
**后端**: `POST /api/v1/documents/{id}/content-graph`
**前端**: `generateContentGraph()`
**功能**:
- 提取核心概念、实体、主题
- 识别节点关系（相关、包含、前置、导致）
- 可配置节点数量（5-50）
- 返回结构化图谱数据

**AI 链路**: ✅ 使用 `AIGraphService.extract_content_nodes()` → `AIClient`

---

### 4. AI 标签 ⚠️
**状态**: 后端已实现，前端未接入
**后端**: 可通过 `summarize_document()` 返回的 `keywords` 获取
**建议**: 在文件列表或文档详情中显示 AI 生成的标签

**AI 链路**: ✅ 使用 `AIGraphService` → `AIClient`

---

### 5. 批注分析 ⚠️
**状态**: UI 已存在（AnnotationPanel），AI 分析未实现
**需求**: 分析用户批注，提取关键见解
**建议实现**:
- 后端: 新增 `POST /api/v1/documents/{id}/analyze-annotations`
- 前端: 在 AnnotationPanel 添加"AI 分析"按钮

**AI 链路**: 🔧 需要新增接口，可复用 `AIClient`

---

### 6. 整理习得（内容提取）✅
**位置**: 阅读器右侧栏 > "整理习得"按钮
**后端**: `POST /api/v1/documents/{id}/content-graph`
**前端**: `generateContentGraph()` in `SidePanel`
**功能**:
- 从文档提取知识节点
- 生成概念图谱
- 显示提取结果统计

**AI 链路**: ✅ 使用 `AIGraphService.extract_content_nodes()` → `AIClient`

**TODO**: 从 PDF.js textLayer 提取文本内容

---

## 📊 知识图谱 AI 功能

### 7. AI 建边（知识图谱）✅
**位置**: 知识图谱页面 > "AI 建边"按钮
**后端**: `POST /api/v1/graph/build?use_ai=true`
**前端**: `triggerGraphBuild(true)`
**功能**:
- 分析文档间关联
- 自动生成边
- 评估关联强度

**AI 链路**: ✅ 使用 `GraphService.build_graph_with_ai()` → `AIClient`

---

## 🔧 待完善功能

### 需要添加的功能:

1. **AI 标签展示**
   - 在文件卡片显示自动标签
   - 支持点击标签过滤

2. **批注 AI 分析**
   - 新增后端接口
   - AnnotationPanel 添加分析按钮

3. **PDF 文本提取**
   - 从 PDF.js textLayer 提取完整文本
   - 传递给"整理习得"功能

4. **AI 概要 UI**
   - 在文档查看器添加"生成摘要"按钮
   - 显示摘要结果

---

## ✅ 总结

**已完成的 AI 链路**: 6/7
- ✅ AI 问答
- ✅ AI 概要（后端）
- ✅ AI 提取
- ✅ 整理习得
- ✅ AI 建边
- ⚠️ AI 标签（后端已支持）
- ⚠️ 批注分析（需新增）

**统一 AI 配置**: ✅ 完成
- 前端设置面板 → 后端动态生效
- 所有功能共享同一 AI 客户端
- 支持任何 OpenAI 兼容接口