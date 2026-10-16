// Bảng cây "Master Plan ISO" – cấu trúc phân cấp tối đa 5 cấp, con thụt vào so với cha,
// thu gọn/mở rộng từng nhánh, người phụ trách cập nhật tiến độ ngay trên dòng.
import { useEffect, useState } from 'react';
import type { TableColumnsType } from 'antd';
import {
  Button, Empty, InputNumber, Progress, Space, Table, Tag, Typography,
} from 'antd';
import {
  DeleteOutlined, EditOutlined, HolderOutlined, MinusOutlined, MinusSquareOutlined, PlusOutlined, PlusSquareOutlined,
} from '@ant-design/icons';
import type { VisibleRow } from '../store/slices/flattenTree';
import type { Phase } from '../mock/types';
import { TASK_STATUS, durationDays, isTaskOverdue, metaOf } from './widgets';
import ConfirmModal from './ConfirmModal';

export interface TaskTreeTableProps {
  /** Các dòng ĐANG hiển thị (đã áp expand/collapse). */
  rows: VisibleRow[];
  /** Id các dòng CÓ con (hiện nút +/-). */
  expandableIds: Set<number>;
  expandedIds: number[];
  phases: Phase[];
  people: { id: number; fullName: string }[];
  isLoading: boolean;
  /** master_plan.create */
  canCreate: boolean;
  /** master_plan.update (Sửa / xếp lại thứ tự) */
  canEdit: boolean;
  /** master_plan.delete */
  canDelete: boolean;
  /** Owner của dòng hoặc người có master_plan.update → sửa tiến độ tại chỗ. */
  canProgress: (row: VisibleRow) => boolean;
  onToggle: (row: VisibleRow, expanded: boolean) => void;
  onEdit: (row: VisibleRow) => void;
  onDelete: (row: VisibleRow) => void;
  onSub: (row: VisibleRow) => void;
  /** Kéo–thả đổi thứ tự công việc CHA (level 0): kéo draggedId lên ngay trước targetId. */
  onReorderRoot: (draggedId: number, targetId: number) => void;
  onProgress: (row: VisibleRow, progress: number) => void;
  /** Mở rộng tất cả nhánh (nút icon ở header cột "Công việc"). */
  onExpandAll: () => void;
  /** Thu gọn tất cả nhánh (nút icon ở header cột "Công việc"). */
  onCollapseAll: () => void;
}

/** Ô cập nhật tiến độ (owner/master_plan.update) hoặc Progress chỉ đọc. */
function ProgressCell({
  row, editable, onChange,
}: {
  row: VisibleRow;
  editable: boolean;
  onChange: (progress: number) => void;
}) {
  const [local, setLocal] = useState(row.progress);
  useEffect(() => setLocal(row.progress), [row.progress]);
  const statusMeta = metaOf(TASK_STATUS, row.status);

  if (!editable) {
    return (
      <Progress percent={row.progress} size="small" strokeColor={statusMeta.hex} style={{ marginBottom: 0 }} />
    );
  }

  const commit = () => {
    const v = Math.max(0, Math.min(100, Math.round(Number(local) || 0)));
    setLocal(v);
    if (v !== row.progress) onChange(v);
  };

  return (
    <Space size={6} align='center' wrap>
      <InputNumber
        size='small'
        min={0}
        max={100}
        value={local}
        addonAfter='%'
        style={{ width: 88 }}
        aria-label={`Tiến độ ${row.code}`}
        onChange={(v) => {
          if (typeof v === 'number') setLocal(v);
        }}
        onBlur={commit}
        onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
      />
      <Progress
        percent={local}
        size='small'
        strokeColor={statusMeta.hex}
        style={{ marginBottom: 0, width: 80 }}
        showInfo={false}
      />
    </Space>
  );
}

export default function TaskTreeTable({
  rows,
  expandableIds,
  expandedIds,
  phases,
  people,
  isLoading,
  canCreate,
  canEdit,
  canDelete,
  canProgress,
  onToggle,
  onEdit,
  onDelete,
  onSub,
  onReorderRoot,
  onProgress,
  onExpandAll,
  onCollapseAll,
}: TaskTreeTableProps) {
  const expandedSet = new Set(expandedIds);
  // Kéo–thả đổi thứ tự công việc cha (level 0): dragId = dòng đang kéo, overId = dòng đích thả.
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  // Dòng đang chờ xác nhận xoá (mở ConfirmModal chung).
  const [deleteTarget, setDeleteTarget] = useState<VisibleRow | null>(null);

  const columns: TableColumnsType<VisibleRow> = [
    {
      title: (
        <Space size={4}>
          <span>Công việc</span>
          {/* Mở rộng / thu gọn toàn bộ nhánh — chỉ icon (+)/(−). */}
          <Button
            size='small'
            type='text'
            title='Mở rộng tất cả'
            aria-label='Mở rộng tất cả'
            icon={<PlusSquareOutlined />}
            onClick={onExpandAll}
          />
          <Button
            size='small'
            type='text'
            title='Thu gọn tất cả'
            aria-label='Thu gọn tất cả'
            icon={<MinusSquareOutlined />}
            onClick={onCollapseAll}
          />
        </Space>
      ),
      dataIndex: 'name',
      width: 430,
      render: (_, row) => (
        <div style={{ paddingLeft: row.level * 24, display: 'flex', gap: 6, minWidth: 0 }}>
          {canEdit && row.level === 0 && (
            <HolderOutlined
              className='eqms-mp-drag-handle'
              title='Kéo để đổi thứ tự công việc'
              aria-label='Kéo để đổi thứ tự công việc'
              style={{ marginTop: 3 }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                try {
                  e.dataTransfer.setData('text/plain', String(row.id));
                } catch {
                  /* ignore */
                }
                setDragId(row.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
            />
          )}
          {expandableIds.has(row.id) ? (
            <Button
              size='small'
              type='text'
              aria-label={expandedSet.has(row.id) ? 'Thu gọn nhánh' : 'Mở rộng nhánh'}
              icon={expandedSet.has(row.id) ? <MinusOutlined /> : <PlusOutlined />}
              onClick={() => onToggle(row, !expandedSet.has(row.id))}
              style={{ marginTop: 3, flex: '0 0 auto' }}
            />
          ) : (
            <span style={{ width: 24, flex: '0 0 24px' }} />
          )}
          <div style={{ minWidth: 0 }}>
            <Space size={6} wrap>
              <Typography.Text code>{row.wbs}</Typography.Text>
              <Typography.Text strong={row.level === 0}>{row.name}</Typography.Text>
              <Tag style={{ marginInlineEnd: 0 }}>{row.code}</Tag>
            </Space>
            <div className='eqms-mp-task-sub'>
              <span>{phases.find((p) => p.id === row.phaseId)?.name ?? '—'}</span>
              {isTaskOverdue(row) && <Tag color='red' style={{ marginInlineEnd: 0 }}>Quá hạn</Tag>}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Thời gian',
      dataIndex: 'startDate',
      width: 200,
      render: (_, row) => (
        <div>
          <div>{row.startDate} → {row.dueDate}</div>
          <div className='eqms-mp-task-sub'>{durationDays(row)} ngày</div>
        </div>
      ),
    },
    {
      title: 'Phụ trách',
      dataIndex: 'ownerId',
      width: 140,
      ellipsis: true,
      render: (_, row) =>
        row.ownerId !== null ? people.find((p) => p.id === row.ownerId)?.fullName ?? '—' : '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (_, row) => {
        const m = metaOf(TASK_STATUS, row.status);
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: 'Tiến độ',
      dataIndex: 'progress',
      width: 195,
      render: (_, row) => (
        <ProgressCell row={row} editable={canProgress(row)} onChange={(v) => onProgress(row, v)} />
      ),
    },
    {
      title: 'Thao tác',
      dataIndex: 'actions',
      width: 205,
      render: (_, row) => (
        <Space size={4} wrap>
          {canEdit && (
            <Button size='small' icon={<EditOutlined />} onClick={() => onEdit(row)}>
              Sửa
            </Button>
          )}
          {canCreate && row.level < 4 && (
            <Button size='small' icon={<PlusOutlined />} onClick={() => onSub(row)}>
              Thêm việc con
            </Button>
          )}
          {canDelete && (
            <Button size='small' danger icon={<DeleteOutlined />} onClick={() => setDeleteTarget(row)} />
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
    <Table<VisibleRow>
      rowKey='id'
      size='small'
      loading={isLoading}
      rowClassName={(record) =>
        dragId === record.id
          ? 'eqms-mp-row-dragging'
          : overId === record.id && dragId != null && dragId !== record.id
            ? 'eqms-mp-row-dropover'
            : ''
      }
      onRow={(record) => {
        // Dòng là ĐÍCH THẢ; chỉ công việc CHA (level 0) nhận drop. Việc kéo bắt đầu từ icon drag handle.
        const droppable = canEdit && record.level === 0;
        return {
          onDragOver: (e) => {
            if (!droppable || dragId == null || dragId === record.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOverId(record.id);
          },
          onDragLeave: () => setOverId((prev) => (prev === record.id ? null : prev)),
          onDrop: (e) => {
            e.preventDefault();
            if (dragId != null && droppable && dragId !== record.id) {
              onReorderRoot(dragId, record.id);
            }
            setDragId(null);
            setOverId(null);
          },
        };
      }}
      // Paging 50 công việc/trang (mặc định), cho đổi cỡ trang + nhảy trang nhanh.
      pagination={{
        pageSize: 50,
        showSizeChanger: true,
        pageSizeOptions: ['50', '100', '200'],
        showQuickJumper: true,
        size: 'small',
        showTotal: (total, range) => `${range[0]}–${range[1]} / ${total} công việc`,
      }}
      dataSource={rows}
      columns={columns}
      scroll={{ x: 1300 }}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description='Không có công việc trong kế hoạch này'
          />
        ),
      }}
    />
      {/* Xoá công việc: modal xác nhận dùng chung (ConfirmModal) thay cho Popconfirm. */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Xác nhận xóa công việc"
        okText="Xoá"
        danger
        content={
          <>
            Bạn có chắc muốn xóa công việc <Typography.Text strong>{deleteTarget?.code}</Typography.Text> ({deleteTarget?.name})?
            <br />
            Toàn bộ công việc con cũng sẽ bị xóa. Thao tác này không thể hoàn tác.
          </>
        }
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}