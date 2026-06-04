import React from 'react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  /** Render cell content. Receives the full row. */
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Optional sort accessor; enables clickable header sorting. */
  sortValue?: (row: T) => number | string;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyMessage?: string;
  /** Controlled sort state (optional). */
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  dense?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyTitle,
  emptyMessage,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  dense,
}: DataTableProps<T>) {
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle ?? 'No data'} message={emptyMessage} />;
  }

  const alignCls = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              {columns.map((col) => {
                const sortable = !!col.sortValue && !!onSort;
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-medium ${alignCls(col.align)} ${
                      sortable ? 'cursor-pointer select-none hover:text-white' : ''
                    }`}
                    onClick={sortable ? () => onSort?.(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {active && <span className="text-cyan-400">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={`border-b border-gray-900 last:border-0 transition ${
                  onRowClick ? 'cursor-pointer hover:bg-gray-800/40' : 'hover:bg-gray-800/20'
                }`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 ${dense ? 'py-2' : 'py-3'} ${alignCls(col.align)} ${col.className ?? ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
