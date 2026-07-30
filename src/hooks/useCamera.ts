/**
 * useCamera - WebRTC 摄像头流与检测状态
 * 所属：B · 个人仪表盘 / E · 阅读界面
 * 规范参考：UI_spec.md §5.2 / §9 CameraState / §13 决策7
 *
 * 所有画面与推理仅在浏览器本地处理，MediaStream 不出设备、不上传。
 */
import { useCallback, useEffect, type RefObject } from 'react';
import { toast } from '../components/common';
import { useCameraStore } from '../stores/cameraStore';
import type { CameraState, CameraStatus } from '../types';

const PRIVACY_HINT_KEY = 'xuesen-camera-privacy-hinted';

/** hook 返回值：CameraState + 控制方法与本地流 */
export interface UseCameraResult extends CameraState {
  /** 本地预览/推理用流；禁止传出设备 */
  stream: MediaStream | null;
  pipExpanded: boolean;
  /** 请求权限并开启检测 */
  startDetection: () => Promise<void>;
  pauseDetection: () => void;
  resumeDetection: () => void;
  stopDetection: () => void;
  setPreviewVisible: (visible: boolean) => void;
  setPipExpanded: (expanded: boolean) => void;
}

/**
 * 首次开启前提示隐私说明（§13 决策7）
 */
function ensurePrivacyHint(): void {
  try {
    if (localStorage.getItem(PRIVACY_HINT_KEY) === '1') return;
    localStorage.setItem(PRIVACY_HINT_KEY, '1');
  } catch {
    /* 隐私模式忽略持久化 */
  }
  toast.show('画面与推理特征完全在本地处理，不出设备');
}

/**
 * useCamera - 读写全局 cameraStore；多组件共用同一 MediaStream
 */
export function useCamera(): UseCameraResult {
  const status = useCameraStore((s) => s.status);
  const deviceId = useCameraStore((s) => s.deviceId);
  const previewVisible = useCameraStore((s) => s.previewVisible);
  const stream = useCameraStore((s) => s.stream);
  const pipExpanded = useCameraStore((s) => s.pipExpanded);
  const patch = useCameraStore((s) => s.patch);
  const setPreviewVisible = useCameraStore((s) => s.setPreviewVisible);
  const setPipExpanded = useCameraStore((s) => s.setPipExpanded);

  const startDetection = useCallback(async () => {
    const existing = useCameraStore.getState().stream;
    // 已有本地流：只恢复 track，不重新申请权限
    if (existing) {
      existing.getTracks().forEach((t) => {
        t.enabled = true;
      });
      patch({ status: 'active' });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      patch({ status: 'unavailable', stream: null, deviceId: null });
      return;
    }

    ensurePrivacyHint();

    try {
      // 仅 video、无 audio；流留在本机内存供预览与本地推理
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      const track = next.getVideoTracks()[0];
      patch({
        status: 'active' satisfies CameraStatus,
        stream: next,
        deviceId: track?.getSettings().deviceId ?? null,
        previewVisible: true,
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      // 拒绝权限 → denied；无设备/占用等 → unavailable
      patch({
        status:
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : 'unavailable',
        stream: null,
        deviceId: null,
      });
    }
  }, [patch]);

  const pauseDetection = useCallback(() => {
    const { stream: s } = useCameraStore.getState();
    // 暂停：禁用 track 而不 stop，便于快速恢复
    s?.getTracks().forEach((t) => {
      t.enabled = false;
    });
    patch({ status: 'paused' });
  }, [patch]);

  const resumeDetection = useCallback(() => {
    const { stream: s } = useCameraStore.getState();
    if (!s) {
      void startDetection();
      return;
    }
    s.getTracks().forEach((t) => {
      t.enabled = true;
    });
    patch({ status: 'active' });
  }, [patch, startDetection]);

  const stopDetection = useCallback(() => {
    const { stream: s } = useCameraStore.getState();
    s?.getTracks().forEach((t) => t.stop());
    patch({
      stream: null,
      status: 'unavailable',
      deviceId: null,
      pipExpanded: false,
    });
  }, [patch]);

  return {
    status,
    deviceId,
    previewVisible,
    stream,
    pipExpanded,
    startDetection,
    pauseDetection,
    resumeDetection,
    stopDetection,
    setPreviewVisible,
    setPipExpanded,
  };
}

/**
 * useCameraPreview - 将本地 MediaStream 绑定到单个 video（不上传）
 */
export function useCameraPreview(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
): void {
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      void el.play().catch(() => {
        /* 自动播放策略失败时忽略 */
      });
    }
    return () => {
      el.srcObject = null;
    };
  }, [videoRef, stream]);
}
