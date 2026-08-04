/**
 * Static READ-04 contract probe.
 * Browser/real-document interaction remains a separate Q2 gate.
 */
import fs from 'node:fs/promises';
import ts from 'typescript';

const files = {
  pdfAnnotations: '../src/features/reader/canvas/PdfPageAnnotations.tsx',
  pdfPage: '../src/features/reader/canvas/PdfPage.tsx',
  pdfRenderer: '../src/features/reader/canvas/PdfRenderer.tsx',
  epubRenderer: '../src/features/reader/canvas/EpubRenderer.tsx',
  selectionToolbar: '../src/features/reader/canvas/SelectionToolbar.tsx',
  tocPanel: '../src/features/reader/panels/TocPanel.tsx',
  annotationPanel: '../src/features/reader/panels/AnnotationPanel.tsx',
  readerPage: '../src/features/reader/ReaderPage.tsx',
  tocCss: '../src/features/reader/panels/TocPanel.module.css',
  epubToc: '../src/utils/epubToc.ts',
  readerStore: '../src/stores/readerStore.ts',
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, relativePath]) => [
      key,
      await fs.readFile(new URL(relativePath, import.meta.url), 'utf8'),
    ]),
  ),
);

const contracts = [
  ['PDF 选区生成偏移锚点', sources.selectionToolbar, 'buildPdfTextOffsetAnchor(range)'],
  ['PDF 偏移锚点解析', sources.pdfAnnotations, 'parsePdfTextOffsetAnchor'],
  ['PDF 版本化范围摘录回退', sources.pdfAnnotations, 'resolvePdfTextRange'],
  ['PDF text layer 稳定锚点', sources.pdfPage, 'data-pdf-text-layer'],
  ['PDF 精确范围重放', sources.pdfAnnotations, 'range.end <= start || range.start >= end'],
  ['PDF legacy 首次匹配回退', sources.pdfAnnotations, 'pageText.indexOf(needle)'],
  ['PDF 批注回读聚焦', sources.pdfAnnotations, 'annotationJumpId'],
  ['PDF Reader 主动加载批注', sources.pdfRenderer, 'loadAnnotations(fileId)'],
  ['EPUB navigation 异步投影', sources.epubRenderer, 'book.loaded.navigation'],
  ['EPUB TOC 不阻塞正文', sources.epubRenderer, 'void book.loaded.navigation'],
  ['EPUB CFI 高亮 API', sources.epubRenderer, 'rendition.annotations.highlight'],
  ['EPUB contents 数组兼容', sources.epubRenderer, 'getEpubContents'],
  ['EPUB 选区 CFI 事件', sources.epubRenderer, "rendition.on('selected'"],
  ['EPUB 批注保存 CFI', sources.selectionToolbar, 'anchor: pos.anchor'],
  ['EPUB TOC 跳转消费', sources.epubRenderer, 'pendingEpubTocHref'],
  ['EPUB display generation guard', sources.epubRenderer, 'guardedEpubDisplay'],
  ['EPUB display cancellation', sources.epubRenderer, 'AbortController'],
  ['EPUB display close deduplication', sources.epubRenderer, 'const cancelEpubDisplayIfCurrent = finishEpubDisplay'],
  ['EPUB keyboard navigation guard', sources.epubRenderer, 'beginPageMove'],
  ['EPUB 批注跳转 stale guard', sources.epubRenderer, 'clearAnnotationJumpIfCurrent'],
  ['EPUB 定位回放 stale guard', sources.epubRenderer, 'clearPendingLocator(handoff)'],
  ['EPUB 定位失败原因', sources.epubRenderer, 'setPendingLocatorUnavailable'],
  ['PDF 定位失败原因', sources.pdfRenderer, 'pdfLocatorUnavailableReason'],
  ['EPUB relocated 初始监听', sources.epubRenderer, "rendition.on('relocated', commitLocation)"],
  ['EPUB TOC 虚拟层级包装', sources.tocPanel, 'outlinePlaceholder'],
  ['EPUB TOC tokenized 深度缩进', sources.tocCss, '.outlineList .outlineList'],
  ['TocPanel EPUB 投影', sources.tocPanel, 'epubToc.map'],
  ['批注回到原文动作', sources.annotationPanel, 'requestAnnotationJump'],
  ['不可用定位显式禁用', sources.annotationPanel, '原文不可用'],
  ['Reader 来源定位失败状态', sources.readerStore, 'pendingLocatorUnavailable'],
  ['Reader 来源定位重试', sources.readerStore, 'retryPendingLocator'],
  ['Reader 来源定位提示', sources.readerPage, '来源定位不可用'],
  ['Reader 来源定位 alert', sources.readerPage, 'role="alert"'],
  ['EPUB TOC 展平工具', sources.epubToc, 'flattenEpubToc'],
  ['EPUB TOC 隐藏父链', sources.epubToc, 'parentIds'],
  ['EPUB TOC 隐藏父节点重建', sources.tocPanel, 'ensureNode'],
  ['Reader 批注跳转事件', sources.readerStore, 'annotationJumpId'],
  ['Reader 批注跳转条件清除', sources.readerStore, 'clearAnnotationJumpIfCurrent'],
  ['Reader 定位 handoff 条件清除', sources.readerStore, 'sameReaderLocatorHandoff'],
];

for (const [label, source, marker] of contracts) {
  if (!source.includes(marker)) {
    throw new Error(`${label}缺少契约标记：${marker}`);
  }
}

const relocatedIndex = sources.epubRenderer.indexOf(
  "rendition.on('relocated', commitLocation)",
);
const initialTokenIndex = sources.epubRenderer.indexOf(
  "const initialToken = beginEpubDisplay('page', 'initial');",
);
const initialDisplayIndex = sources.epubRenderer.indexOf(
  'await guardedEpubDisplay(',
  initialTokenIndex,
);
const pendingReplayIndex = sources.epubRenderer.indexOf(
  'await replayPendingLocator(book, rendition, total);',
);
const bottomPageStart = sources.epubRenderer.indexOf('// 底栏跳页');
const bottomPageReadyGuard = sources.epubRenderer.indexOf(
  "if (status !== 'ready') return;",
  bottomPageStart,
);
const bottomPageSkipGuard = sources.epubRenderer.indexOf(
  'if (skipDisplayRef.current)',
  bottomPageStart,
);
if (
  relocatedIndex < 0 ||
  initialTokenIndex < 0 ||
  initialDisplayIndex < 0 ||
  pendingReplayIndex < 0 ||
  relocatedIndex > initialDisplayIndex ||
  relocatedIndex > pendingReplayIndex ||
  bottomPageStart < 0 ||
  bottomPageReadyGuard < 0 ||
  bottomPageSkipGuard < 0 ||
  bottomPageReadyGuard > bottomPageSkipGuard ||
  !sources.epubRenderer.includes('setCurrentPage(') ||
  !sources.epubRenderer.includes('setCurrentEpubHref(start.href ?? null)')
) {
  throw new Error('EPUB initial relocation/replay guard contract failed');
}

const parserStart = sources.pdfAnnotations.indexOf(
  'function parsePdfTextOffsetAnchor',
);
const parserEnd = sources.pdfAnnotations.indexOf('\n}\n', parserStart);
if (parserStart < 0 || parserEnd < 0) {
  throw new Error('PDF offset parser fixture source not found');
}
const parserTranspiled = ts.transpileModule(
  `export ${sources.pdfAnnotations.slice(parserStart, parserEnd + 3)}`,
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  },
).outputText;
const parserModule = await import(
  `data:text/javascript;base64,${Buffer.from(parserTranspiled).toString('base64')}`,
);
const offsetFixtures = [
  ['pdf-text-offset-v1:12:34', { start: 12, end: 34 }],
  ['pdf-text-offset-v1:0:0', { start: 0, end: 0 }],
  ['pdf-text-offset:12:34', { start: 12, end: 34 }],
  ['pdf-text-offset:0:0', { start: 0, end: 0 }],
  ['pdf-text-offset-v1:34:12', null],
  ['pdf-text-offset-v1:start:end', null],
  ['pdf-text-offset:34:12', null],
  ['pdf-text-offset:start:end', null],
  ['quoted-text:12:34', null],
];
for (const [anchor, expected] of offsetFixtures) {
  const actual = parserModule.parsePdfTextOffsetAnchor(anchor);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`PDF offset parser fixture failed for ${anchor}`);
  }
}

const rangeStart = sources.pdfAnnotations.indexOf('function normalizeText');
const rangeEnd = sources.pdfAnnotations.indexOf('/** 清理上一轮', rangeStart);
if (rangeStart < 0 || rangeEnd < 0) {
  throw new Error('PDF text-range fallback fixture source not found');
}
const rangeTranspiled = ts.transpileModule(
  `${sources.pdfAnnotations.slice(rangeStart, rangeEnd)}
export { normalizeText, resolvePdfTextRange };`,
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  },
).outputText;
const rangeModule = await import(
  `data:text/javascript;base64,${Buffer.from(rangeTranspiled).toString('base64')}`,
);
const fallbackPage = rangeModule.normalizeText('Alpha Recovery quote Omega');
const fallbackNeedle = rangeModule.normalizeText('Recovery quote');
const fallbackStart = fallbackPage.indexOf(fallbackNeedle);
const fallbackExpected = {
  start: fallbackStart,
  end: fallbackStart + fallbackNeedle.length,
};
for (const anchor of [
  '',
]) {
  const actual = rangeModule.resolvePdfTextRange(
    fallbackPage,
    fallbackNeedle,
    anchor,
  );
  if (JSON.stringify(actual) !== JSON.stringify(fallbackExpected)) {
    throw new Error(`PDF quoted-text fallback fixture failed for ${anchor}`);
  }
}
for (const anchor of [
  'pdf-text-offset-v1:start:end',
  'pdf-text-offset-v1:0:999',
  'pdf-text-offset-v1:0:5',
  'pdf-text-offset:0:5',
]) {
  const actual = rangeModule.resolvePdfTextRange(
    fallbackPage,
    fallbackNeedle,
    anchor,
  );
  if (actual !== null) {
    throw new Error(`PDF invalid versioned anchor incorrectly fell back for ${anchor}`);
  }
}

const transpiled = ts.transpileModule(sources.epubToc, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
}).outputText;
const epubTocModule = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`,
);
const nestedToc = epubTocModule.flattenEpubToc([
  {
    id: 'root',
    href: '',
    label: '容器',
    subitems: [
      { id: 'child', href: 'chapter.xhtml#intro', label: '引言' },
      {
        id: 'nested',
        href: '',
        label: '嵌套容器',
        subitems: [
          { id: 'leaf', href: 'chapter.xhtml#method', label: '方法' },
          {
            id: 'deep-container',
            href: '',
            label: '更深容器',
            subitems: [
              { id: 'deep-leaf', href: 'chapter.xhtml#result', label: '结果' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'sibling-root',
    href: '',
    label: '另一个容器',
    subitems: [
      {
        id: 'sibling-leaf',
        href: 'chapter.xhtml#discussion',
        label: '讨论',
      },
    ],
  },
]);
if (
  nestedToc.length !== 4 ||
  nestedToc.some((item) => item.href === '') ||
  nestedToc[0]?.href !== 'chapter.xhtml#intro' ||
  nestedToc[0]?.level !== 1 ||
  nestedToc[1]?.href !== 'chapter.xhtml#method' ||
  nestedToc[1]?.level !== 2 ||
  nestedToc[2]?.href !== 'chapter.xhtml#result' ||
  nestedToc[2]?.level !== 3 ||
  nestedToc[3]?.href !== 'chapter.xhtml#discussion' ||
  nestedToc[3]?.level !== 1 ||
  nestedToc[0]?.parentIds.length !== 1 ||
  nestedToc[1]?.parentIds.length !== 2 ||
  nestedToc[2]?.parentIds.length !== 3 ||
  nestedToc[3]?.parentIds.length !== 1 ||
  nestedToc[0]?.parentIds[0] === nestedToc[3]?.parentIds[0]
) {
  throw new Error('EPUB TOC omitted-container sibling/depth fixture failed');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      scope: 'READ-04-static',
      pdf: 'saved annotation text-layer replay',
      epub: 'navigation projection + CFI annotations.highlight',
      pdfOffsetFixture: 'exact start/end parsing + malformed/out-of-bounds/quote fallback',
      epubTocFixture: 'nested items + hidden sibling containers with preserved parent paths',
      unresolved: 'explicitly unavailable in AnnotationPanel and Reader handoff banner',
      browserInteraction: 'pending-runtime',
    },
    null,
    2,
  ),
);
