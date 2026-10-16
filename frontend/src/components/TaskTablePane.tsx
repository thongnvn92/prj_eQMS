// Cột Bảng phân cấp (Tree) - dung chung `visibleRows` voi GanttPane.
import { Children, isValidElement } from 'react';
import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react';
import type { TableColumnsType, TableProps } from 'antd';
import { Table, Typography } from 'antd';
import TaskRow from './TaskRow';
import { durationDays } from './widgets';
import type { VisibleRow } from '../store/slices/flattenTree';
import type { Phase } from '../mock/types';

export interface TaskTablePaneProps {
  rows: VisibleRow[];
  phases: Phase[];
  people: { id: number; fullName: string }[];
  expandedIds: number[];
  onExpand: (id: number, expanded: boolean) => void;
  onSelect: (id: number | null) => void;
  onFocus: (id: number) => void;
  selectionId: number | null;
  focusedId: number | null;
  onMoveSibling: (row: VisibleRow, dir: -1 | 1) => void;
  isLoading: boolean;
  tableScrollX: number;
  bars: Record<number, { left: number; width: number } | null>;
}

export default function TaskTablePane({
  rows,
  phases,
  people,
  expandedIds,
  onExpand,
  onSelect,
  onFocus,
  selectionId,
  focusedId,
  onMoveSibling,
  isLoading,
  tableScrollX,
  bars,
}: TaskTablePaneProps) {
  const getOwner = (record: VisibleRow): string =>
    record.ownerId !== null && people.find((p) => p.id === record.ownerId)
      ? people.find((p) => p.id === record.ownerId)!.fullName
      : '—';

  const getBar = (record: VisibleRow): { left: number; width: number } | null => bars[record.id] ?? null;

  const columns: TableColumnsType<VisibleRow> = [
    { title: 'WBS', dataIndex: 'wbs', width: 80, sorter: (a, b) => a.wbs.localeCompare(b.wbs) },
    { title: 'Công việc', dataIndex: 'name', width: 200, ellipsis: true },
    { title: 'Giai đoạn', dataIndex: 'phaseId', width: 140, ellipsis: true },
    { title: 'Bắt đầu', dataIndex: 'startDate', width: 95, sorter: (a, b) => a.startDate.localeCompare(b.startDate) },
    { title: 'Kết thúc', dataIndex: 'dueDate', width: 95, sorter: (a, b) => a.dueDate.localeCompare(b.dueDate) },
    { title: 'SL ngày', dataIndex: 'dur', width: 75, align: 'right', sorter: (a, b) => durationDays(a) - durationDays(b) },
    { title: 'Tiến độ', dataIndex: 'progress', width: 130, sorter: (a, b) => a.progress - b.progress },
    { title: 'Trạng thái', dataIndex: 'status', width: 130, sorter: (a, b) => a.status.localeCompare(b.status) },
    { title: 'Ưu tiên', dataIndex: 'priority', width: 90, sorter: (a, b) => a.priority.localeCompare(b.priority) },
    { title: 'Phụ trách', dataIndex: 'ownerId', width: 140, ellipsis: true },
    { title: 'Timeline', dataIndex: 'timeline', width: 240 },
    { title: 'Thao tác', dataIndex: 'actions', width: 195 },
  ];

  const rowSelection: TableProps<VisibleRow>['rowSelection'] = {
    type: 'radio',
    onChange: (_keys, selectedRows) => {
      onSelect(selectedRows[0]?.id ?? null);
    },
  };

  /**
   * Custom body row (rc-table `components.body.row`): giữ cell antd còn sót
   * (rowSelection / expand – luôn nằm TRƯỚC cell dữ liệu), thay cell dữ liệu
   * bằng TaskRow – component tự render toàn bộ 12 <td> của một hàng.
   */
  const bodyRow = (props: { children?: ReactNode; className?: string; style?: CSSProperties }): ReactElement => {
    const { children, className, style, ...rest } = props;
    const cells = Children.toArray(children).filter(isValidElement) as ReactElement<{ record?: VisibleRow }>[];
    const leadingCells = cells.slice(0, Math.max(0, cells.length - columns.length));
    const record = cells.find((cell) => cell.props.record)?.props.record;
    if (!record) {
      return <tr className={className} style={style}>{children}</tr>;
    }
    return (
      <tr className={className} style={style} {...(rest as HTMLAttributes<HTMLTableRowElement>)}>
        {leadingCells}
        <TaskRow
          row={record}
          phases={phases}
          ownerName={getOwner(record)}
          bar={getBar(record)}
          isSelected={record.id === selectionId}
          isFocused={record.id === focusedId}
          onEdit={() => undefined}
          onDelete={() => undefined}
          onMoveSibling={onMoveSibling}
          onSub={() => undefined}
        />
      </tr>
    );
  };

  return (
    <Table<VisibleRow>
      components={{ body: { row: bodyRow } }}
      rowKey='id'
      size='small'
      loading={isLoading}
      pagination={false}
      dataSource={rows}
      columns={columns}
      expandedRowKeys={expandedIds}
      onExpand={(expanded, record) => onExpand(record.id, expanded)}
      rowSelection={rowSelection}
      scroll={{ x: tableScrollX }}
      onRow={(record) => ({
        onMouseEnter: () => onFocus(record.id),
      })}
      footer={() => (
        <Typography.Text type='secondary'>
          {rows.length} công việc · {expandedIds.length} mục mở
        </Typography.Text>
      )}
    />
  );
}
