// Master Plan ISO – màn hình theo dõi công việc theo cấu trúc phân cấp (tối đa 5 cấp)
// của từng Master Plan. Nguồn dữ liệu duy nhất: flattenVisibleTree → expandVisibleRows.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch } from '../store/hooks';
import { Button, Card, Select, Space, Typography, message } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { useLookups, useMasterPlan } from '../hooks/queries';
import {
  updateTask, updateTaskProgress, deleteTask, reorderTasks,
  createTask, createMasterPlan, updateMasterPlan,
} from '../store/slices/masterPlanSlice';
import {
  expandVisibleRows, flattenVisibleTree, phasesOfPlan, tasksOfPlan,
} from '../store/slices/flattenTree';
import TaskTreeTable from './TaskTreeTable';
import TaskFormModal from './TaskFormModal';
import PlanFormModal from './PlanFormModal';
import type { MasterPlan, Task } from '../mock/types';
import type { PlanFormValues, TaskFormValues } from '../store/slices/ganttGeometry';
import type { VisibleRow } from '../store/slices/flattenTree';

const EXPANDED_KEY = 'eqms.mp.expanded';
const PLAN_KEY = 'eqms.mp.plan';

function loadObject<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function loadNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v ? Number(v) : fallback;
  } catch {
    return fallback;
  }
}
function saveObject(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export default function MasterPlanWorkspace() {
  const dispatch = useAppDispatch();
  const { can, user } = useAuth();
  const { data, isLoading } = useMasterPlan();
  const { data: lookups } = useLookups();

  const allPhases = data?.phases ?? [];
  const allTasks = data?.tasks ?? [];
  const plans = data?.plans ?? [];
  const people = lookups?.people ?? [];

  // ---- Chọn Master Plan (persist localStorage; fallback = kế hoạch đầu tiên) ----
  const [planId, setPlanId] = useState<number>(() => loadNumber(PLAN_KEY, 0));
  const effectivePlanId = useMemo(
    () => (plans.some((p) => p.id === planId) ? planId : (plans[0]?.id ?? 0)),
    [plans, planId],
  );
  useEffect(() => {
    if (effectivePlanId !== planId) setPlanId(effectivePlanId);
    saveObject(PLAN_KEY, effectivePlanId);
  }, [effectivePlanId, planId]);

  const phases = useMemo(() => phasesOfPlan(allPhases, effectivePlanId), [allPhases, effectivePlanId]);
  const tasks = useMemo(
    () => tasksOfPlan(allTasks, allPhases, effectivePlanId),
    [allTasks, allPhases, effectivePlanId],
  );

  // ---- Cây phân cấp: allRows = toàn bộ, visibleRows = đã áp thu gọn/mở rộng ----
  const [expandedIds, setExpandedIds] = useState<number[]>(() => loadObject<number[]>(EXPANDED_KEY, []));
  useEffect(() => {
    saveObject(EXPANDED_KEY, expandedIds);
  }, [expandedIds]);

  const allRows = useMemo(() => flattenVisibleTree(tasks, expandedIds, {}), [tasks, expandedIds]);
  const visibleRows = useMemo(() => expandVisibleRows(allRows, expandedIds), [allRows, expandedIds]);
  const expandableIds = useMemo(
    () => new Set(allRows.filter((r) => r.childrenIds.length > 0).map((r) => r.id)),
    [allRows],
  );

  const toggleExpand = useCallback((row: VisibleRow, expanded: boolean) => {
    setExpandedIds((prev) => (expanded ? [...new Set([...prev, row.id])] : prev.filter((x) => x !== row.id)));
  }, []);
  const expandAll = useCallback(() => setExpandedIds([...expandableIds]), [expandableIds]);
  const collapseAll = useCallback(() => setExpandedIds([]), []);

  // ---- Modal công việc (thêm / sửa / thêm con) ----
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [createDefaults, setCreateDefaults] = useState<Partial<TaskFormValues> | undefined>(undefined);

  const editFormValues = useMemo<Partial<TaskFormValues> | undefined>(() => {
    if (!editingTask) return undefined;
    return {
      code: editingTask.code,
      name: editingTask.name,
      phaseId: editingTask.phaseId,
      parentId: editingTask.parentId,
      ownerId: editingTask.ownerId,
      departmentId: editingTask.departmentId,
      priority: editingTask.priority,
      startDate: editingTask.startDate,
      dueDate: editingTask.dueDate,
      note: editingTask.note,
    };
  }, [editingTask]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setEditingTask(null);
    setCreateDefaults(phases.length > 0 ? { phaseId: phases[0].id } : {});
    setShowTaskForm(true);
  }, [phases]);

  /** Thêm công việc CON: kế thừa phase + parentId của nhánh đang bấm. */
  const openSub = useCallback((row: VisibleRow) => {
    setEditingId(null);
    setEditingTask(null);
    setCreateDefaults({ phaseId: row.phaseId, parentId: row.id });
    setShowTaskForm(true);
  }, []);

  const openEdit = useCallback((row: VisibleRow) => {
    setEditingId(row.id);
    setEditingTask(row);
    setCreateDefaults(undefined);
    setShowTaskForm(true);
  }, []);

  const closeTaskForm = useCallback(() => {
    setEditingId(null);
    setEditingTask(null);
    setCreateDefaults(undefined);
    setShowTaskForm(false);
  }, []);

  const submitTask = useCallback((values: TaskFormValues) => {
    if (editingId != null) {
      dispatch(updateTask({ id: editingId, patch: values }));
    } else {
      dispatch(createTask(values));
      // Tự mở nhánh cha để thấy ngay công việc con vừa tạo.
      if (values.parentId != null) {
        setExpandedIds((prev) => [...new Set([...prev, values.parentId as number])]);
      }
    }
    message.success(`${editingId != null ? 'Cập nhật' : 'Tạo'} công việc ${values.code}`);
    closeTaskForm();
  }, [editingId, dispatch, closeTaskForm]);

  const removeTask = useCallback((row: VisibleRow) => {
    dispatch(deleteTask(row.id))
      .unwrap()
      .then(() => message.success(`Đã xoá công việc ${row.code}`))
      .catch(() => message.error('Không xoá được công việc.'));
  }, [dispatch]);

  /** Owner (hoặc master_plan.update) cập nhật tiến độ ngay trên bảng. */
  const changeProgress = useCallback((row: VisibleRow, progress: number) => {
    dispatch(updateTaskProgress({ id: row.id, progress }))
      .unwrap()
      .then(() => message.success(`Đã cập nhật tiến độ ${row.code}: ${progress}%`))
      .catch(() => message.error('Không cập nhật được tiến độ công việc.'));
  }, [dispatch]);

  /**
   * Kéo–thả đổi thứ tự công việc CHA (level 0): kéo draggedId lên ngay trước targetId.
   * Xây dựng lại toàn bộ thứ tự DFS (cha + cả cây con đi theo) rồi gửi lại reorderTasks.
   */
  const reorderRoot = useCallback((draggedId: number, targetId: number) => {
    if (draggedId === targetId) return;
    // Thứ tự DFS hiện tại (cha → toàn bộ cây con đi theo).
    const ids: number[] = [];
    const walk = (ns: VisibleRow[]) =>
      ns.forEach((n) => {
        ids.push(n.id);
        walk(n.childrenIds.map((i) => allRows[i]));
      });
    walk(allRows);

    // Khối DFS liên tiếp của 1 công việc cha (từ cha đến hết cây con).
    const blockOf = (rootId: number): number[] => {
      const start = ids.indexOf(rootId);
      if (start < 0) return [];
      let end = start + 1;
      while (end < ids.length && !allRows.some((r) => r.level === 0 && r.id === ids[end])) {
        end += 1;
      }
      return ids.slice(start, end);
    };

    const draggedBlock = blockOf(draggedId);
    const rest = ids.filter((id) => !draggedBlock.includes(id));
    const insertAt = rest.indexOf(targetId);
    if (insertAt < 0) return;
    const reordered = [...rest.slice(0, insertAt), ...draggedBlock, ...rest.slice(insertAt)];
    dispatch(reorderTasks(reordered)).unwrap().catch(() => {});
  }, [allRows, dispatch]);

  // ---- Modal kế hoạch (thêm/sửa Master Plan – CRUD hiện có, nay gắn vào toolbar) ----
  const [planModal, setPlanModal] = useState<{ mode: 'create' | 'edit'; plan: MasterPlan | null } | null>(null);
  const selectedPlan = plans.find((p) => p.id === effectivePlanId) ?? null;

  const submitPlan = useCallback((values: PlanFormValues) => {
    if (planModal?.mode === 'edit' && planModal.plan) {
      dispatch(updateMasterPlan({ id: planModal.plan.id, patch: values }));
    } else {
      dispatch(createMasterPlan(values))
        .unwrap()
        .then((plan) => setPlanId(plan.id))
        .catch(() => undefined);
    }
    message.success(`Đã ${planModal?.mode === 'edit' ? 'cập nhật' : 'tạo'} kế hoạch ${values.code}`);
    setPlanModal(null);
  }, [planModal, dispatch]);

  return (
    <div className='eqms-page eqms-masterplan-page'>
      <div className='eqms-mp-header'>
        <Typography.Title level={4} className='eqms-page-title' style={{ margin: 0 }}>
          MASTER PLAN ISO
        </Typography.Title>
        <Typography.Text type='secondary'>
          Theo dõi chương trình và kế hoạch hành động Ban ISO
        </Typography.Text>
      </div>

      <Card size='small' className='eqms-masterplan-toolbar'>
        <div className='eqms-mp-toolbar-row'>
          <Space wrap>
            <Typography.Text strong>Master Plan:</Typography.Text>
            <Select
              style={{ minWidth: 300 }}
              value={effectivePlanId || undefined}
              placeholder='Chọn kế hoạch'
              onChange={(v) => setPlanId(v)}
              options={plans.map((p) => ({ value: p.id, label: `${p.name} (${p.cycleLabel})` }))}
              notFoundContent='Chưa có kế hoạch'
            />
            {can('master_plan.create') && (
              <Button icon={<PlusOutlined />} onClick={() => setPlanModal({ mode: 'create', plan: null })}>
                Thêm kế hoạch
              </Button>
            )}
            {can('master_plan.update') && selectedPlan && (
              <Button icon={<EditOutlined />} onClick={() => setPlanModal({ mode: 'edit', plan: selectedPlan })}>
                Sửa kế hoạch
              </Button>
            )}
          </Space>
        </div>
        <div className='eqms-mp-toolbar-row eqms-mp-toolbar-actions'>
          {/* Mở rộng/Thu gọn tất cả nay là nút icon (+) / (−) ở header cột "Công việc". */}
          {can('master_plan.create') && (
            <Button type='primary' icon={<PlusOutlined />} onClick={openCreate}>
              Thêm công việc
            </Button>
          )}
        </div>
      </Card>

      <TaskTreeTable
        rows={visibleRows}
        expandableIds={expandableIds}
        expandedIds={expandedIds}
        phases={phases}
        people={people}
        isLoading={isLoading}
        canCreate={can('master_plan.create')}
        canEdit={can('master_plan.update')}
        canDelete={can('master_plan.delete')}
        canProgress={(row) => row.ownerId === user?.id || can('master_plan.update')}
        onToggle={toggleExpand}
        onEdit={openEdit}
        onDelete={removeTask}
        onSub={openSub}
        onReorderRoot={reorderRoot}
        onProgress={changeProgress}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />

      <TaskFormModal
        open={showTaskForm}
        title={editingId != null ? `Sửa công việc - ${editingTask?.code ?? ''}` : 'Thêm công việc mới'}
        editingId={editingId}
        phases={phases}
        people={people}
        tasks={tasks}
        initialValues={editingId != null ? editFormValues : createDefaults}
        onCancel={closeTaskForm}
        onOk={submitTask}
      />
      <PlanFormModal
        open={planModal?.mode != null}
        title={planModal?.mode === 'edit' && planModal?.plan ? `Sửa kế hoạch - ${planModal.plan.code}` : 'Thêm kế hoạch mới'}
        plan={planModal?.plan ?? null}
        onCancel={() => setPlanModal(null)}
        onOk={submitPlan}
      />
    </div>
  );
}