// Header đỉnh của cột Gantt (cố định khi cuộn dọc), vẽ nhãn các cột thời gian.
import { Typography } from 'antd';
import type { GanttColumn } from '../store/slices/ganttGeometry';

export interface GanttHeaderProps {
  columns: GanttColumn[];
}

export default function GanttHeader({ columns }: GanttHeaderProps) {
  return (
    <div className="eqms-gantt-header">
      <div className="eqms-gantt-header-row">
        {columns.map((col) => (
          <div
            key={col.key}
            className="eqms-gantt-header-cell"
            style={{
              left: col.left,
              width: col.width,
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {col.title}
            </Typography.Text>
          </div>
        ))}
        <div className="eqms-gantt-header-cell eqms-gantt-header-time">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            Timeline
          </Typography.Text>
        </div>
      </div>
    </div>
  );
}
