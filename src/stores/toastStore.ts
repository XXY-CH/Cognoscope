/**
 * toastStore - 全局 Toast 队列
 * 所属：通用组件库 Toast
 * 规范参考：UI_spec.md §3 Toast
 */
import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  /** 是否显示关闭按钮（错误型强制为 true） */
  closable: boolean;
  /** 自动消失毫秒数：默认 3000，错误 6000 */
  durationMs: number;
  /** 可选操作（如「撤销」） */
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toasts: ToastItem[];
  push: (input: {
    message: string;
    tone?: ToastTone;
    actionLabel?: string;
    onAction?: () => void;
    durationMs?: number;
  }) => string;
  dismiss: (id: string) => void;
}

let toastSeq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: ({ message, tone = 'info', actionLabel, onAction, durationMs }) => {
    const id = `toast-${Date.now()}-${toastSeq++}`;
    // 错误型默认 6s 且可关闭；其它 3s
    const isError = tone === 'error';
    const item: ToastItem = {
      id,
      message,
      tone,
      closable: isError,
      durationMs: durationMs ?? (isError ? 6000 : 3000),
      actionLabel,
      onAction,
    };
    set({ toasts: [...get().toasts, item] });
    return id;
  },

  dismiss: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** 命令式调用入口，便于非组件逻辑触发 toast */
export const toast = {
  show: (message: string, tone: ToastTone = 'info') =>
    useToastStore.getState().push({ message, tone }),
  success: (message: string) =>
    useToastStore.getState().push({ message, tone: 'success' }),
  warning: (message: string) =>
    useToastStore.getState().push({ message, tone: 'warning' }),
  error: (message: string) =>
    useToastStore.getState().push({ message, tone: 'error' }),
  withAction: (
    message: string,
    actionLabel: string,
    onAction: () => void,
    tone: ToastTone = 'info',
  ) =>
    useToastStore.getState().push({
      message,
      tone,
      actionLabel,
      onAction,
      durationMs: 5000, // 含撤销的提示默认 5s（§4.3）
    }),
};
