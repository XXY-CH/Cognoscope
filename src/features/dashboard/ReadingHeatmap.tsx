/**
 * ReadingHeatmap - 近 30 天阅读热力图（实时数据）
 * 所属页面：B · 个人仪表盘
 * 规范参考：UI_spec.md §5.7
 */
import { useEffect, useRef } from 'react';
import { Tooltip } from '../../components/common';
import { useSessionStore } from '../../stores/sessionStore';
import { buildHeatmap, type HeatDay } from '../../utils/dashboardMetrics';
import styles from './ReadingHeatmap.module.css';

function levelFor(minutes: number, max: number): number {
  if (minutes <= 0) return 0;
  if (max <= 0) return 1;
  const ratio = minutes / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

/** ReadingHeatmap - 从 sessionStore 读取会话生成热力图 */
export function ReadingHeatmap() {
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadSessions();
  }, [loadSessions]);

  const days: HeatDay[] = buildHeatmap(sessions);
  const max = Math.max(...days.map((d) => d.minutes), 0);
  const totalMin = days.reduce((s, d) => s + d.minutes, 0);

  if (days.length === 0) {
    return (
      <section className={styles.root} aria-label="近 30 天阅读热力图">
        <h2 className={styles.title}>阅读热力图</h2>
        <p className={styles.hint}>暂无阅读数据，打开论文后自动记录</p>
      </section>
    );
  }

  return (
    <section className={styles.root} aria-label="近 30 天阅读热力图">
      <h2 className={styles.title}>阅读热力图</h2>
      <div className={styles.heat} role="img" aria-label={`近 30 天阅读热力图，共 ${totalMin} 分钟`}>
        {days.map((day) => {
          const level = levelFor(day.minutes, max);
          return (
            <Tooltip
              key={day.dateKey}
              content={`${day.dateKey} · ${day.minutes} 分钟`}
              aria-label={`${day.dateKey} 阅读时长`}
            >
              <span
                className={styles.cell}
                data-level={level}
                aria-label={`${day.dateKey} ${day.minutes} 分钟`}
              />
            </Tooltip>
          );
        })}
      </div>
      <p className={styles.hint}>颜色越深表示当日阅读分钟越多（近 30 天）</p>
    </section>
  );
}
