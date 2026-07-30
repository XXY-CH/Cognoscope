/**
 * Table - 数据表格（表头 sticky、行 hover）
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 Table / §4.3 / §11（table + th scope）
 */
import type { ReactNode, TableHTMLAttributes } from 'react';
import styles from './Table.module.css';

export interface TableColumn<T> {
  /** 列唯一键 */
  id: string;
  /** 表头文案 */
  header: ReactNode;
  /** 额外 class（可用 CSS Module 控制列宽） */
  className?: string;
  /** 单元格对齐 */
  align?: 'left' | 'center' | 'right';
  /** 渲染单元格 */
  cell: (row: T) => ReactNode;
}

/**
 * TableProps
 * @param aria-label - 表格无障碍名称（必填）
 * @param columns - 列定义
 * @param rows - 行数据
 * @param rowKey - 行唯一键取值函数
 * @param onRowClick - 可选行点击
 * @param emptyContent - 无数据时展示内容
 */
export interface TableProps<T> extends Omit<
  TableHTMLAttributes<HTMLTableElement>,
  'children'
> {
  'aria-label': string;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyContent?: ReactNode;
}

function alignClass(
  align: TableColumn<unknown>['align'],
  stylesMap: typeof styles,
): string {
  if (align === 'right') return stylesMap.alignRight;
  if (align === 'center') return stylesMap.alignCenter;
  return '';
}

export function Table<T>({
  'aria-label': ariaLabel,
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyContent,
  className,
  ...rest
}: TableProps<T>) {
  const classNames = [styles.root, className].filter(Boolean).join(' ');

  return (
    <div className={styles.wrap}>
      <table className={classNames} aria-label={ariaLabel} {...rest}>
        <thead className={styles.head}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={[
                  styles.th,
                  alignClass(col.align, styles),
                  col.className,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={styles.emptyCell} colSpan={columns.length}>
                {emptyContent ?? null}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={[
                  styles.row,
                  onRowClick ? styles.rowClickable : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={[
                      styles.td,
                      alignClass(col.align, styles),
                      col.className,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
