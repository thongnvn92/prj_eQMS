// Task 06 - Ghi chép Pure calculation helpers (T20).
import { describe, expect, it } from 'vitest';
import { buildFilterPredicate, expandVisibleRows, flattenVisibleTree, phasesOfPlan, tasksOfPlan, type FilterState } from './flattenTree';
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

const tasks: Task[] = [
  mk({ id: 1, phaseId: 1, sortOrder: 0, startDate: '2026-01-01', dueDate: '2026-01-15' }),
  mk({ id: 2, phaseId: 1, sortOrder: 1, startDate: '2026-01-10', dueDate: '2026-02-01' }),
  mk({ id: 3, phaseId: 1, parentId: 1, sortOrder: 0, startDate: '2026-01-05', dueDate: '2026-01-20' }),
  mk({ id: 4, phaseId: 1, parentId: 3, sortOrder: 0, startDate: '2026-01-08', dueDate: '2026-01-25' }),
  mk({ id: 5, phaseId: 2, parentId: 2, sortOrder: 0, startDate: '2026-01-20', dueDate: '2026-02-10' }),
];

describe('buildFilterPredicate', () => {
  it('lọc theo keyword / status / priority / phaseId (AND)', () => {
    // tasks[0]: MP-001 / not_started / medium / phase 1 → khớp toàn bộ điều kiện.
    const pred = buildFilterPredicate({ keyword: 'mp-001', status: 'not_started', priority: 'medium', phaseId: '1' });
    expect(pred(tasks[0])).toBe(true);
    expect(pred(tasks[1])).toBe(false); // keyword khác (MP-002)
    expect(pred(tasks[2])).toBe(false); // keyword khác (MP-003)

    // Chỉ cần 1 điều kiện không khớp là bị loại.
    expect(buildFilterPredicate({ status: 'completed' })(tasks[0])).toBe(false);
    expect(buildFilterPredicate({ priority: 'high' })(tasks[0])).toBe(false);
    expect(buildFilterPredicate({ phaseId: '2' })(tasks[0])).toBe(false);
  });

  it('không lọc khi giá trị trống', () => {
    const pred = buildFilterPredicate({ keyword: '', status: '', priority: '', phaseId: '' });
    expect(pred(tasks[0])).toBe(true);
    expect(pred(tasks[1])).toBe(true);
  });
});

describe('flattenVisibleTree', () => {
  it('sinh DFS với WBS + level + childrenIds', () => {
    const rows = flattenVisibleTree(tasks, [], {}, { defaultExpandLevels: 2 });
    expect(rows).toHaveLength(5);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(1)!.wbs).toBe('1');
    expect(byId.get(1)!.level).toBe(0);
    expect(byId.get(3)!.wbs).toBe('1.1');
    expect(byId.get(3)!.level).toBe(1);
    expect(byId.get(4)!.wbs).toBe('1.1.1');
    expect(byId.get(4)!.level).toBe(2);
    expect(byId.get(2)!.wbs).toBe('2');
    expect(byId.get(5)!.wbs).toBe('2.1');
    expect(rows[0].childrenIds).toEqual([1]); // task1 → task3 (index 1 trong DFS)
    expect(rows[1].childrenIds).toEqual([2]); // task3 → task4 (index 2)
    expect(rows[3].childrenIds).toEqual([4]); // task2 → task5 (index 4)
  });

  it('loại bỏ con khi cha bị lọc (filter ancestor)', () => {
    const kw = buildFilterPredicate({ keyword: 'MP-001', status: '', priority: '', phaseId: '' } as FilterState);
    const rows = flattenVisibleTree(tasks, [], { keyword: 'MP-001' });
    expect(rows.map((r) => r.id)).toEqual([1, 3, 4]);
    // con của MP-001 không hiển thị vì cha ròi
    expect(rows.map((r) => r.id)).not.toContain(2);
  });

  it('mở mặc định các cấp <= defaultExpandLevels', () => {
    const rows = flattenVisibleTree(tasks, [], {}, { defaultExpandLevels: 1 });
    // Cấp <= defaultExpandLevels luôn isExpanded; cấp sâu hơn giữ nguyên (chưa mở).
    expect(rows.filter((r) => r.level <= 1).every((r) => r.isExpanded)).toBe(true);
    const deep = rows.find((r) => r.level === 2);
    expect(deep?.isExpanded).toBe(false);
  });
});

// ===================== CR Master Plan ISO – mở rộng / thu gọn nhánh =====================

describe('expandVisibleRows', () => {
  const rows = flattenVisibleTree(tasks, [], {});

  it('chưa mở nhánh nào → chỉ hiện task gốc', () => {
    expect(expandVisibleRows(rows, []).map((r) => r.id)).toEqual([1, 2]);
  });

  it('mở cha → hiện con; nhưng cháu ẩn khi con chưa mở', () => {
    // Mở task 1 → hiện 3 (con); task 4 (cháu, cha 3 chưa mở) phải ẩn.
    expect(expandVisibleRows(rows, [1]).map((r) => r.id)).toEqual([1, 3, 2]);
    // Mở cả 1 + 3 → hiện đủ nhánh 1 → 3 → 4.
    expect(expandVisibleRows(rows, [1, 3]).map((r) => r.id)).toEqual([1, 3, 4, 2]);
  });

  it('cha bị thu gọn → ẩn toàn bộ nhánh con/cháu bất kể tổ tiên cấp cao đang mở', () => {
    // Mở gốc 1 nhưng thu gọn con 3 → task 4 (cháu) không được "lọt" ra.
    expect(expandVisibleRows(rows, [1]).map((r) => r.id)).not.toContain(4);
    // Mở gốc 2 → hiện 5 (con của 2).
    expect(expandVisibleRows(rows, [2]).map((r) => r.id)).toEqual([1, 2, 5]);
  });
});

// ===================== CR Master Plan ISO – phạm vi theo kế hoạch =====================

describe('phasesOfPlan', () => {
  const phases = [
    { id: 1, masterPlanId: 1 },
    { id: 2, masterPlanId: 1 },
    { id: 3, masterPlanId: 2 },
    { id: 4 }, // mock/legacy: thiếu masterPlanId
  ];

  it('giữ phase thuộc kế hoạch + phase thiếu masterPlanId', () => {
    expect(phasesOfPlan(phases, 1).map((p) => p.id)).toEqual([1, 2, 4]);
    expect(phasesOfPlan(phases, 2).map((p) => p.id)).toEqual([3, 4]);
  });

  it('planId = null → giữ tất cả', () => {
    expect(phasesOfPlan(phases, null)).toHaveLength(4);
  });
});

describe('tasksOfPlan', () => {
  const phases = [
    { id: 1, masterPlanId: 1 },
    { id: 2, masterPlanId: 2 },
  ];

  it('chỉ giữ task có phase thuộc kế hoạch', () => {
    const list = [
      mk({ id: 1, phaseId: 1 }),
      mk({ id: 2, phaseId: 2 }),
    ];
    expect(tasksOfPlan(list, phases, 1).map((t) => t.id)).toEqual([1]);
    expect(tasksOfPlan(list, phases, 2).map((t) => t.id)).toEqual([2]);
  });

  it('giữ con kế thừa từ cha đã giữ (phòng khi con lệch phase)', () => {
    const list = [
      mk({ id: 1, phaseId: 1 }),          // plan 1
      mk({ id: 2, phaseId: 1, parentId: 1 }),
      mk({ id: 3, phaseId: 2, parentId: 2 }), // phase plan 2 nhưng cha nằm trong plan 1
    ];
    expect(tasksOfPlan(list, phases, 1).map((t) => t.id)).toEqual([1, 2, 3]);
    // Cha không thuộc kế hoạch → con không thành "gốc" mồ côi? con phase khác vẫn giữ riêng:
    expect(tasksOfPlan(list, phases, 2).map((t) => t.id)).toEqual([3]);
  });

  it('planId = null → giữ tất cả; không phụ thuộc phase không khớp kế hoạch nào', () => {
    const list = [mk({ id: 1, phaseId: 99 })];
    expect(tasksOfPlan(list, [], null).map((t) => t.id)).toEqual([1]);
    expect(tasksOfPlan(list, [], 1)).toEqual([]); // phase 99 không thuộc plan 1
  });
});
