// Đường "Hôm nay" (today) trên trục thời gian cột Gantt.
import { Typography } from 'antd';
import { todayX } from '../store/slices/ganttGeometry';
import type { GanttGeometry } from '../store/slices/ganttGeometry';

export interface GanttTodayLineProps {
  geometry: GanttGeometry;
  left: number;
  right: number;
  height: number;
}

export default function GanttTodayLine({ geometry, left, right, height }: GanttTodayLineProps) {
  const x = todayX(geometry);

  return (
    <div className="eqms-gantt-today" style={{ left, right, top: 0, bottom: height }}>
      <div
        className="eqms-gantt-today-line"
        style={{ left: x }}
      >
        <div className="eqms-gantt-today-dot" />
        <div className="eqms-gantt-today-label">Hôm nay</div>
      </div>
    </div>
  );
}
