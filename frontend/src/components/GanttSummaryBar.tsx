// Thanh tổng hợp (summary bar) cấp 0: WBS + tiến độ, kéo dài hết cột thời gian.
import { Typography } from 'antd';
import type { VisibleRow } from '../store/slices/flattenTree';
import type { GanttGeometry } from '../store/slices/ganttGeometry';

export interface GanttSummaryBarProps {
  row: VisibleRow;
  geometry: GanttGeometry;
  left: number;
  right: number;
  rowY: number;
  rowHeight: number;
}

export default function GanttSummaryBar({ row, geometry, left, right, rowY, rowHeight }: GanttSummaryBarProps) {
  const progressWidth = Math.max(0, (row.progress / 100) * (right - left));

  return (
    <div className="eqms-gantt-row" style={{ top: rowY, height: rowHeight }}>
      <div
        className="eqms-gantt-summary"
        style={{ left, right, top: 4, bottom: 4 }}
      >
        <Typography.Text strong code style={{ fontWeight: 700 }}>
          {row.wbs}
        </Typography.Text>
        <div
          className="eqms-gantt-summary-fill"
          style={{ width: progressWidth, background: '#1677ff', opacity: 0.18 }}
        />
        <div
          className="eqms-gantt-summary-bar"
          style={{ width: progressWidth, background: '#1677ff' }}
        />
        <Typography.Text style={{ marginLeft: 6, color: '#595959', fontSize: 11 }}>
          {row.name}
        </Typography.Text>
      </div>
    </div>
  );
}
