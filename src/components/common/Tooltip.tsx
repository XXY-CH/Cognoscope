/**
 * Tooltip - 悬浮提示（延迟出现，portal 到 body 避免被裁切）
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 Tooltip / §1.7（延迟 400ms）
 */
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

/**
 * TooltipProps
 * @param content - 提示文案
 * @param aria-label - 提示区域无障碍名称（必填）
 * @param children - 必须是单个可聚焦/可悬停的 React 元素
 * @param placement - 出现方位
 */
export interface TooltipProps {
  content: ReactNode;
  'aria-label': string;
  children: ReactElement;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

type TriggerProps = {
  onMouseEnter?: (event: MouseEvent) => void;
  onMouseLeave?: (event: MouseEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
};

const GAP = 8;

/**
 * 相对触发器计算 fixed 坐标，使气泡脱出表格 overflow 裁切
 */
function placeTip(
  trigger: DOMRect,
  tip: DOMRect,
  placement: NonNullable<TooltipProps['placement']>,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = 0;
  let left = 0;

  switch (placement) {
    case 'bottom':
      top = trigger.bottom + GAP;
      left = trigger.left + trigger.width / 2 - tip.width / 2;
      break;
    case 'left':
      top = trigger.top + trigger.height / 2 - tip.height / 2;
      left = trigger.left - tip.width - GAP;
      break;
    case 'right':
      top = trigger.top + trigger.height / 2 - tip.height / 2;
      left = trigger.right + GAP;
      break;
    case 'top':
    default:
      top = trigger.top - tip.height - GAP;
      left = trigger.left + trigger.width / 2 - tip.width / 2;
      break;
  }

  // 贴边避让，避免再被浏览器边框裁切
  left = Math.min(Math.max(8, left), vw - tip.width - 8);
  top = Math.min(Math.max(8, top), vh - tip.height - 8);
  return { top, left };
}

export function Tooltip({
  content,
  'aria-label': ariaLabel,
  children,
  placement = 'top',
}: TooltipProps) {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const timerRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = () => {
    clearTimer();
    // 规范：延迟 400ms 出现（对应 --tooltip-delay）
    timerRef.current = window.setTimeout(() => {
      setOpen(true);
    }, 400);
  };

  const hide = () => {
    clearTimer();
    setOpen(false);
    setCoords(null);
  };

  useEffect(() => () => clearTimer(), []);

  // 打开后量尺寸再定位（portal + fixed）
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = wrapRef.current?.getBoundingClientRect();
    const tip = tipRef.current?.getBoundingClientRect();
    if (!trigger || !tip) return;
    setCoords(placeTip(trigger, tip, placement));
  }, [open, placement, content]);

  if (!isValidElement(children)) {
    return children;
  }

  const childProps = children.props as TriggerProps;

  const child = cloneElement(children, {
    'aria-describedby': open ? tipId : undefined,
    onMouseEnter: (event: MouseEvent) => {
      show();
      childProps.onMouseEnter?.(event);
    },
    onMouseLeave: (event: MouseEvent) => {
      hide();
      childProps.onMouseLeave?.(event);
    },
    onFocus: (event: FocusEvent) => {
      show();
      childProps.onFocus?.(event);
    },
    onBlur: (event: FocusEvent) => {
      hide();
      childProps.onBlur?.(event);
    },
  } as Record<string, unknown>);

  const tipStyle: CSSProperties | undefined = coords
    ? {
        top: coords.top,
        left: coords.left,
        // 首帧未量到尺寸前先藏，避免闪到 (0,0)
        visibility: 'visible',
      }
    : { visibility: 'hidden', top: 0, left: 0 };

  return (
    <span ref={wrapRef} className={styles.wrap}>
      {child}
      {open
        ? createPortal(
            <span
              ref={tipRef}
              id={tipId}
              role="tooltip"
              aria-label={ariaLabel}
              className={styles.tip}
              style={tipStyle}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
