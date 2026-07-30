/**
 * PdfPage - 单页 PDF canvas + Text Layer 渲染
 * 所属页面：E · 阅读界面 > ReaderCanvas > PdfRenderer
 * 规范参考：UI_spec.md §8.3 / §8.5
 */
import { useEffect, useRef, useState } from 'react';
import {
  TextLayer,
  setLayerDimensions,
  type PDFDocumentProxy,
} from '../../../utils/pdfjs';
import { buildPdfLineKeys } from '../../../utils/pdfTextLines';
import { PdfPageBookmarks } from './PdfPageBookmarks';
import styles from './PdfRenderer.module.css';
import textStyles from './PdfTextLayer.module.css';

/**
 * PdfPageProps
 * @param pdf - 已加载的 PDF 文档
 * @param pageNumber - 1-based 页码
 * @param scale - 缩放倍率（相对 PDF 默认 72dpi）
 * @param onRendered - 渲染完成回调
 * @param onLinesReady - 本页行键就绪（用于已读统计）
 */
export interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onRendered?: (pageNumber: number, height: number) => void;
  onLinesReady?: (pageNumber: number, lineKeys: string[]) => void;
}

/**
 * 将指定页绘制到 canvas，并叠加可选择的 Text Layer
 */
export function PdfPage({
  pdf,
  pageNumber,
  scale,
  onRendered,
  onLinesReady,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const [textLayerEl, setTextLayerEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setTextLayerEl(textLayerRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textRoot = textLayerRef.current;
    if (!canvas || !textRoot) return;

    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let textLayer: TextLayer | null = null;

    (async () => {
      setRendering(true);
      textRoot.replaceChildren();
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const transform =
          dpr !== 1 ? ([dpr, 0, 0, dpr, 0, 0] as const) : undefined;

        const task = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: transform ? [...transform] : undefined,
        });
        renderTask = task;
        await task.promise;
        if (cancelled) return;

        // Text Layer：透明可选手层，供划词 / 复制 / 行统计
        const textContent = await page.getTextContent();
        if (cancelled) return;

        textRoot.style.setProperty(
          '--total-scale-factor',
          String(viewport.scale),
        );
        setLayerDimensions(textRoot, viewport);

        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textRoot,
          viewport,
        });
        await textLayer.render();
        if (cancelled) return;

        onLinesReady?.(pageNumber, buildPdfLineKeys(pageNumber, textContent));
        setRendering(false);
        onRendered?.(pageNumber, viewport.height);
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === 'RenderingCancelledException' ||
            err.message.includes('cancelled'))
        ) {
          return;
        }
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, onRendered, onLinesReady]);

  return (
    <div
      className={styles.page}
      data-page={pageNumber}
      aria-label={`第 ${pageNumber} 页`}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-busy={rendering}
      />
      {/* 绝对叠加在 canvas 上，支持划词选区 */}
      <div
        ref={textLayerRef}
        className={textStyles.textLayer}
        data-page={pageNumber}
      />
      <PdfPageBookmarks
        pageNumber={pageNumber}
        textLayerEl={textLayerEl}
        ready={!rendering}
      />
    </div>
  );
}
