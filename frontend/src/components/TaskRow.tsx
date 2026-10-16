// Row content (cells) của một task – dùng cho bảng Tree & Gantt list 뷰를 공유.
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  Space, Tag, Typography, Tooltip, Progress, Popconfirm, Button,
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined, EditOutlined, PlusOutlined,
} from '@ant-design/icons';
import { metaOf, isTaskOverdue, durationDays } from './widgets';
import type { VisibleRow } from '../store/slices/flattenTree';
import type { Phase } from '../mock/types';
import { useAuth } from '../auth/AuthContext';

interface TaskRowProps {
  row: VisibleRow;
  phases: Phase[];
  ownerName: string;
  /** Progress bar nằm trong Timeline cell (giữ thói quen cũ). */
  bar: { left: number; width: number } | null;
  isSelected: boolean;
  isFocused: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveSibling: (row: VisibleRow, dir: -1 | 1) => void;
  onSub: () => void;
}

export default function TaskRow({
  row, phases, ownerName, bar, isSelected, isFocused, onEdit, onDelete, onMoveSibling, onSub,
}: TaskRowProps) {
  const { can } = useAuth();

  const Cell = ({
    children,
    className,
    style,
  }: {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
  }) => (
    <td className={className} style={style}>{children}</td>
  );

  const statusMeta = metaOf(
    {
      not_started: { label: 'Chưa thực hiện', color: 'default', hex: '#8c8c8c' },
      in_progress: { label: 'Đang thực hiện', color: 'processing', hex: '#1677ff' },
      blocked: { label: 'Bị chặn', color: 'warning', hex: '#faad14' },
      delayed: { label: 'Trễ hạn', color: 'orange', hex: '#fa8c16' },
      completed: { label: 'Hoàn thành', color: 'success', hex: '#52c41a' },
      cancelled: { label: 'Đã hủy', color: 'default', hex: '#bfbfbf' },
    },
    row.status,
  );

  const overdue = isTaskOverdue(row);

  return (
    <>
      <Cell style={{ width: 80 }}>
        <Typography.Text code>{row.wbs}</Typography.Text>
      </Cell>
      <Cell style={{ width: 200 }}>
        <Space size={6} wrap>
          <Typography.Text strong={row.level === 0}>{row.name}</Typography.Text>
          <Tag>{row.code}</Tag>
          {row.level > 0 && <Tag color="geekblue">sub</Tag>}
        </Space>
      </Cell>
      <Cell style={{ width: 140 }}>
        <Tooltip title={row.name}>{phases.find((p) => p.id === row.phaseId)?.name ?? '—'}</Tooltip>
      </Cell>
      <Cell style={{ width: 95 }}>{row.startDate}</Cell>
      <Cell style={{ width: 95 }}>{row.dueDate}</Cell>
      <Cell style={{ width: 75, textAlign: 'right' }}>{durationDays(row)}</Cell>
      <Cell style={{ width: 130 }}>
        <Progress percent={row.progress} size="small" strokeColor={statusMeta.hex} style={{ marginBottom: 0 }} />
      </Cell>
      <Cell style={{ width: 130 }}>
        <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
      </Cell>
      <Cell style={{ width: 90 }}>{row.priority}</Cell>
      <Cell style={{ width: 140 }}>{ownerName}</Cell>
      <Cell style={{ width: 240, position: 'relative', height: 16 }}>
        {bar ? (
          <>
            <div
              style={{
                position: 'absolute',
                left: `${bar.left}%`,
                width: `${bar.width}%`,
                top: 2,
                bottom: 2,
                background: `${statusMeta.hex}26`,
                border: `1px solid ${statusMeta.hex}`,
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${row.progress}%`,
                  height: '100%',
                  background: statusMeta.hex,
                  opacity: 0.75,
                }}
              />
            </div>
          </>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )}
      </Cell>
      <Cell style={{ width: 195 }}>
        <Space size={4} wrap>
          {can('master_plan.update') && (
            <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
              Sửa
            </Button>
          )}
          {can('master_plan.create') && row.level < 4 && (
            <Button size="small" onClick={onSub}>
              <PlusOutlined /> Sub
            </Button>
          )}
          {can('master_plan.update') && (
            <>
              <Button size="small" icon={<ArrowUpOutlined />} title="Lên" onClick={() => onMoveSibling(row, -1)} />
              <Button size="small" icon={<ArrowDownOutlined />} title="Xuống" onClick={() => onMoveSibling(row, 1)} />
            </>
          )}
          {can('master_plan.delete') && (
            <Popconfirm
              title={`Xóa "${row.code}" (kèm công việc con)?`}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={onDelete}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      </Cell>
    </>
  );
}
