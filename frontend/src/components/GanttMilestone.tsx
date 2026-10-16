// Đầu mốc (milestone) – thước kim bằng hình thoi ở điểm doDate.
import { Typography } from 'antd';
import { metaOf } from './widgets';
import type { VisibleRow } from '../store/slices/flattenTree';
import type { GanttGeometry } from '../store/slices/ganttGeometry';

export interface GanttMilestoneProps {
  row: VisibleRow;
  geometry: GanttGeometry;
  left: number;
  right: number;
  rowY: number;
}

export default function GanttMilestone({ row, geometry, left, right, rowY }: GanttMilestoneProps) {
  const x = dateToX(row.dueDate, geometry);
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

  return (
    <div className="eqms-gantt-row" style={{ top: rowY, height: 28 }}>
      <div style={{ position: 'relative', width: right - left, height: 28 }}>
        <div
          className="eqms-gantt-milestone"
          style={{
            left: x - 6,
            top: 6,
            width: 12,
            height: 12,
            background: statusMeta.hex,
            border: `2px solid ${statusMeta.hex}`,
          }}
        />
        <Typography.Text
          style={{
            position: 'absolute',
            left: x + 8,
            top: 8,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {row.wbs}
        </Typography.Text>
      </div>
    </div>
  );
}

function dateToX(dateStr: string, geometry: GanttGeometry): number {
  const ms = new Date(`${dateStr}T00:00:00`).getTime();
  if (Number.isNaN(ms)) return 0;
  return ((ms - geometry.timelineStart) / 86400000) * geometry.pixelsPerDay;
}
