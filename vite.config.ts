/**
 * Vite 配置
 * React 插件；后续可扩展 PDF.js worker / 路径别名
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
