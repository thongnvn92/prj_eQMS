// Task bar (thanh tiến độ) trong cột Gantt.
import { Typography } from 'antd';
import { metaOf } from './widgets';
import type { VisibleRow } from '../store/slices/flattenTree';
import type { GanttGeometry } from '../store/slices/ganttGeometry';

export interface GanttTaskBarProps {
  row: VisibleRow;
  geometry: GanttGeometry;
  left: number;
  right: number;
  rowY: number;
  rowHeight: number;
}

export default function GanttTaskBar({ row, geometry, left, right, rowY, rowHeight }: GanttTaskBarProps) {
  const startX = dateToX(row.startDate, geometry);
  const endX = dateToX(row.dueDate, geometry);
  const width = Math.max(0, endX - startX);
  const progressWidth = Math.max(0, (row.progress / 100) * width);
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
    <div className="eqms-gantt-row" style={{ top: rowY, height: rowHeight }}>
      <div className="eqms-gantt-time" style={{ left, right }}>
        {width > 0 ? (
          <div
            className="eqms-gantt-bar"
            style={{
              left: startX,
              width,
              background: `${statusMeta.hex}26`,
              border: `1px solid ${statusMeta.hex}`,
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              className="eqms-gantt-bar-fill"
              style={{ left: startX, width: progressWidth, background: statusMeta.hex }}
            />
            {width > 44 && row.progress > 0 && row.progress < 100 && (
              <Typography.Text
                style={{
                  position: 'absolute',
                  left: startX + 4,
                  top: 2,
                  color: progressWidth >= width ? '#fff' : '#595959',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {row.progress}%
              </Typography.Text>
            )}
          </div>
        ) : null}
        {row.level >= 1 && row.childrenIds.length === 0 && (
          <Typography.Text style={{ position: 'absolute', left: 4, top: rowY + 2, fontSize: 11 }}>
            {row.wbs}
          </Typography.Text>
        )}
      </div>
    </div>
  );
}

function dateToX(dateStr: string, geometry: GanttGeometry): number {
  const ms = new Date(`${dateStr}T00:00:00`).getTime();
  if (Number.isNaN(ms)) return 0;
  return ((ms - geometry.timelineStart) / 86400000) * geometry.pixelsPerDay;
}
