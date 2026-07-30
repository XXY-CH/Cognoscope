/**
 * pdfjsPolyfills.ts - PDF.js 5.x 所需运行时垫片
 * 所属：E · 阅读界面（须在任何 pdfjs-dist 导入之前执行）
 *
 * pdfjs-dist ≥ 5.5 无条件使用 Map.prototype.getOrInsertComputed，
 * 该 API 仅 Chrome 145+ / 最新 Firefox 提供；缺省会导致页面渲染抛错、画布空白。
 */
export function ensurePdfjsPolyfills(): void {
  const mapProto = Map.prototype as Map<unknown, unknown> & {
    getOrInsertComputed?: (
      key: unknown,
      callbackFn: (key: unknown) => unknown,
    ) => unknown;
    getOrInsert?: (key: unknown, defaultValue: unknown) => unknown;
  };

  if (typeof mapProto.getOrInsertComputed !== 'function') {
    Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
      value(key: unknown, callbackFn: (key: unknown) => unknown) {
        if (this.has(key)) return this.get(key);
        const value = callbackFn(key);
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
    });
  }

  if (typeof mapProto.getOrInsert !== 'function') {
    Object.defineProperty(Map.prototype, 'getOrInsert', {
      value(key: unknown, defaultValue: unknown) {
        if (this.has(key)) return this.get(key);
        this.set(key, defaultValue);
        return defaultValue;
      },
      writable: true,
      configurable: true,
    });
  }
}
