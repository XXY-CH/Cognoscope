/**
 * Vite 配置
 * React 插件；为 PDF.js 提供离线 cMap / 标准字体 / wasm 静态资源
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const pdfjsRoot = path.join(rootDir, 'node_modules/pdfjs-dist');

/** 浏览器侧 PDF.js 资源挂载点 → node_modules 目录 */
const PDFJS_ASSET_MOUNTS: Record<string, string> = {
  '/pdfjs/cmaps': path.join(pdfjsRoot, 'cmaps'),
  '/pdfjs/standard_fonts': path.join(pdfjsRoot, 'standard_fonts'),
  '/pdfjs/wasm': path.join(pdfjsRoot, 'wasm'),
};

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.bcmap')) return 'application/octet-stream';
  if (filePath.endsWith('.pfb') || filePath.endsWith('.ttf')) {
    return 'application/octet-stream';
  }
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  return 'application/octet-stream';
}

/** 开发 / preview：把 pdfjs-dist 资源挂到 /pdfjs/*，生产构建再拷入 dist */
function pdfjsAssetsPlugin(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split('?')[0] ?? '';
    for (const [prefix, dir] of Object.entries(PDFJS_ASSET_MOUNTS)) {
      if (url !== prefix && !url.startsWith(`${prefix}/`)) continue;
      const rel = decodeURIComponent(url.slice(prefix.length));
      const filePath = path.normalize(path.join(dir, rel));
      // 防止路径穿越
      if (!filePath.startsWith(dir)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      res.setHeader('Content-Type', contentTypeFor(filePath));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    next();
  };

  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    writeBundle(options) {
      const outDir = options.dir ?? path.join(rootDir, 'dist');
      for (const [prefix, dir] of Object.entries(PDFJS_ASSET_MOUNTS)) {
        const name = prefix.replace(/^\/pdfjs\//, '');
        const dest = path.join(outDir, 'pdfjs', name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.cpSync(dir, dest, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssetsPlugin()],
});
