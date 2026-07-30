/**
 * DataPanel - 设置 · 数据管理（阅读会话 / 批注书签 / AI 配置）
 * 所属：AppShell > SettingsDrawer
 * 产品决定：取代「检测与隐私」；文献文件本身不在此清除
 */
import { useState } from 'react';
import { Button, Dialog, toast } from '../../common';
import { useSessionStore } from '../../../stores/sessionStore';
import { useUiStore } from '../../../stores/uiStore';
import * as sessionsDb from '../../../db/sessions';
import * as annotationsDb from '../../../db/annotations';
import * as bookmarksDb from '../../../db/bookmarks';
import styles from './SettingsForm.module.css';

type ClearKind = 'sessions' | 'notes' | 'ai' | null;

/** DataPanel - 分类清除本地阅读与对话相关数据 */
export function DataPanel() {
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const clearAiSettings = useUiStore((s) => s.clearAiSettings);
  const [kind, setKind] = useState<ClearKind>(null);
  const [busy, setBusy] = useState(false);

  const titles: Record<Exclude<ClearKind, null>, string> = {
    sessions: '清除阅读会话？',
    notes: '清除批注与书签？',
    ai: '清除 AI 连接配置？',
  };

  const bodies: Record<Exclude<ClearKind, null>, string> = {
    sessions:
      '将删除仪表盘用的阅读会话与专注统计。文献文件、批注与书签会保留。',
    notes:
      '将删除全部划词批注与书签。阅读会话与文献文件会保留。',
    ai: '将清除本机保存的 API Key、接口地址与模型名。问答记录目前未持久化，无历史可删。',
  };

  const runClear = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      if (kind === 'sessions') {
        await sessionsDb.clearSessions();
        await loadSessions();
        toast.show('已清除阅读会话');
      } else if (kind === 'notes') {
        await annotationsDb.clearAllAnnotations();
        await bookmarksDb.clearAllBookmarks();
        toast.show('已清除批注与书签');
      } else {
        clearAiSettings();
        toast.show('已清除 AI 配置');
      }
      setKind(null);
    } catch {
      toast.error('清除失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        数据均保存在本机。此处不删除已导入的 PDF / EPUB 文献文件。
      </p>

      <div className={styles.field}>
        <p className={styles.label}>阅读会话</p>
        <p className={styles.hint}>仪表盘专注时长、行数、热力图所用会话记录</p>
        <button
          type="button"
          className={styles.dangerBtn}
          aria-label="清除阅读会话数据"
          onClick={() => setKind('sessions')}
        >
          清除阅读会话
        </button>
      </div>

      <div className={styles.field}>
        <p className={styles.label}>批注与书签</p>
        <p className={styles.hint}>划词批注、高亮与书签标记</p>
        <button
          type="button"
          className={styles.dangerBtn}
          aria-label="清除批注与书签"
          onClick={() => setKind('notes')}
        >
          清除批注与书签
        </button>
      </div>

      <div className={styles.field}>
        <p className={styles.label}>对话 / AI 配置</p>
        <p className={styles.hint}>清除本机保存的 API Key、Base URL、模型等连接参数</p>
        <button
          type="button"
          className={styles.dangerBtn}
          aria-label="清除 AI 连接配置"
          onClick={() => setKind('ai')}
        >
          清除 AI 配置
        </button>
      </div>

      <Dialog
        open={kind !== null}
        onClose={() => !busy && setKind(null)}
        title={kind ? titles[kind] : ''}
        aria-label={kind ? titles[kind] : '确认清除'}
        footer={
          <>
            <Button
              aria-label="取消清除"
              variant="ghost"
              onClick={() => setKind(null)}
              disabled={busy}
            >
              取消
            </Button>
            <Button
              aria-label="确认清除"
              variant="danger"
              onClick={() => void runClear()}
              disabled={busy}
            >
              {busy ? '清除中…' : '确认清除'}
            </Button>
          </>
        }
      >
        <p className={styles.hint}>{kind ? bodies[kind] : ''}</p>
      </Dialog>
    </div>
  );
}
