/**
 * ReadingPanel - 设置 · 阅读（页面模式 + 默认栏 + 适应宽度）
 * 所属：AppShell > SettingsDrawer
 */
import {
  useReaderStore,
  type PageMode,
} from '../../../stores/readerStore';
import styles from './SettingsForm.module.css';

const PAGE_MODE_OPTIONS: { value: PageMode; label: string }[] = [
  { value: 'single', label: '单页' },
  { value: 'double', label: '双页' },
  { value: 'scroll', label: '连续滚动' },
];

/** ReadingPanel - 阅读默认布局与页面模式 */
export function ReadingPanel() {
  const pageMode = useReaderStore((s) => s.pageMode);
  const setPageMode = useReaderStore((s) => s.setPageMode);
  const tocOpen = useReaderStore((s) => s.tocOpen);
  const sideOpen = useReaderStore((s) => s.sideOpen);
  const defaultFitWidth = useReaderStore((s) => s.defaultFitWidth);
  const setDefaultTocOpen = useReaderStore((s) => s.setDefaultTocOpen);
  const setDefaultSideOpen = useReaderStore((s) => s.setDefaultSideOpen);
  const setDefaultFitWidth = useReaderStore((s) => s.setDefaultFitWidth);

  return (
    <div className={styles.section}>
      <div className={styles.field}>
        <p className={styles.label} id="settings-page-mode-label">
          默认页面模式
        </p>
        <div
          className={styles.segmented}
          role="group"
          aria-labelledby="settings-page-mode-label"
        >
          {PAGE_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={[
                styles.segment,
                pageMode === opt.value ? styles.segmentActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={pageMode === opt.value}
              onClick={() => setPageMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className={styles.hint}>
          新打开文档时采用此模式；可在阅读器底栏临时切换。
        </p>
      </div>

      <div className={styles.field}>
        <div className={styles.row}>
          <div>
            <p className={styles.label} id="settings-toc-label">
              默认显示左栏（目录）
            </p>
            <p className={styles.hint}>打开阅读器时是否展开目录面板</p>
          </div>
          <button
            type="button"
            className={[styles.toggle, tocOpen ? styles.toggleOn : '']
              .filter(Boolean)
              .join(' ')}
            role="switch"
            aria-checked={tocOpen}
            aria-labelledby="settings-toc-label"
            onClick={() => setDefaultTocOpen(!tocOpen)}
          >
            <span className={styles.toggleKnob} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.row}>
          <div>
            <p className={styles.label} id="settings-side-label">
              默认显示右栏（问答 / 批注）
            </p>
            <p className={styles.hint}>打开阅读器时是否展开侧栏</p>
          </div>
          <button
            type="button"
            className={[styles.toggle, sideOpen ? styles.toggleOn : '']
              .filter(Boolean)
              .join(' ')}
            role="switch"
            aria-checked={sideOpen}
            aria-labelledby="settings-side-label"
            onClick={() => setDefaultSideOpen(!sideOpen)}
          >
            <span className={styles.toggleKnob} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.row}>
          <div>
            <p className={styles.label} id="settings-fit-width-label">
              默认适应宽度
            </p>
            <p className={styles.hint}>
              打开文档后自动按画布宽度缩放（可随时在顶栏切换）
            </p>
          </div>
          <button
            type="button"
            className={[
              styles.toggle,
              defaultFitWidth ? styles.toggleOn : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="switch"
            aria-checked={defaultFitWidth}
            aria-labelledby="settings-fit-width-label"
            onClick={() => setDefaultFitWidth(!defaultFitWidth)}
          >
            <span className={styles.toggleKnob} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
