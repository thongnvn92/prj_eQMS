// Geometry + pure coordinate calculation – DMC eQMS Master Plan (Gantt)
// Tất cả hàm chỉ lấy số học thô, không phụ thuộc DOM/React → test dễ.
import type { Task, TaskStatus, Priority } from '../../mock/types';

/** 1 ngày (ms). */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Số cấp WBS tối đa (0..4 tương ứng 1..5 cấp cây). */
export const MAX_WBS_LEVEL = 5;

/** Zoom mặc định khi chưa lưu. */
export const DEFAULT_ZOOM = 'week' as Zoom;

/** Khoảng thời gian minh họa của mỗi mức zoom (ngày). */
export const ZOOM_SPANS: Record<Zoom, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

/** Tỷ lệ chia sẻ mặc định (vế phải / vế trái) khi lưu localStorage. */
export const DEFAULT_SPLIT_RATIO = 0.45;

/** Chiều cao 1 hàng công việc trong cột Gantt (px). */
export const ROW_HEIGHT = 34;

/** Chiều cao cột header (px). */
export const HEADER_HEIGHT = 34;

export type Zoom = 'week' | 'month' | 'quarter';

/** Mô hình tọa độ trục Gantt cố định cho cả hai panel. */
export interface GanttGeometry {
  /** Thời điểm đầu (epoch ms) của trục, lấy từ min(startDate). */
  timelineStart: number;
  /** Thời điểm cuối (epoch ms) của trục, lấy từ max(dueDate), luôn >= timelineStart. */
  timelineEnd: number;
  /** Số pixel biểu diễn 1 ngày tại mức zoom hiện tại. */
  pixelsPerDay: number;
  /** Chiều cao 1 hàng trong cột Gantt (px). */
  rowHeight: number;
}

/** Thông tin phụ thuộc (nếu có / đã nạp từ backend) để vẽ đường kết nối. */
export interface TaskDependency {
  id: number;
  predecessorTaskId: number;
  successorTaskId: number;
  dependencyType: string; // 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number;
}

/** Đường kết nối phụ thuộc giữa 2 task, dùng trong lớp SVG overlay thường. */
export interface DependencyConnector {
  id: number;
  fromId: number;
  toId: number;
  type: string;
  lagDays: number;
  /** Tọa độ x (px) của đầu ra trong khung thời gian (from = cuối task trước, to = đầu task sau). */
  fromX: number;
  toX: number;
  fromY: number;
  toY: number;
}

/**
 * Tính giá trị pixel/ngày từ mức zoom + chiều rộng khu vực thời gian.
 * Không phụ thuộc DOM.
 */
export function zoomPixelsPerDay(zoom: Zoom, ganttWidth: number): number {
  const spanDays = ZOOM_SPANS[zoom];
  if (!spanDays || ganttWidth <= 0) return 1;
  return ganttWidth / spanDays;
}

/**
 * Lát tọa độ thời gian thành pixel trục Gantt.
 * `dateStr` có mẫu `YYYY-MM-DD`, được parse thành 00:00:00 ngày cục bộ.
 */
export function dateToX(dateStr: string, geometry: GanttGeometry): number {
  const ms = new Date(`${dateStr}T00:00:00`).getTime();
  if (Number.isNaN(ms)) return 0;
  return ((ms - geometry.timelineStart) / DAY_MS) * geometry.pixelsPerDay;
}

/**
 * Tọa độ y (px) của task theo thứ tự `index` trong mảng flattened `VisibleRow[]` (DFS).
 * `rowHeight` có thể bằng `geometry.rowHeight`.
 */
export function taskToY(index: number, rowHeight: number): number {
  return index * rowHeight;
}

/**
 * Tọa độ x của ngày `todayStr` (mặc định là ISO today UTC, khớp `isTaskOverdue`).
 * Dùng để vẽ đường "Hôm nay".
 */
export function todayX(geometry: GanttGeometry, todayStr: string = new Date().toISOString().slice(0, 10)): number {
  return dateToX(todayStr, geometry);
}

/** Vận dụng thông tin phụ thuộc thành bản đồ tọa độ để vẽ connector (nếu dữ liệu có). */
export function dependencyGeometry(
  rows: readonly Task[],
  dependencies: readonly TaskDependency[],
  geometry: GanttGeometry,
): DependencyConnector[] {
  const byId = new Map<number, number>();
  rows.forEach((task, idx) => {
    byId.set(task.id, idx);
  });

  const connectors: DependencyConnector[] = [];
  for (const dep of dependencies) {
    const fromIdx = byId.get(dep.predecessorTaskId);
    const toIdx = byId.get(dep.successorTaskId);
    if (fromIdx === undefined || toIdx === undefined) continue;

    const fromRow = rows[fromIdx];
    const toRow = rows[toIdx];

    // Đầu trả = cuối task trước (predecessor), đầu vào = đầu task sau (successor).
    const fromX = dateToX(fromRow.dueDate, geometry);
    const toX = dateToX(toRow.startDate, geometry);
    const fromY = taskToY(fromIdx, geometry.rowHeight);
    const toY = taskToY(toIdx, geometry.rowHeight);

    connectors.push({
      id: dep.id,
      fromId: dep.predecessorTaskId,
      toId: dep.successorTaskId,
      type: dep.dependencyType,
      lagDays: dep.lagDays,
      fromX,
      toX,
      fromY,
      toY,
    });
  }

  return connectors;
}


// Cấu hình cột hiển thị trong cột Gantt.
export interface GanttColumn {
  key: string;
  title: string;
  width: number;
  left: number;
}

export const GANTT_COLUMNS: GanttColumn[] = [
  { key: 'wbs', title: 'WBS', width: 64, left: 0 },
  { key: 'name', title: 'Công việc', width: 200, left: 64 },
  { key: 'phase', title: 'Giai đoạn', width: 140, left: 264 },
  { key: 'start', title: 'Bắt đầu', width: 95, left: 404 },
  { key: 'due', title: 'Kết thúc', width: 95, left: 500 },
  { key: 'dur', title: 'SL ngày', width: 75, left: 595 },
  { key: 'progress', title: 'Tiến độ', width: 120, left: 670 },
  { key: 'status', title: 'Trạng thái', width: 100, left: 790 },
  { key: 'priority', title: 'Ưu tiên', width: 90, left: 890 },
  { key: 'owner', title: 'Phụ trách', width: 140, left: 980 },
  { key: 'gantt', title: 'Timeline', width: 220, left: 1120 },
];

/** Tổng chiều rộng các cột nhãn bên trái (vị trí khung thời gian bắt đầu). */
export const GANTT_LABEL_COLS_WIDTH = GANTT_COLUMNS.reduce((sum, col) => sum + col.width, 0);

/** Vị trí lề bên trái của khung thời gian so với canvas Gantt. */
export const GANTT_TIME_LEFT = GANTT_LABEL_COLS_WIDTH;


/** Fields gán cho công việc (được gửi qua form tạo/Sửa task). */
export type TaskFormValues = {
  code: string;
  name: string;
  phaseId: number;
  parentId?: number | null;
  ownerId?: number | null;
  departmentId?: number | null;
  priority: Priority;
  startDate: string;
  dueDate: string;
  note?: string;
};

/** Fields gán cho kế hoạch tổng thể (thêm/Sửa Master Plan). */
export interface PlanFormValues {
  code: string;
  name: string;
  cycleLabel: string;
  startDate: string;
  endDate: string;
  description?: string;
}
