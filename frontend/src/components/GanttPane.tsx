// Cột Gantt – header/grid/bar/connector + today line, dùng chung `visibleRows`.
import { useEffect, useMemo, useRef } from 'react';
import { Select, Tag, Typography } from 'antd';
import { GANTT_COLUMNS, GANTT_LABEL_COLS_WIDTH, GANTT_TIME_LEFT, HEADER_HEIGHT } from '../store/slices/ganttGeometry';
import { expandVisibleRows } from '../store/slices/flattenTree';
import { metaOf } from './widgets';
import { TASK_STATUS } from './widgets';
import GanttHeader from './GanttHeader';
import GanttGrid from './GanttGrid';
import GanttTodayLine from './GanttTodayLine';
import GanttDependencyLayer from './GanttDependencyLayer';
import GanttTaskBar from './GanttTaskBar';
import GanttSummaryBar from './GanttSummaryBar';
import GanttMilestone from './GanttMilestone';
import type { GanttGeometry, TaskDependency, Zoom } from '../store/slices/ganttGeometry';
import type { VisibleRow } from '../store/slices/flattenTree';

export interface GanttPaneProps {
  rows: VisibleRow[];
  dependencies: TaskDependency[];
  geometry: GanttGeometry;
  expandedIds: number[];
  selectionId: number | null;
  focusedId: number | null;
  zoom: Zoom;
  scrollTop: number;
  onScroll: (top: number) => void;
  onZoom: (zoom: Zoom) => void;
  onRowClick?: (id: number) => void;
}

export default function GanttPane({
  rows,
  dependencies,
  geometry,
  expandedIds,
  selectionId,
  focusedId,
  zoom,
  scrollTop,
  onScroll,
  onZoom,
  onRowClick,
}: GanttPaneProps) {
  const shownRows = useMemo(() => expandVisibleRows(rows, expandedIds), [rows, expandedIds]);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Đồng bộ scrollTop từ bên ngoài (bảng bên trái) → canvas Gantt.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollTop !== scrollTop) el.scrollTop = scrollTop;
  }, [scrollTop]);
  const timeSpanDays = (geometry.timelineEnd - geometry.timelineStart) / 86400000;
  const timeRowWidth = Math.max(0, timeSpanDays * geometry.pixelsPerDay);
  const bodyWidth = GANTT_LABEL_COLS_WIDTH + timeRowWidth;
  const contentHeight = shownRows.length * geometry.rowHeight;

  return (
    <div className="eqms-gantt">
      <div className="eqms-gantt-toolbar">
        <Select
          value={zoom}
          style={{ width: 96 }}
          onChange={onZoom}
          options={Object.entries({ week: 'Tuần', month: 'Tháng', quarter: 'Quý' }).map(([v, l]) => ({ value: v, label: l }))}
        />
        <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
          {new Date(geometry.timelineStart).toLocaleDateString('vi-VN')} → {new Date(geometry.timelineEnd).toLocaleDateString('vi-VN')}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ marginLeft: 8 }}>{shownRows.length} công việc</Typography.Text>
      </div>

      <div className="eqms-gantt-scroll" ref={scrollRef} style={{ height: '100%', overflow: 'auto' }} onScroll={(e) => onScroll(e.currentTarget.scrollTop)}>
        <div className="eqms-gantt-canvas" style={{ position: 'relative', width: bodyWidth, height: contentHeight }}>
          <div className="eqms-gantt-header" style={{ position: 'sticky', top: 0, zIndex: 2, height: HEADER_HEIGHT }}>
            <GanttHeader columns={GANTT_COLUMNS} />
          </div>

          <div className="eqms-gantt-content" style={{ position: 'absolute', top: HEADER_HEIGHT, left: 0, right: 0, bottom: 0 }}>
            <div className="eqms-gantt-rows" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              {shownRows.map((row, idx) => (
                <div
                  key={row.id}
                  className={`eqms-gantt-row${row.id === selectionId ? ' eqms-row-selected' : ''}${row.id === focusedId ? ' eqms-row-focused' : ''}`}
                  style={{ height: geometry.rowHeight }}
                  onClick={() => onRowClick?.(row.id)}
                >
                  <div className="eqms-gantt-row-label" style={{ width: GANTT_LABEL_COLS_WIDTH }}>
                    <div className="eqms-gantt-row-label-inner">
                      <Typography.Text code>{row.wbs}</Typography.Text>
                      <Typography.Text style={{ color: '#374151', fontSize: 12 }}>{row.name}</Typography.Text>
                      <Tag color={metaOf(TASK_STATUS, row.status).color} style={{ marginLeft: 6 }}>{metaOf(TASK_STATUS, row.status).label}</Tag>
                    </div>
                  </div>
                  <div className="eqms-gantt-row-time" style={{ flex: 1, minWidth: 0 }}>
                    {row.level === 0 ? (
                      <GanttSummaryBar row={row} geometry={geometry} left={0} right={timeRowWidth} rowY={idx * geometry.rowHeight} rowHeight={geometry.rowHeight} />
                    ) : row.startDate === row.dueDate ? (
                      <GanttMilestone row={row} geometry={geometry} left={0} right={timeRowWidth} rowY={idx * geometry.rowHeight} />
                    ) : (
                      <GanttTaskBar row={row} geometry={geometry} left={0} right={timeRowWidth} rowY={idx * geometry.rowHeight} rowHeight={geometry.rowHeight} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="eqms-gantt-overlay" style={{ position: 'absolute', left: GANTT_TIME_LEFT, right: GANTT_TIME_LEFT + timeRowWidth, top: 0, bottom: contentHeight, pointerEvents: 'none', zIndex: 2 }}>
              <GanttGrid left={0} right={timeRowWidth} height={contentHeight} geometry={geometry} />
              <GanttTodayLine geometry={geometry} left={0} right={timeRowWidth} height={contentHeight} />
              <GanttDependencyLayer rows={rows} dependencies={dependencies} geometry={geometry} left={0} right={timeRowWidth} height={contentHeight} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
