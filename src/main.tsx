/**
 * main - 应用入口
 * 挂载 React 根节点；后续在此注入 Router / 主题 data-theme
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css'; /* 设计令牌须最先加载，来自 UI_spec.md §1 */
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
