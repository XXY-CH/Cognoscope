/**
 * pdfjs.ts - PDF.js 全局配置与文档加载封装
 * 所属：E · 阅读界面 > ReaderCanvas
 * 规范参考：UI_spec.md §8.3 / §14；使用 legacy 构建以兼容 Chrome < 145
 */
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  setLayerDimensions,
  type OnProgressParameters,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
// legacy worker 内置 getOrInsertComputed 等垫片，与 API 版本必须一致
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { ensurePdfjsPolyfills } from './pdfjsPolyfills';

export { TextLayer, setLayerDimensions };
export type { PDFDocumentProxy };

let workerConfigured = false;

/** 由 vite 插件挂载的本地资源前缀（见 vite.config.ts） */
const PDFJS_CMAP_URL = '/pdfjs/cmaps/';
const PDFJS_STANDARD_FONT_URL = '/pdfjs/standard_fonts/';
const PDFJS_WASM_URL = '/pdfjs/wasm/';

/**
 * 确保 GlobalWorkerOptions.workerSrc 只设置一次
 */
export function ensurePdfjsWorker(): void {
  // 主线程再垫一层，防止其它入口直接触达 pdfjs API
  ensurePdfjsPolyfills();
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
 * 必须提供 cMapUrl：知网等中文 PDF 依赖 Adobe CMap，否则字形空白/乱码
 */
export async function loadPdfDocument(
  data: ArrayBuffer,
  options: LoadPdfOptions = {},
): Promise<PDFDocumentProxy> {
  ensurePdfjsWorker();

  const loadingTask = getDocument({
    data: new Uint8Array(data),
    // 知网 GBK CID 字体需要本地 CMap（离线，不走 CDN）
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
    wasmUrl: PDFJS_WASM_URL,
    // 允许回退系统字体，减轻内嵌残缺字体的空白页问题
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
