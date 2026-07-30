/**
 * usePdfDocument - 从 IndexedDB blob 加载 PDFDocumentProxy
 * 所属：E · 阅读界面 > PdfRenderer
 * 规范参考：UI_spec.md §8.3 / §14
 */
import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getFileBlob } from '../db/files';
import { loadPdfDocument } from '../utils/pdfjs';

export type PdfLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UsePdfDocumentResult {
  pdf: PDFDocumentProxy | null;
  status: PdfLoadStatus;
  /** 0–1 加载进度（字节级） */
  loadProgress: number;
  errorMessage: string | null;
}

/**
 * 按 fileId 拉取 blob 并解析为 PDF.js 文档；fileId 变化或卸载时销毁旧文档
 */
export function usePdfDocument(fileId: string): UsePdfDocumentResult {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<PdfLoadStatus>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let activeDoc: PDFDocumentProxy | null = null;

    setStatus('loading');
    setLoadProgress(0);
    setErrorMessage(null);
    setPdf(null);

    (async () => {
      try {
        const record = await getFileBlob(fileId);
        if (ac.signal.aborted) return;
        if (!record?.blob) {
          setStatus('error');
          setErrorMessage('未找到文件内容，请重新导入');
          return;
        }

        const buffer = await record.blob.arrayBuffer();
        if (ac.signal.aborted) return;

        const doc = await loadPdfDocument(buffer, {
          signal: ac.signal,
          onProgress: setLoadProgress,
        });
        if (ac.signal.aborted) {
          await doc.destroy();
          return;
        }
        activeDoc = doc;
        setPdf(doc);
        setLoadProgress(1);
        setStatus('ready');
      } catch (err) {
        if (ac.signal.aborted) return;
        // AbortError 属于正常卸载，不记为错误
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'PDF 加载失败',
        );
      }
    })();

    return () => {
      ac.abort();
      // 异步销毁，避免卸载后仍占用 worker 内存
      if (activeDoc) {
        void activeDoc.destroy();
        activeDoc = null;
      }
    };
  }, [fileId]);

  return { pdf, status, loadProgress, errorMessage };
}
