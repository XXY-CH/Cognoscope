/**
 * dashboardPlaceholders.ts - 仪表盘演示用固定占位数据
 * 所属页面：B · 个人仪表盘
 * 说明：非真实检测结果，便于联调布局与视觉
 */

/** 近 7 次迷你趋势条（专注时长卡） */
export const PLACEHOLDER_SPARK_FOCUS = [42, 55, 48, 70, 62, 78, 85];

/** 近 7 次迷你趋势条（阅读行数卡） */
export const PLACEHOLDER_SPARK_LINES = [30, 45, 38, 60, 52, 72, 80];

/** 指标卡：专注时长主值与副文案 */
export const PLACEHOLDER_FOCUS_DURATION = '01:24:36';
export const PLACEHOLDER_FOCUS_DELTA = '较上次 +18 分钟 ↑';

/** 指标卡：阅读行数主值与副文案 */
export const PLACEHOLDER_LINES_READ = '12,480';
export const PLACEHOLDER_LINES_DELTA = '较上次 +1,260 行';

/**
 * 近 30 天热力图分钟数（从旧到新，长度固定 30）
 * 0 = 无阅读；其余为当日阅读分钟占位
 */
export const PLACEHOLDER_HEAT_MINUTES: number[] = [
  0, 25, 40, 0, 55, 70, 20, 0, 35, 90, 45, 0, 60, 80, 30, 15, 0, 50, 65, 100,
  40, 0, 75, 55, 20, 85, 45, 0, 70, 95,
];

/** 单次专注会话的六维指标占位 */
export interface FocusSessionPlaceholder {
  /** 会话时间段展示文案 */
  timeRange: string;
  /** ISO 日期，用于排序与分组（YYYY-MM-DD） */
  dateKey: string;
  /** 注视中心占比，如 78% */
  gazeCenterRatio: string;
  /** 分心事件密度，如 0.42 /min */
  distractionDensity: string;
  /** 头部姿态方差 */
  headPoseVariance: string;
  /** 眼睑闭合百分比 */
  eyelidClosure: string;
  /** 眨眼频率，如 18.5 /min */
  blinkRate: string;
  /** 综合评分 0–100 */
  overallScore: string;
}

/**
 * 按时间升序（早 → 晚）的专注会话占位列表
 */
export const PLACEHOLDER_FOCUS_SESSIONS: FocusSessionPlaceholder[] = [
  {
    dateKey: '2026-07-22',
    timeRange: '2026-07-22 09:15 – 10:02',
    gazeCenterRatio: '72.4%',
    distractionDensity: '0.38 /min',
    headPoseVariance: '0.086',
    eyelidClosure: '12.3%',
    blinkRate: '16.2 /min',
    overallScore: '78',
  },
  {
    dateKey: '2026-07-24',
    timeRange: '2026-07-24 14:30 – 15:48',
    gazeCenterRatio: '81.6%',
    distractionDensity: '0.21 /min',
    headPoseVariance: '0.054',
    eyelidClosure: '9.8%',
    blinkRate: '14.7 /min',
    overallScore: '86',
  },
  {
    dateKey: '2026-07-26',
    timeRange: '2026-07-26 20:05 – 21:22',
    gazeCenterRatio: '64.1%',
    distractionDensity: '0.55 /min',
    headPoseVariance: '0.112',
    eyelidClosure: '18.6%',
    blinkRate: '22.4 /min',
    overallScore: '61',
  },
  {
    dateKey: '2026-07-28',
    timeRange: '2026-07-28 08:40 – 09:55',
    gazeCenterRatio: '76.9%',
    distractionDensity: '0.29 /min',
    headPoseVariance: '0.067',
    eyelidClosure: '11.1%',
    blinkRate: '15.8 /min',
    overallScore: '82',
  },
  {
    dateKey: '2026-07-29',
    timeRange: '2026-07-29 16:10 – 17:05',
    gazeCenterRatio: '88.2%',
    distractionDensity: '0.14 /min',
    headPoseVariance: '0.041',
    eyelidClosure: '7.5%',
    blinkRate: '13.1 /min',
    overallScore: '91',
  },
];
