/**
 * 类型定义入口
 * 严格对齐 UI_spec.md §9 数据模型；仅描述 UI 渲染所需字段
 * 不含后端持久化细节
 */

/** 文档 / 节点类型：PDF、EPUB、Markdown、纯文本，以及目录节点 */
export type FileType = 'pdf' | 'epub' | 'md' | 'txt' | 'folder';

/**
 * FileNode - 文件目录树节点（含回收站软删除态）
 * 所属：A · 文件目录 / D · 回收站
 * 规范参考：UI_spec.md §9
 */
export interface FileNode {
  /** 唯一标识 */
  id: string;
  /** 显示名称（文件名或文件夹名） */
  name: string;
  /** 节点类型；`folder` 时 `sizeBytes` 固定为 0 */
  type: FileType;
  /** 父节点 id；根级为 `null` */
  parentId: string | null;
  /** 文件大小（字节）；文件夹恒为 0 */
  sizeBytes: number;
  /** 最后更新时间，ISO 8601 */
  updatedAt: string;
  /** 最近一次阅读时间，ISO 8601；从未读过为 `null` */
  lastReadAt: string | null;
  /** 软删除时间，ISO 8601；非 `null` 表示位于回收站 */
  deletedAt: string | null;
  /** 删除前的路径展示文案；主要用于回收站列表 */
  originalPath?: string;
}

/**
 * MetricSample - 时序指标采样点（专注度 / 疲劳度共用）
 * 所属：B · 个人仪表盘 / 阅读会话统计
 * 规范参考：UI_spec.md §9
 */
export interface MetricSample {
  /** 相对会话起点的秒数（非绝对时间戳） */
  atSec: number;
  /** 指标值，约束范围 0–100 */
  value: number;
}

/**
 * DistractionKind - 分心事件类型语义 key
 * 配色对应设计令牌 `--event-*`（UI_spec.md §1.1）
 */
export type DistractionKind =
  | 'drink' // 喝水
  | 'talk' // 聊天
  | 'away' // 离开座位
  | 'phone' // 看手机
  | 'yawn' // 打哈欠
  | 'gaze_off'; // 走神（视线离屏）

/**
 * DistractionEvent - 单次分心事件
 * 所属：B · 个人仪表盘 / 阅读会话
 * 规范参考：UI_spec.md §9
 */
export interface DistractionEvent {
  /** 唯一标识 */
  id: string;
  /** 事件类型；用户手动修改类型后直接写入此字段 */
  kind: DistractionKind;
  /** 相对会话起点的发生时刻（秒） */
  atSec: number;
  /** 事件持续时长（秒） */
  durationSec: number;
  /** 检测置信度，约束范围 0–1；低置信度可在 UI 上以虚线边框区分 */
  confidence: number;
  /** 用户标记为误判；为 `true` 时 UI 置灰且不计入合计 */
  dismissed: boolean;
  /** 类型是否被用户手动修正过；为 `true` 时徽章右下角显示铅笔角标 */
  kindEditedByUser: boolean;
}

/**
 * ReadingSession - 一次阅读会话及其检测数据
 * 所属：B · 个人仪表盘 / E · 阅读界面（已读行数等）
 * 规范参考：UI_spec.md §9
 */
export interface ReadingSession {
  /** 唯一标识 */
  id: string;
  /** 关联的文件 id（对应 FileNode.id） */
  fileId: string;
  /** 会话开始时间，ISO 8601 */
  startedAt: string;
  /** 会话结束时间，ISO 8601；进行中为 `null` */
  endedAt: string | null;
  /** 会话时长（秒） */
  durationSec: number;
  /** 已阅读行数（唯一计量单位，非物理距离/页数） */
  linesRead: number;
  /** 专注度时序采样 */
  focusSamples: MetricSample[];
  /** 疲劳度时序采样 */
  fatigueSamples: MetricSample[];
  /** 本会话内的分心事件列表 */
  distractions: DistractionEvent[];
}

/**
 * SessionFocusAnalysis - 单次检测会话的专注分析报告
 * 所属：B · 个人仪表盘（专注会话表）
 * 算法对齐：monitor/analyze.py（Gaze / Pose / Distraction / Engagement / Focus Score）
 */
export interface SessionFocusAnalysis {
  /** 对应 monitor JSONL 会话 id，如 session_20260730_120701 */
  sessionId: string;
  /** 会话开始时间，ISO 8601；缺失时为 null */
  startedAt: string | null;
  /** 会话结束时间，ISO 8601；缺失时为 null */
  endedAt: string | null;
  /** 时长（秒） */
  durationSec: number;
  /** 帧数 */
  frames: number;
  /** 注视中心占比 0–1（Rayner 1998） */
  gazeRatio: number;
  /** 分心事件密度（次/分钟） */
  eventsPerMin: number;
  /** 分心帧占比 0–1 */
  distractRatio: number;
  /** 头部 yaw 标准差（度）；无姿态数据时为 null */
  yawStd: number | null;
  /** 头部 pitch 标准差（度）；无姿态数据时为 null */
  pitchStd: number | null;
  /** 主导投入状态：engaged / boredom / confusion / frustration */
  engDominant: string | null;
  /** 综合专注分 0–100；无人脸时为 null */
  focusScore: number | null;
  /** 分心标签 → 片段次数（如 { playing_phone: 3, chatting: 1 }） */
  events: Record<string, number>;
}

/** 批注高亮颜色；与阅读器划词色板对应 */
export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink';

/**
 * Bookmark - 阅读书签（页码级，可带划词原文）
 * 所属：E · 阅读界面 > TocPanel 书签 Tab
 * 规范参考：UI_spec.md §8.4
 */
export interface Bookmark {
  /** 唯一标识 */
  id: string;
  /** 所属文件 id */
  fileId: string;
  /** PDF 页码 / EPUB location 近似页 */
  page: number;
  /** 展示文案 */
  label: string;
  /** 正文标记颜色（与批注高亮同色板） */
  color: AnnotationColor;
  /** 划词创建时的原文；页级书签为 null */
  quotedText: string | null;
  /** 创建时间，ISO 8601 */
  createdAt: string;
}

/**
 * PdfOutlineItem - 文本字体大小推断的 PDF 大纲条目
 * 所属：E · 阅读界面 > TocPanel
 */
export interface PdfOutlineItem {
  /** 标题文本 */
  title: string;
  /** 所在页码（1-based） */
  page: number;
  /** 层级 0=顶级标题，1=二级，… */
  level: number;
}

/**
 * Annotation - 划词批注
 * 所属：E · 阅读界面 > SidePanel > AnnotationPanel
 * 规范参考：UI_spec.md §9 / §8.6
 */
export interface Annotation {
  /** 唯一标识 */
  id: string;
  /** 所属文件 id */
  fileId: string;
  /** PDF 为页码；EPUB 为 spine index */
  page: number;
  /** 定位锚点：EPUB 用 CFI，PDF 为页内坐标序列化字符串 */
  anchor: string;
  /** 引用的原文；无划词引用时为 `null` */
  quotedText: string | null;
  /** 批注正文，Markdown 格式 */
  body: string;
  /** 高亮颜色 */
  color: AnnotationColor;
  /** 创建时间，ISO 8601 */
  createdAt: string;
  /** 最后更新时间，ISO 8601 */
  updatedAt: string;
}

/** 证据来源定位；不同阅读器坐标系不可静默互换。 */
export type EvidenceLocator =
  | {
      kind: 'pdf-page';
      page: number;
      anchor: string | null;
    }
  | {
      kind: 'epub-cfi';
      cfi: string | null;
      location: number | null;
      sectionIndex: number | null;
    }
  | {
      kind: 'unresolved';
      reason: string;
    };

/** 证据是否已经经过用户确认。 */
export type EvidenceVerificationState =
  | 'proposed'
  | 'edited'
  | 'verified'
  | 'disputed'
  | 'unresolved';

/** 证据内容的来源，保留 AI 建议与用户批注的边界。 */
export type EvidenceProvenance = 'ai' | 'annotation' | 'user' | 'mixed';

/** AI 证据摘录与本地材料的确定性匹配结果。 */
export type EvidenceMatchMethod =
  | 'annotation-exact'
  | 'transcript-exact'
  | 'none';

/** 结论行中的一条可追溯证据。 */
export interface EvidenceItem {
  id: string;
  rowId: string;
  fileId: string;
  annotationId: string | null;
  /** 创建矩阵时的用户批注正文快照；原始批注记录仍独立保存。 */
  annotationBody: string | null;
  quotedText: string;
  note: string;
  locator: EvidenceLocator;
  provenance: EvidenceProvenance;
  originalProposal: string | null;
  match: EvidenceMatchMethod;
  verification: EvidenceVerificationState;
}

/** 跨论文比较中的一条结论。 */
export interface EvidenceRow {
  id: string;
  matrixId: string;
  conclusion: string;
  originalProposal: string | null;
  evidence: EvidenceItem[];
  verification: EvidenceVerificationState;
  createdAt: string;
  updatedAt: string;
}

/** 已保存的跨论文比较。 */
export interface EvidenceMatrix {
  id: string;
  comparisonQuestion: string;
  fileIds: string[];
  extractionState: 'idle' | 'extracting' | 'ready' | 'error' | 'cancelled';
  extractionError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 证据矩阵二次分析的固定栏目。 */
export type EvidenceAnalysisSection = 'findings' | 'limitations' | 'gaps';

/** 由已确认矩阵行支撑的研究判断草稿。 */
export interface EvidenceAnalysisItem {
  id: string;
  analysisId: string;
  section: EvidenceAnalysisSection;
  statement: string;
  rationale: string;
  /** 只允许引用当前矩阵中的 EvidenceRow.id。 */
  rowIds: string[];
  originalProposal: string | null;
  verification: EvidenceVerificationState;
  createdAt: string;
  updatedAt: string;
}

/** 一次“结论/局限/空白”分析及其提议状态。 */
export interface EvidenceAnalysis {
  id: string;
  matrixId: string;
  comparisonQuestion: string;
  extractionState: 'idle' | 'extracting' | 'ready' | 'error' | 'cancelled';
  extractionError: string | null;
  items: EvidenceAnalysisItem[];
  createdAt: string;
  updatedAt: string;
}

/** 研究信号的作者边界；系统推断不能覆盖用户主动记录的立场。 */
export type ResearchSignalKind =
  | 'authored-stance'
  | 'inferred-interest'
  | 'inferred-blind-spot';

/** 研究信号/线索的可逆状态。 */
export type ResearchRecordStatus =
  | 'proposed'
  | 'accepted'
  | 'dismissed'
  | 'stale';

/** 研究产物回读所需的来源引用，不复制原文作为新的事实源。 */
export interface ResearchSourceReference {
  fileId: string;
  sessionId: string | null;
  annotationIds: string[];
  rowIds: string[];
  locator: EvidenceLocator | null;
}

/** 个人研究图谱中的用户立场或系统观察。 */
export interface ResearchSignal {
  id: string;
  kind: ResearchSignalKind;
  statement: string;
  /** 对系统推断保留观察依据；用户立场可为空。 */
  observation: string | null;
  status: ResearchRecordStatus;
  sourceRefs: ResearchSourceReference[];
  createdAt: string;
  updatedAt: string;
}

/** 需要用户判断的研究线索类型。 */
export type ResearchLeadKind =
  | 'bias-conflict'
  | 'contradiction'
  | 'counterexample'
  | 'method-divergence'
  | 'dataset-overlap'
  | 'source-stale'
  | 'evidence-gap';

/** 偏向冲突、反例和失效来源等待审阅线索。 */
export interface ResearchLead {
  id: string;
  kind: ResearchLeadKind;
  title: string;
  explanation: string;
  status: ResearchRecordStatus;
  sessionId: string | null;
  fileIds: string[];
  signalIds: string[];
  rowIds: string[];
  sourceRefs: ResearchSourceReference[];
  /** 人类可读的门槛失败原因；不使用裸概率替代解释。 */
  reasons: string[];
  createdAt: string;
  updatedAt: string;
}

/** 会话结束后的 AI 整理结果；Markdown 是展示/导出视图，不是 citation-ready 事实。 */
export type ResearchDigestStatus = 'waiting' | 'generating' | 'ready' | 'error';

export interface ResearchDigest {
  id: string;
  sessionId: string;
  fileId: string;
  markdown: string;
  usedTranscript: boolean;
  status: ResearchDigestStatus;
  errorMessage: string | null;
  candidateCount: number;
  directSaveCount: number;
  reviewCount: number;
  directSaveReasons: string[];
  reviewReasons: string[];
  createdAt: string;
  updatedAt: string;
}

/** AI 问答消息角色 */
export type QaRole = 'user' | 'assistant';

/** AI 问答消息状态：排队 / 流式输出中 / 完成 / 失败 */
export type QaMessageStatus = 'pending' | 'streaming' | 'done' | 'error';

/**
 * QaMessage - AI 问答单条消息
 * 所属：E · 阅读界面 > SidePanel > QAPanel
 * 规范参考：UI_spec.md §9 / §8.6
 */
export interface QaMessage {
  /** 唯一标识 */
  id: string;
  /** 所属文件 id（会话按文件维度关联） */
  fileId: string;
  /** 消息角色：用户或助手 */
  role: QaRole;
  /** 消息正文内容 */
  content: string;
  /** 提问时附带的原文引用；无引用为 `null` */
  quotedText: string | null;
  /** 引用所在页码 / spine index；无引用为 `null` */
  quotedPage: number | null;
  /** 创建时间，ISO 8601 */
  createdAt: string;
  /** 消息生命周期状态 */
  status: QaMessageStatus;
}

/** 知识图谱节点种类：文件、文件夹、标签 */
export type GraphNodeKind = 'file' | 'folder' | 'tag';

/** 图谱边的证据来源；旧版记录没有该字段时按 unknown 展示 */
export type GraphEdgeOrigin =
  | 'ai'
  | 'cooccurrence'
  | 'mixed'
  | 'manual'
  | 'unknown';

/**
 * GraphNode - 知识图谱节点
 * 所属：C · 知识图谱
 * 规范参考：UI_spec.md §9 / §13 决策4（前端只读边，坐标可持久化）
 */
export interface GraphNode {
  /** 唯一标识 */
  id: string;
  /** 关联文件 id；标签节点为 `null` */
  fileId: string | null;
  /** 节点展示文案（文件名或标签名） */
  label: string;
  /** 节点种类 */
  kind: GraphNodeKind;
  /** 文件类型；仅 `kind === 'file'` 时有意义 */
  fileType?: FileType;
  /** 手动拖拽后的持久化 X 坐标；未拖拽过为 `null`（由力导向布局计算） */
  x: number | null;
  /** 手动拖拽后的持久化 Y 坐标；未拖拽过为 `null` */
  y: number | null;
}

/**
 * GraphEdge - 论文知识图谱连线（由算法/AI 计算后写入，前端只读展示）
 * 所属：C · 知识图谱
 * 规范参考：UI_spec.md §9 / §13 决策4
 */
export interface GraphEdge {
  /** 起点节点 id（对应 GraphNode.id） */
  source: string;
  /** 终点节点 id（对应 GraphNode.id） */
  target: string;
  /** 关联强度，约束范围 0–1；映射连线粗细与不透明度 */
  weight: number;
  /** 关系来源；可用于解释边的生成依据 */
  origin?: GraphEdgeOrigin;
  /** AI 或人工确认时的简短理由 */
  reason?: string;
}

/**
 * GraphMemberStatus - 文件入图谱状态（目录显式标签）
 * 所属：A · 文件目录 / C · 知识图谱
 */
export type GraphMemberStatus = 'in' | 'pending' | 'failed' | 'out';

/**
 * GraphMember - 文件是否已加入知识图谱
 * 独立于 FileNode，存 IndexedDB graphMembers
 */
export interface GraphMember {
  /** 对应 FileNode.id */
  fileId: string;
  /** 入图状态 */
  status: GraphMemberStatus;
  /** 对应 GraphNode.id；未入图时为 null */
  nodeId: string | null;
  /** 失败原因（failed 时） */
  errorMessage: string | null;
  /** 最近更新时间，ISO 8601 */
  updatedAt: string;
}

/**
 * KeywordNode - 关键词图谱节点（与论文图并列）
 * 所属：C · 知识图谱 > 关键词画布
 */
export interface KeywordNode {
  /** 唯一 id（由 canonical label 派生） */
  id: string;
  /** 展示名（近义合并后；原文写法优先） */
  label: string;
  /** 近义别名 */
  aliases: string[];
  /** 挂接的论文节点 id（file_*） */
  paperNodeIds: string[];
  x: number | null;
  y: number | null;
}

/**
 * KeywordEdge - 关键词之间的关联边（共现 + 语义相似度综合）
 */
export interface KeywordEdge {
  source: string;
  target: string;
  weight: number;
  /** 关系来源；旧版关键词边可能没有该字段 */
  origin?: GraphEdgeOrigin;
  /** AI 建边时的简短语义理由 */
  reason?: string;
}

/**
 * FileDocMeta - 文献目录展示用元数据（摘要 / 关键词）
 * 所属：A · 文件目录
 * 说明：独立于 FileNode（§9），存 IndexedDB fileDocMeta，避免污染规范字段
 */
export type FileDocMetaStatus = 'pending' | 'ready' | 'empty' | 'error';

export interface FileDocMeta {
  /** 对应 FileNode.id */
  fileId: string;
  /** 从文首 Keywords/关键词 抽取；无标记则为空数组 */
  keywords: string[];
  /** 从文首 Abstract/摘要 抽取；无则 null */
  abstract: string | null;
  /** 抽取状态 */
  status: FileDocMetaStatus;
  /** 最近一次抽取时间，ISO 8601 */
  extractedAt: string;
  /** 解析器版本；落后时目录页会重抽 */
  extractorVersion?: number;
}
