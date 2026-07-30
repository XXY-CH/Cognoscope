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
 * GraphEdge - 知识图谱连线（由 AI/后端计算后传入，前端只读）
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
}

/** 摄像头检测运行状态 */
export type CameraStatus = 'active' | 'paused' | 'denied' | 'unavailable';

/**
 * CameraState - 摄像头检测全局状态
 * 所属：B · 个人仪表盘 / 全局 cameraStore
 * 规范参考：UI_spec.md §9 / §5.2 / §13 决策7（推理仅在本地）
 */
export interface CameraState {
  /**
   * 检测状态：
   * - `active`：正在检测
   * - `paused`：用户暂停
   * - `denied`：权限被拒绝
   * - `unavailable`：设备不可用或无摄像头
   */
  status: CameraStatus;
  /** 当前选用的媒体设备 id；未选择或不可用时为 `null` */
  deviceId: string | null;
  /** 是否显示摄像头预览画面（画面不出设备） */
  previewVisible: boolean;
}
