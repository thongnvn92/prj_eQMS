// Lưới chéo thời gian dọc (vertical ruler) của cột Gantt.
import { useMemo } from 'react';
import { dateToX } from '../store/slices/ganttGeometry';
import type { GanttGeometry } from '../store/slices/ganttGeometry';

function toDateStr(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface GanttGridProps {
  /** Vị trí lề bên trái của cột thời gian trong canvas (px). */
  left: number;
  /** Vị trí lề bên phải của cột thời gian (px). */
  right: number;
  height: number;
  geometry: GanttGeometry;
}

export default function GanttGrid({ left, right, height, geometry }: GanttGridProps) {
  const days = useMemo(() => {
    const days: number[] = [];
    const d = new Date(geometry.timelineStart);
    const end = new Date(geometry.timelineEnd);
    while (d.getTime() <= end.getTime()) {
      days.push(d.getTime());
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [geometry.timelineStart, geometry.timelineEnd]);

  return (
    <div className="eqms-gantt-grid" style={{ left, right, top: 0, bottom: height }}>
      {days.map((day) => (
        <div
          key={day}
          className="eqms-gantt-grid-line"
          style={{ left: dateToX(toDateStr(day), geometry) }}
        />
      ))}
    </div>
  );
}

