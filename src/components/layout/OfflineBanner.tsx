/**
 * OfflineBanner - 顶部离线状态条
 * 所属：全局 AppShell / 阅读界面
 * 规范参考：用户 Step 8（顶部条）+ UI_spec.md §14 本地优先说明
 */
import { CloudOff } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import styles from './OfflineBanner.module.css';

/**
 * OfflineBanner - 仅离线时渲染；在线态不占位（避免噪音）
 */
export function OfflineBanner() {
  const isOnline = useUiStore((s) => s.isOnline);
  if (isOnline) return null;

  return (
    <div
      className={styles.root}
      role="status"
      aria-live="polite"
      aria-label="当前处于离线状态"
    >
      <CloudOff size={16} strokeWidth={1.5} aria-hidden="true" />
      <span className={styles.text}>
        已离线，本地功能可正常使用（AI 问答暂不可用）
      </span>
    </div>
  );
}
