// Flatten + filter calculation – DMC eQMS Master Plan (shared visibleRows source of truth)
import type { Task, TaskStatus, Priority } from '../../mock/types';
import { MAX_WBS_LEVEL } from './ganttGeometry';

/** Bộ lọc chung hiển thị (keyword / status / priority / phase). */
export interface FilterState {
  /** Mã / tên tìm kiếm (khớp code + name, không phân biệt chữ hoa ký tự). */
  keyword?: string;
  status?: TaskStatus | '';
  priority?: Priority | '';
  /** Chỉ số phase để lọc, rỗng = hiển thị tất cả. */
  phaseId?: string;
}

/** Khối suy biến của 1 task sau khi lọc + áp phích WBS + cấp/thứ tự (shared source of truth). */
export interface VisibleRow {
  id: number;
  code: string;
  name: string;
  phaseId: number;
  ownerId: number | null;
  departmentId: number | null;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  startDate: string;
  dueDate: string;
  note?: string;
  parentId: number | null;
  sortOrder: number;
  level: number; // 0..4
  wbs: string; // "1", "1.1", "1.1.2"...
  childrenIds: number[]; // chỉ số (index) của con trong arr `visibleRows`
  isExpanded: boolean;
}

/** Tùy chọn khi lát cây: cấu hình mặc định mở bao nhiêu cấp. */
export interface FlattenTreeOptions {
  defaultExpandLevels?: number;
}

/** Trả về bộ lọc (predicate) dùng để lọc `Task` theo bộ lọc chung (keyword/status/priority/phase). */
export function buildFilterPredicate(filters: FilterState): (task: Task) => boolean {
  return (task: Task): boolean => {
    const keyword = (filters.keyword ?? '').trim().toLowerCase();
    if (keyword) {
      const code = (task.code ?? '').toLowerCase();
      const name = (task.name ?? '').toLowerCase();
      if (!code.includes(keyword) && !name.includes(keyword)) return false;
    }
    if (filters.status) {
      if (task.status !== filters.status) return false;
    }
    if (filters.priority) {
      if (task.priority !== filters.priority) return false;
    }
    if (filters.phaseId) {
      if (String(task.phaseId) !== filters.phaseId) return false;
    }
    return true;
  };
}

/**
 * Lát cây tree thành `VisibleRow[]` (DFS, thứ tự gốc 1..n, con 1..n theo sortOrder).
 * - Lọc theo `filters`: một dòng hiển thị khi nó (hoặc con cháu) khớp bộ lọc – giữ ngữ cảnh
 *   cấp trên; subtree không liên quan keyword sẽ bị ẩn (ancestor bị lọc → con không hiển thị).
 * - Gán `level` và `wbs` theo thứ tự DFS (WBS: 1, 1.1, 1.1.2...).
 * - `childrenIds` trỏ vào index của con trong cùng mảng; cấu trúc "một mảng con cuộn" cho
 *   bảng + Gantt dùng chung `visibleRows` với code tái sử dụng không khác biệt.
 */
export function flattenVisibleTree(
  tasks: Task[],
  expandedIds: readonly number[],
  filters: FilterState = {},
  options: FlattenTreeOptions = {},
): VisibleRow[] {
  const { defaultExpandLevels = 0 } = options;
  const expanded = new Set<number>(
    expandedIds.filter((id): id is number => Number.isFinite(id as number)),
  );

  const predicate = buildFilterPredicate(filters);

  // Sắp xếp global + sibling theo sortOrder → code để đồng bộ với backend.
  const sorted = [...tasks].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      String(a.code).localeCompare(String(b.code)),
  );

  // subtreeMatch: task hoặc bất kỳ con cháu nào khớp bộ lọc (giữ ngữ cảnh cấp trên).
  const subtreeMatch = new Map<number, boolean>();
  const computeSubtreeMatch = (task: Task): boolean => {
    const cached = subtreeMatch.get(task.id);
    if (cached !== undefined) return cached;
    const children = sorted.filter((c) => c.parentId === task.id);
    const value = predicate(task) || children.some((c) => computeSubtreeMatch(c));
    subtreeMatch.set(task.id, value);
    return value;
  };
  sorted.forEach((t) => computeSubtreeMatch(t));

  const rows: VisibleRow[] = [];
  const indexOf = new Map<number, number>();

  const push = (task: Task, level: number, wbs: string, ancestorMatched: boolean): void => {
    if (level >= MAX_WBS_LEVEL) return;
    const selfMatched = predicate(task);
    // Hiển thị khi tổ tiên khớp (toàn bộ subtree của keyword) hoặc bản thân/con cháu khớp.
    if (!ancestorMatched && !subtreeMatch.get(task.id)) return;

    const node: VisibleRow = {
      id: task.id,
      code: task.code,
      name: task.name,
      phaseId: task.phaseId,
      ownerId: task.ownerId ?? null,
      departmentId: task.departmentId ?? null,
      priority: task.priority,
      status: task.status,
      progress: task.progress,
      startDate: task.startDate,
      dueDate: task.dueDate,
      note: task.note ?? undefined,
      parentId: task.parentId ?? null,
      sortOrder: task.sortOrder ?? 0,
      level,
      wbs,
      childrenIds: [],
      isExpanded: expanded.has(task.id) || level <= defaultExpandLevels,
    };

    const idx = rows.length;
    indexOf.set(task.id, idx);
    rows.push(node);

    // Con của task (sort theo backend) – push tự quyết định có hiển thị theo bộ lọc.
    const children = sorted.filter((c) => c.parentId === task.id).sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        String(a.code).localeCompare(String(b.code)),
    );

    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      const childWbs = wbs + '.' + (i + 1);
      push(child, level + 1, childWbs, ancestorMatched || selfMatched);
      const childIdx = indexOf.get(child.id);
      if (childIdx !== undefined) node.childrenIds.push(childIdx);
    }
  };

  // Cơ sở: task không có cha (hoặc cha ngoài danh sách); subtree không khớp bộ lọc → ẩn.
  const roots = sorted.filter(
    (t) => (!t.parentId || !subtreeMatch.get(t.parentId)) && subtreeMatch.get(t.id),
  );
  for (let i = 0; i < roots.length; i += 1) {
    const root = roots[i];
    push(root, 0, String(i + 1), false);
  }

  return rows;
}

/** Lọc bản sao `rows` để chỉ giữ những dòng có tất cả tổ tiên đang mở (khớp logic expand/collapse). */
export function expandVisibleRows(
  rows: readonly VisibleRow[],
  expandedIds: readonly number[],
): VisibleRow[] {
  const ids = new Set<number>(expandedIds.filter((id): id is number => Number.isFinite(id as number)));
  const byId = new Map<number, VisibleRow>(rows.map((row) => [row.id, row]));

  return rows.filter((row) => {
    if (row.level === 0) return true;
    // Chỉ hiển thị khi TẤT CẢ tổ tiên đang mở (cha đóng thì con/cháu bị ẩn theo).
    let ancestor = row.parentId;
    while (ancestor !== null && byId.has(ancestor)) {
      if (!ids.has(ancestor)) return false;
      ancestor = byId.get(ancestor)?.parentId ?? null;
    }
    return true;
  });
}

// ===================== CR Master Plan ISO – phạm vi theo kế hoạch =====================

/**
 * Phase của 1 Master Plan. Phase thiếu `masterPlanId` (mock/legacy) được coi thuộc mọi kế hoạch.
 */
export function phasesOfPlan<T extends { id: number; masterPlanId?: number }>(
  phases: readonly T[],
  planId: number | null,
): T[] {
  if (planId === null) return [...phases];
  return phases.filter((p) => p.masterPlanId == null || p.masterPlanId === planId);
}

/**
 * Task "thuộc kế hoạch": task có phase thuộc kế hoạch HOẶC kế thừa từ cha đã giữ
 * (giữ nguyên cấu trúc phân cấp cha → con, tối đa 5 cấp).
 */
export function tasksOfPlan<T extends { id: number; phaseId: number; parentId?: number | null }>(
  tasks: readonly T[],
  phases: readonly { id: number; masterPlanId?: number }[],
  planId: number | null,
): T[] {
  if (planId === null) return [...tasks];
  const phaseIds = new Set(phasesOfPlan(phases, planId).map((p) => p.id));
  const byId = new Map<number, T>(tasks.map((t) => [t.id, t]));
  const kept = new Set<number>();

  const keep = (task: T, seen: Set<number>): boolean => {
    if (kept.has(task.id)) return true;
    if (seen.has(task.id)) return false; // chống vòng lặp dữ liệu hỏng
    seen.add(task.id);
    const parent = task.parentId ? byId.get(task.parentId) : undefined;
    const ok = phaseIds.has(task.phaseId) || (!!parent && keep(parent, seen));
    if (ok) kept.add(task.id);
    return ok;
  };

  return tasks.filter((t) => keep(t, new Set<number>()));
}
