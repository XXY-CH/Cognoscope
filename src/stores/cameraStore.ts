/**
 * cameraStore - 摄像头检测全局共享状态（MediaStream 单例，跨仪表盘/阅读器）
 * 所属：B · 个人仪表盘 / E · 阅读界面
 * 规范参考：UI_spec.md §5.2 / §9 CameraState / §13 决策7
 *
 * 业务操作（getUserMedia / 启停）由 useCamera hook 负责，本 store 只存状态。
 */
import { create } from 'zustand';
import type { CameraState, CameraStatus } from '../types';

interface CameraStore extends CameraState {
  /** 本地 MediaStream；画面不出设备，仅用于预览与本地推理 */
  stream: MediaStream | null;
  /** 画中画是否展开（仪表盘预览） */
  pipExpanded: boolean;
  setStatus: (status: CameraStatus) => void;
  setDeviceId: (deviceId: string | null) => void;
  setPreviewVisible: (visible: boolean) => void;
  setPipExpanded: (expanded: boolean) => void;
  setStream: (stream: MediaStream | null) => void;
  /** 批量写入，避免多次订阅抖动 */
  patch: (partial: Partial<CameraStore>) => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  status: 'unavailable',
  deviceId: null,
  previewVisible: true,
  stream: null,
  pipExpanded: false,

  setStatus: (status) => set({ status }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setPreviewVisible: (previewVisible) => set({ previewVisible }),
  setPipExpanded: (pipExpanded) => set({ pipExpanded }),
  setStream: (stream) => set({ stream }),
  patch: (partial) => set(partial),
}));
