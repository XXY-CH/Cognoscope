/**
 * AppearancePanel - 设置 · 外观（主题 + 强调色风格）
 * 所属：AppShell > SettingsDrawer
 * 强调色与书签色板对齐：蓝/绿/黄/粉（无警告红）
 */
import {
  accentStyleLabel,
  themePreferenceLabel,
  useUiStore,
  type AccentStyle,
  type ThemePreference,
} from '../../../stores/uiStore';
import styles from './SettingsForm.module.css';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];
const ACCENT_OPTIONS: AccentStyle[] = ['blue', 'green', 'yellow', 'pink'];

/** AppearancePanel - 主题与风格即时生效 */
export function AppearancePanel() {
  const preference = useUiStore((s) => s.themePreference);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const accentStyle = useUiStore((s) => s.accentStyle);
  const setAccentStyle = useUiStore((s) => s.setAccentStyle);

  return (
    <div className={styles.section}>
      <div className={styles.field}>
        <p className={styles.label} id="settings-theme-label">
          主题
        </p>
        <div
          className={styles.segmented}
          role="group"
          aria-labelledby="settings-theme-label"
        >
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={[
                styles.segment,
                preference === opt ? styles.segmentActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={preference === opt}
              onClick={() => setThemePreference(opt)}
            >
              {themePreferenceLabel(opt)}
            </button>
          ))}
        </div>
        <p className={styles.hint}>与侧栏主题按钮同步，立即生效。</p>
      </div>

      <div className={styles.field}>
        <p className={styles.label} id="settings-accent-label">
          风格
        </p>
        <div
          className={styles.accentRow}
          role="group"
          aria-labelledby="settings-accent-label"
        >
          {ACCENT_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={[
                styles.accentSwatch,
                accentStyle === opt ? styles.accentSwatchActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-accent-preview={opt}
              aria-label={`强调色 ${accentStyleLabel(opt)}`}
              aria-pressed={accentStyle === opt}
              onClick={() => setAccentStyle(opt)}
            />
          ))}
        </div>
        <p className={styles.hint}>
          与书签色板一致（蓝 / 绿 / 黄 / 粉），不含警告红。
        </p>
      </div>
    </div>
  );
}
