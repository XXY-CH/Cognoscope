/**
 * 通用组件库导出入口
 * 所属：src/components/common
 * 规范参考：UI_spec.md §3
 */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { IconButton, type IconButtonProps } from './IconButton';
export { Input, type InputProps } from './Input';
export { SearchInput, type SearchInputProps } from './SearchInput';
export { Select, type SelectProps, type SelectOption } from './Select';
export { Table, type TableProps, type TableColumn } from './Table';
export { Dialog, type DialogProps, type DialogSize } from './Dialog';
export { ToastViewport, type ToastViewportProps } from './Toast';
export { toast } from '../../stores/toastStore';
export type { ToastTone, ToastItem } from '../../stores/toastStore';
export { Skeleton, type SkeletonProps, type SkeletonVariant } from './Skeleton';
export {
  ProgressRing,
  type ProgressRingProps,
  type ProgressRingTone,
} from './ProgressRing';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { Tooltip, type TooltipProps } from './Tooltip';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Tag, type TagProps, type TagTone } from './Tag';
export { FormattedMessage, type FormattedMessageProps } from './FormattedMessage';
