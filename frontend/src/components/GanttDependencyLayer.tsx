// Lớp SVG overlay vẽ các đường phụ thuộc (dependency connectors).
import { useMemo } from 'react';
import { dependencyGeometry } from '../store/slices/ganttGeometry';
import type { GanttGeometry, TaskDependency } from '../store/slices/ganttGeometry';
import type { VisibleRow } from '../store/slices/flattenTree';
import type { DependencyConnector } from '../store/slices/ganttGeometry';

export interface GanttDependencyLayerProps {
  rows: VisibleRow[];
  dependencies: TaskDependency[];
  geometry: GanttGeometry;
  left: number;
  right: number;
  height: number;
}

export default function GanttDependencyLayer({
  rows,
  dependencies,
  geometry,
  left,
  right,
  height,
}: GanttDependencyLayerProps) {
  const connectors = useMemo(() => {
    const map = new Map<number, number>();
    rows.forEach((row, idx) => {
      map.set(row.id, idx);
    });

    const out: DependencyConnector[] = [];
    for (const dep of dependencies) {
      const fromIdx = map.get(dep.predecessorTaskId);
      const toIdx = map.get(dep.successorTaskId);
      if (fromIdx === undefined || toIdx === undefined) continue;
      const fromRow = rows[fromIdx];
      const toRow = rows[toIdx];

      // startV = giữa hàng predecessor, endV = giữa hàng successor.
      const fromY = taskToYCenter(fromIdx, geometry.rowHeight);
      const toY = taskToYCenter(toIdx, geometry.rowHeight);

      out.push({
        id: dep.id,
        fromId: dep.predecessorTaskId,
        toId: dep.successorTaskId,
        type: dep.dependencyType,
        lagDays: dep.lagDays,
        fromX: dateToX(fromRow.dueDate, geometry),
        toX: dateToX(toRow.startDate, geometry),
        fromY,
        toY,
      });
    }
    return out;
  }, [rows, dependencies, geometry]);

  return (
    <div
      className="eqms-gantt-deps"
      style={{ left, right, top: 0, bottom: height }}
    >
      <svg
        className="eqms-gantt-deps-svg"
        style={{ position: 'absolute', left: 0, top: 0, width: right - left, height: height }}
      >
        {connectors.map((c) => (
          <g key={c.id}>
            <line
              x1={c.fromX}
              y1={c.fromY}
              x2={c.toX}
              y2={c.toY}
              stroke="#8c8c8c"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              markerEnd="url(#eqms-arrow)"
            />
            <circle cx={c.toX} cy={c.toY} r={4} fill="#e74c3c" />
          </g>
        ))}
        <defs>
          <marker
            id="eqms-arrow"
            viewBox="0 0 10 10"
            refX={8}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill="#8c8c8c" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

function taskToYCenter(index: number, rowHeight: number): number {
  return index * rowHeight + rowHeight / 2;
}

function dateToX(dateStr: string, geometry: GanttGeometry): number {
  const ms = new Date(`${dateStr}T00:00:00`).getTime();
  if (Number.isNaN(ms)) return 0;
  return ((ms - geometry.timelineStart) / 86400000) * geometry.pixelsPerDay;
}
