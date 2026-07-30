/**
 * ShortcutsPanel - 设置 · 可自定义快捷键
 * 所属：AppShell > SettingsDrawer
 * 主题默认 Ctrl/Cmd+Alt+T（避免 Ctrl+Shift+L 与浏览器冲突）
 */
import { useEffect, useState } from 'react';
import { Minus } from 'lucide-react';
import { IconButton, Tooltip, toast } from '../../common';
import { useShortcutStore } from '../../../stores/shortcutStore';
import {
  SHORTCUT_GROUPS,
  SHORTCUT_LABELS,
  bindingFromEvent,
  formatBinding,
  type ShortcutActionId,
} from '../../../utils/shortcuts';
import styles from './SettingsForm.module.css';

/** ShortcutsPanel - 点击快捷键格改键；负号恢复单项默认 */
export function ShortcutsPanel() {
  const bindings = useShortcutStore((s) => s.bindings);
  const setBinding = useShortcutStore((s) => s.setBinding);
  const resetBinding = useShortcutStore((s) => s.resetBinding);
  const resetAll = useShortcutStore((s) => s.resetAll);
  const findConflict = useShortcutStore((s) => s.findConflict);
  const [listening, setListening] = useState<ShortcutActionId | null>(null);

  useEffect(() => {
    if (!listening) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListening(null);
        return;
      }
      const next = bindingFromEvent(e);
      if (!next) return;

      const conflict = findConflict(listening, next);
      if (conflict) {
        toast.error(
          `与「${SHORTCUT_LABELS[conflict]}」冲突，请换一组键`,
        );
        return;
      }
      setBinding(listening, next);
      toast.show(`已更新：${SHORTCUT_LABELS[listening]}`);
      setListening(null);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [listening, findConflict, setBinding]);

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        点击快捷键后按下新组合；Esc 取消。翻页方向键不可改。
      </p>

      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.title} className={styles.field}>
          <p className={styles.label}>{group.title}</p>
          <table className={styles.shortcutTable}>
            <thead>
              <tr>
                <th scope="col">行为</th>
                <th scope="col">快捷键</th>
                <th scope="col">恢复默认</th>
              </tr>
            </thead>
            <tbody>
              {group.ids.map((id) => (
                <tr key={id}>
                  <td>{SHORTCUT_LABELS[id]}</td>
                  <td>
                    <button
                      type="button"
                      className={[
                        styles.kbdBtn,
                        listening === id ? styles.kbdListening : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={
                        listening === id
                          ? `正在更改${SHORTCUT_LABELS[id]}，请按新键或 Esc 取消`
                          : `更改${SHORTCUT_LABELS[id]}快捷键`
                      }
                      onClick={() =>
                        setListening((cur) => (cur === id ? null : id))
                      }
                    >
                      {listening === id
                        ? '按下新键…'
                        : formatBinding(bindings[id])}
                    </button>
                  </td>
                  <td>
                    <div className={styles.shortcutActions}>
                      <Tooltip
                        content="恢复默认"
                        aria-label="恢复默认提示"
                      >
                        <IconButton
                          aria-label={`恢复${SHORTCUT_LABELS[id]}默认快捷键`}
                          onClick={() => {
                            resetBinding(id);
                            setListening((cur) => (cur === id ? null : cur));
                            toast.show('已恢复默认');
                          }}
                        >
                          <Minus size={16} strokeWidth={1.5} />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <button
        type="button"
        className={styles.segment}
        aria-label="全部恢复默认快捷键"
        onClick={() => {
          resetAll();
          setListening(null);
          toast.show('已全部恢复默认快捷键');
        }}
      >
        全部恢复默认
      </button>
    </div>
  );
}
