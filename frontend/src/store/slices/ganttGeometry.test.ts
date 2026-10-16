// Task 06 - Unit test Pure calculation helpers (T20) - geometry/zoom/connector.
import { describe, expect, it } from 'vitest';
import {
  zoomPixelsPerDay,
  dateToX,
  todayX,
  taskToY,
  dependencyGeometry,
  DAY_MS,
  type GanttGeometry,
} from '../../store/slices/ganttGeometry';
import type { Task } from '../../mock/types';

const mk = (over: Partial<Task> & { id: number }): Task => ({
  id: over.id,
  code: over.code ?? `MP-${String(over.id).padStart(3, '0')}`,
  name: over.name ?? `Công việc ${over.id}`,
  phaseId: over.phaseId ?? 1,
  parentId: over.parentId ?? null,
  sortOrder: over.sortOrder ?? 0,
  ownerId: over.ownerId ?? null,
  departmentId: over.departmentId ?? null,
  priority: over.priority ?? 'medium',
  status: over.status ?? 'not_started',
  progress: over.progress ?? 0,
  startDate: over.startDate ?? '2026-01-01',
  dueDate: over.dueDate ?? '2026-01-31',
  note: over.note ?? undefined,
});

const geo = (start: string, end: string, ppd: number): GanttGeometry => ({
  timelineStart: new Date(`${start}T00:00:00`).getTime(),
  timelineEnd: new Date(`${end}T00:00:00`).getTime(),
  pixelsPerDay: ppd,
  rowHeight: 34,
});

describe('zoomPixelsPerDay', () => {
  it('tính pixel/ngày từ mức zoom + chiều rộng', () => {
    expect(zoomPixelsPerDay('week', 140)).toBe(20);
    expect(zoomPixelsPerDay('month', 120)).toBeCloseTo(4);
    expect(zoomPixelsPerDay('quarter', 180)).toBeCloseTo(2);
  });
});

describe('dateToX / todayX / taskToY', () => {
  it('dateToX hoán đổi đúng pixel theo tiến trình thời gian', () => {
    const g = geo('2026-01-01', '2026-01-08', 10);
    expect(dateToX('2026-01-01', g)).toBe(0);
    expect(dateToX('2026-01-03', g)).toBeCloseTo(20);
    expect(dateToX('2026-01-08', g)).toBeCloseTo(70);
  });

  it('todayX mặc định dùng ngày hiện tại (UTC)', () => {
    const g = geo('2026-01-01', '2026-01-31', 10);
    const today = new Date().toISOString().slice(0, 10);
    const expected = ((new Date(`${today}T00:00:00`).getTime() - g.timelineStart) / DAY_MS) * g.pixelsPerDay;
    expect(todayX(g)).toBeCloseTo(expected);
  });

  it('taskToY tương ứng với thứ tự hàng', () => {
    expect(taskToY(0, 34)).toBe(0);
    expect(taskToY(3, 34)).toBe(102);
  });
});

describe('dependencyGeometry', () => {
  it('vận dụng từ cuối task trước tới đầu task sau', () => {
    const rows: Task[] = [
      mk({ id: 1, startDate: '2026-01-01', dueDate: '2026-01-04' }),
      mk({ id: 2, startDate: '2026-01-06', dueDate: '2026-01-10' }),
    ];
    const deps = [{ id: 7, predecessorTaskId: 1, successorTaskId: 2, dependencyType: 'FS', lagDays: 1 }];
    const connectors = dependencyGeometry(rows, deps, geo('2026-01-01', '2026-01-10', 10));
    expect(connectors).toHaveLength(1);
    const c = connectors[0];
    expect(c.fromId).toBe(1);
    expect(c.toId).toBe(2);
    expect(c.type).toBe('FS');
    // fromX = doDate(04) * 10px = 3*10 = 30, toX = startDate(06) * 10px = 5*10 = 50
    expect(c.fromX).toBeCloseTo(30);
    expect(c.toX).toBeCloseTo(50);
  });
});
