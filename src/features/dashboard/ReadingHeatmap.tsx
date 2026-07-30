/**
 * ReadingHeatmap - 近 1 年阅读热力图（周历对齐 · 与 monitor 专注会话同步）
 * 所属页面：B · 个人仪表盘
 * 规范参考：UI_spec.md §5.7
 */
import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { Tooltip } from '../../components/common';
import type { ReadingSession } from '../../types';
import {
  buildHeatmap,
  computeReadingStreak,
  heatLevel,
  HEATMAP_DAYS,
  type HeatDay,
} from '../../utils/dashboardMetrics';
import styles from './ReadingHeatmap.module.css';

/** 周一为周首：0=周一 … 6=周日 */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

interface HeatCell {
  dateKey: string | null; // null = 窗口外占位
  minutes: number;
  inRange: boolean;
}

interface ReadingHeatmapProps {
  /** IndexedDB 阅读会话 */
  sessions: ReadingSession[];
  /** monitor 检测会话元数据（与专注表同源，保证热力点同步点亮） */
  monitorMetas?: Array<{
    startedAt: string | null;
    durationSec: number;
  }>;
}

/**
 * 将一年数据铺成「周列 × 星期行」网格（周一为一周起始）
 */
function buildWeekGrid(days: HeatDay[]): HeatCell[][] {
  if (days.length === 0) return [];
  const byKey = new Map(days.map((d) => [d.dateKey, d.minutes]));
  const first = new Date(`${days[0]!.dateKey}T12:00:00`);
  const last = new Date(`${days[days.length - 1]!.dateKey}T12:00:00`);

  // getDay: 0=日 → 转为周一=0
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayOffset);

  const cells: HeatCell[] = [];
  const cursor = new Date(gridStart);
  const endPad = (7 - ((last.getDay() + 6) % 7) - 1 + 7) % 7;
  const gridEnd = new Date(last);
  gridEnd.setDate(last.getDate() + endPad);

  while (cursor <= gridEnd) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const day = String(cursor.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${day}`;
    const inRange = byKey.has(dateKey);
    cells.push({
      dateKey: inRange ? dateKey : null,
      minutes: inRange ? (byKey.get(dateKey) ?? 0) : 0,
      inRange,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/** 每列周对应的月份标签（仅在月份变化的那一周显示） */
function monthLabelForWeeks(weeks: HeatCell[][]): (string | null)[] {
  let prevMonth = -1;
  return weeks.map((week) => {
    const firstInRange = week.find((c) => c.inRange && c.dateKey);
    if (!firstInRange?.dateKey) return null;
    const month = Number(firstInRange.dateKey.slice(5, 7));
    if (month === prevMonth) return null;
    prevMonth = month;
    return `${month}月`;
  });
}

/** ReadingHeatmap - 合并阅读会话与 monitor 时长，近一年周历 */
export function ReadingHeatmap({
  sessions,
  monitorMetas = [],
}: ReadingHeatmapProps) {
  const days = useMemo(() => {
    // 两路时长按日累加：专注表有数据的日期，热力图同步着色
    const entries = [
      ...sessions.map((s) => ({
        startedAt: s.startedAt,
        durationSec: s.durationSec,
      })),
      ...monitorMetas.map((m) => ({
        startedAt: m.startedAt,
        durationSec: m.durationSec,
      })),
    ];
    return buildHeatmap(entries, HEATMAP_DAYS);
  }, [sessions, monitorMetas]);
  const weeks = useMemo(() => buildWeekGrid(days), [days]);
  const monthLabels = useMemo(() => monthLabelForWeeks(weeks), [weeks]);
  const max = useMemo(
    () => Math.max(...days.map((d) => d.minutes), 0),
    [days],
  );
  const totalMin = useMemo(
    () => days.reduce((s, d) => s + d.minutes, 0),
    [days],
  );
  const streak = useMemo(() => computeReadingStreak(days), [days]);
  const hasAnyReading = totalMin > 0;

  return (
    <section className={styles.root} aria-label="近 1 年阅读热力图">
      <div className={styles.header}>
        <h2 className={styles.title}>阅读热力图</h2>
        <p className={styles.streak} aria-label={`连续阅读 ${streak} 天`}>
          <Flame
            className={styles.streakIcon}
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className={styles.streakValue}>{streak}</span>
          <span className={styles.streakUnit}>天连续</span>
        </p>
      </div>

      {!hasAnyReading ? (
        <p className={styles.emptyHint}>暂无阅读数据，打开论文后自动记录</p>
      ) : null}

      <div
        className={styles.calendar}
        role="img"
        aria-label={`近 1 年阅读热力图，共 ${totalMin} 分钟，连续 ${streak} 天`}
      >
        <div className={styles.monthRow} aria-hidden="true">
          <span className={styles.weekdayGutter} />
          <div className={styles.monthTrack}>
            {monthLabels.map((label, i) => (
              <span key={`m-${i}`} className={styles.monthSlot}>
                {label ?? ''}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.weekdayCol} aria-hidden="true">
            {WEEKDAY_LABELS.map((label, i) => (
              <span
                key={label}
                className={
                  i % 2 === 0 ? styles.weekdayLabel : styles.weekdayLabelHidden
                }
              >
                {label}
              </span>
            ))}
          </div>

          <div className={styles.weeks}>
            {weeks.map((week, wi) => (
              <div key={wi} className={styles.week}>
                {week.map((cell, di) => {
                  if (!cell.inRange || !cell.dateKey) {
                    return (
                      <span
                        key={`pad-${wi}-${di}`}
                        className={styles.cellPad}
                        aria-hidden="true"
                      />
                    );
                  }
                  const level = heatLevel(cell.minutes, max);
                  return (
                    <Tooltip
                      key={cell.dateKey}
                      content={`${cell.dateKey} · ${cell.minutes} 分钟`}
                      aria-label={`${cell.dateKey} 阅读时长`}
                    >
                      <span
                        className={styles.cell}
                        data-level={level}
                        aria-label={`${cell.dateKey} ${cell.minutes} 分钟`}
                      />
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <p className={styles.hint}>
          近 1 年共 {totalMin.toLocaleString('zh-CN')} 分钟
        </p>
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.legendLabel}>少</span>
          {[0, 1, 2, 3, 4].map((lv) => (
            <span key={lv} className={styles.cell} data-level={lv} />
          ))}
          <span className={styles.legendLabel}>多</span>
        </div>
      </div>
    </section>
  );
}
