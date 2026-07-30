/**
 * pdfjs.ts - PDF.js 全局配置与文档加载封装
 * 所属：E · 阅读界面 > ReaderCanvas
 * 规范参考：UI_spec.md §8.3 / §14；worker 本地化以支持离线
 */
import {
  getDocument,
  GlobalWorkerOptions,
  type OnProgressParameters,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
// Vite `?url`：把 worker 作为静态资源发出，离线可用（§14）
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerConfigured = false;

/**
 * 确保 GlobalWorkerOptions.workerSrc 只设置一次
 */
export function ensurePdfjsWorker(): void {
  if (workerConfigured) return;
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

export interface LoadPdfOptions {
  /** 加载字节进度回调（loaded / total） */
  onProgress?: (ratio: number) => void;
  /** 取消信号：组件卸载时中止解析 */
  signal?: AbortSignal;
}

/**
 * 从 ArrayBuffer 加载 PDF 文档；失败或取消时抛出
 */
export async function loadPdfDocument(
  data: ArrayBuffer,
  options: LoadPdfOptions = {},
): Promise<PDFDocumentProxy> {
  ensurePdfjsWorker();

  const loadingTask = getDocument({
    data: new Uint8Array(data),
    // 禁用字体面扩展，减少额外网络请求
    useSystemFonts: true,
  });

  if (options.onProgress) {
    loadingTask.onProgress = (p: OnProgressParameters) => {
      // total 可能为 0（未知大小），此时不报假进度
      if (!p.total) return;
      options.onProgress?.(Math.min(1, p.loaded / p.total));
    };
  }

  const onAbort = () => {
    void loadingTask.destroy();
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const pdf = await loadingTask.promise;
    if (options.signal?.aborted) {
      await pdf.destroy();
      throw new DOMException('Aborted', 'AbortError');
    }
    return pdf;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}
