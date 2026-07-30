/**
 * usePanelResize - 水平/垂直拖拽改变面板尺寸
 * 所属：E · 阅读界面
 * 规范参考：UI_spec.md §8.1 / §8.4 / §8.6
 */
import { useCallback, useRef, type PointerEvent } from 'react';

/**
 * 水平拖拽：根据 pointer 移动量回调 onDelta
 */
export function useHorizontalResize(onDelta: (deltaX: number) => void) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    dragging.current = true;
    lastX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      const dx = event.clientX - lastX.current;
      lastX.current = event.clientX;
      if (dx !== 0) onDelta(dx);
    },
    [onDelta],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}

/**
 * 垂直拖拽：用于 SidePanel QA/批注分隔
 */
export function useVerticalResize(onDelta: (deltaY: number) => void) {
  const dragging = useRef(false);
  const lastY = useRef(0);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    dragging.current = true;
    lastY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      const dy = event.clientY - lastY.current;
      lastY.current = event.clientY;
      if (dy !== 0) onDelta(dy);
    },
    [onDelta],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
