/**
 * ReaderFindBox - 阅读顶栏文内搜索（框内：上一个 / 下一个 / 查找）
 * 所属页面：E · 阅读界面 > TopBar
 * 规范参考：UI_spec.md §8.2 / §8.7 搜索本文
 */
import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useReaderStore } from '../../stores/readerStore';
import styles from './ReaderFindBox.module.css';

/**
 * ReaderFindBox - 受控草稿由 store.findDraft 同步；支持划词「搜索本文」灌入
 */
export function ReaderFindBox() {
  const inputRef = useRef<HTMLInputElement>(null);
  const findDraft = useReaderStore((s) => s.findDraft);
  const findFocusNonce = useReaderStore((s) => s.findFocusNonce);
  const setFindDraft = useReaderStore((s) => s.setFindDraft);
  const requestFind = useReaderStore((s) => s.requestFind);

  // 划词搜索等外部灌入后聚焦输入框
  useEffect(() => {
    if (findFocusNonce === 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [findFocusNonce]);

  return (
    <div className={styles.root} role="search" aria-label="文内搜索">
      <Search
        className={styles.leadingIcon}
        size={14}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        className={styles.input}
        type="search"
        aria-label="搜索本文"
        placeholder="搜索本文…"
        value={findDraft}
        onChange={(e) => setFindDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            // Shift+Enter 向上查找
            requestFind(findDraft, e.shiftKey ? 'prev' : 'next');
          }
        }}
      />
      <button
        type="button"
        className={styles.iconBtn}
        aria-label="上一个匹配"
        title="上一个"
        disabled={!findDraft.trim()}
        onClick={() => requestFind(findDraft, 'prev')}
      >
        <ChevronUp size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        aria-label="下一个匹配"
        title="下一个"
        disabled={!findDraft.trim()}
        onClick={() => requestFind(findDraft, 'next')}
      >
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        aria-label="查找"
        title="查找"
        disabled={!findDraft.trim()}
        onClick={() => requestFind(findDraft, 'next')}
      >
        <Search size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
