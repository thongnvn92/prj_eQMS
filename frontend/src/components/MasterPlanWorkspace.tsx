// Master Plan ISO – màn hình theo dõi công việc theo cấu trúc phân cấp (tối đa 5 cấp)
// của từng Master Plan. Nguồn dữ liệu duy nhất: flattenVisibleTree → expandVisibleRows.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch } from '../store/hooks';
import { Button, Card, Modal, Popover, Radio, Select, Space, Typography, message } from 'antd';
import {
  BarChartOutlined,
  DeleteOutlined,
  EditOutlined,
  FilterOutlined,
  GroupOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { useLookups, useMasterPlan } from '../hooks/queries';
import {
  updateTask, updateTaskProgress, deleteTask, reorderTasks,
  createTask, createMasterPlan, updateMasterPlan, deleteMasterPlan,
} from '../store/slices/masterPlanSlice';
import {
  expandVisibleRows, flattenVisibleTree, phasesOfPlan, tasksOfPlan,
} from '../store/slices/flattenTree';
import TaskTreeTable from './TaskTreeTable';
import TaskFormModal from './TaskFormModal';
import PlanFormModal from './PlanFormModal';
import TaskStatusLegend from './TaskStatusLegend';
import GanttPage from '../pages/GanttPage';
import { isTaskOverdue, TASK_STATUS } from './widgets';
import type { MasterPlan, Task, TaskStatus } from '../mock/types';
import type { PlanFormValues, TaskFormValues } from '../store/slices/ganttGeometry';
import type { VisibleRow } from '../store/slices/flattenTree';

const EXPANDED_KEY = 'eqms.mp.expanded';
const PLAN_KEY = 'eqms.mp.plan';

type GroupBy = 'phase' | 'owner' | 'status';

interface MasterPlanFilters {
  ownerKey?: string;
  status?: TaskStatus | 'overdue';
  phaseId?: number;
}

interface TaskGroup {
  key: string;
  title: string;
  tasks: Task[];
  totalCount: number;
}

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

  const [expandedIds, setExpandedIds] = useState<number[]>(() => loadObject<number[]>(EXPANDED_KEY, []));
  useEffect(() => {
    saveObject(EXPANDED_KEY, expandedIds);
  }, [expandedIds]);

  const [filters, setFilters] = useState<MasterPlanFilters>({});
  const [groupBy, setGroupBy] = useState<GroupBy>('phase');
  const [filterOpen, setFilterOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [ganttOpen, setGanttOpen] = useState(false);

  const ownerOptions = useMemo(() => {
    const owners = new Map<string, string>();
    tasks.forEach((task) => {
      const key = task.ownerId != null
        ? `id:${task.ownerId}`
        : task.ownerName?.trim()
          ? `name:${task.ownerName.trim().toLocaleLowerCase()}`
          : 'unassigned';
      const label = task.ownerName
        || people.find((person) => person.id === task.ownerId)?.fullName
        || 'Chưa phân công';
      if (!owners.has(key)) owners.set(key, label);
    });
    return [...owners].map(([value, label]) => ({ value, label }));
  }, [tasks, people]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const ownerKey = task.ownerId != null
      ? `id:${task.ownerId}`
      : task.ownerName?.trim()
        ? `name:${task.ownerName.trim().toLocaleLowerCase()}`
        : 'unassigned';
    return (!filters.ownerKey || ownerKey === filters.ownerKey)
      && (!filters.status || (filters.status === 'overdue'
        ? isTaskOverdue(task)
        : task.status === filters.status))
      && (filters.phaseId == null || task.phaseId === filters.phaseId);
  }), [tasks, filters]);

  const taskGroups = useMemo<TaskGroup[]>(() => {
    if (groupBy === 'phase') {
      return phases.map((phase) => ({
        key: `phase:${phase.id}`,
        title: `${phase.code} · ${phase.name}`,
        tasks: filteredTasks.filter((task) => task.phaseId === phase.id),
        totalCount: tasks.filter((task) => task.phaseId === phase.id).length,
      }));
    }

    if (groupBy === 'status') {
      return Object.entries(TASK_STATUS).map(([status, meta]) => ({
        key: `status:${status}`,
        title: meta.label,
        tasks: filteredTasks.filter((task) => task.status === status),
        totalCount: tasks.filter((task) => task.status === status).length,
      }));
    }

    return ownerOptions.map(({ value, label }) => ({
      key: `owner:${value}`,
      title: label,
      tasks: filteredTasks.filter((task) => {
        const ownerKey = task.ownerId != null
          ? `id:${task.ownerId}`
          : task.ownerName?.trim()
            ? `name:${task.ownerName.trim().toLocaleLowerCase()}`
            : 'unassigned';
        return ownerKey === value;
      }),
      totalCount: tasks.filter((task) => {
        const ownerKey = task.ownerId != null
          ? `id:${task.ownerId}`
          : task.ownerName?.trim()
            ? `name:${task.ownerName.trim().toLocaleLowerCase()}`
            : 'unassigned';
        return ownerKey === value;
      }).length,
    }));
  }, [groupBy, phases, tasks, filteredTasks, ownerOptions]);

  const groupedRows = useMemo(() => taskGroups.map((group) => {
    const rows = flattenVisibleTree(group.tasks, expandedIds, {});
    return {
      ...group,
      rows: expandVisibleRows(rows, expandedIds),
      expandableIds: new Set(rows.filter((row) => row.childrenIds.length > 0).map((row) => row.id)),
    };
  }), [taskGroups, expandedIds]);

  // ---- Cây phân cấp: allRows = toàn bộ, visibleRows = đã áp thu gọn/mở rộng ----
  const allRows = useMemo(() => flattenVisibleTree(tasks, expandedIds, {}), [tasks, expandedIds]);
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
      ownerId: (editingTask.ownerName || people.find((p) => p.id === editingTask.ownerId)?.fullName || (editingTask.ownerId != null ? String(editingTask.ownerId) : undefined)) as any,
      departmentId: editingTask.departmentId,
      priority: editingTask.priority,
      startDate: editingTask.startDate,
      dueDate: editingTask.dueDate,
      note: editingTask.note,
      status: editingTask.status,
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
    const ownerMatch = (lookups?.people ?? []).find(
      (p) => p.fullName.toLowerCase() === String(values.ownerId ?? '').toLowerCase(),
    );
    const resolvedOwnerId = ownerMatch ? ownerMatch.id : (typeof values.ownerId === 'number' ? values.ownerId : null);
    const patch = {
      ...values,
      ownerId: resolvedOwnerId,
      ownerName: String(values.ownerId ?? '').trim() || undefined,
    };
    if (editingId != null) {
      dispatch(updateTask({ id: editingId, patch }));
    } else {
      dispatch(createTask(patch));
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

  const removePlan = useCallback((plan: MasterPlan) => {
    dispatch(deleteMasterPlan(plan.id))
      .unwrap()
      .then(() => message.success(`Đã xoá kế hoạch ${plan.code}`))
      .catch(() => message.error('Không xoá được kế hoạch.'));
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
        <div className='eqms-mp-toolbar-row' style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
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
            {can('master_plan.delete') && selectedPlan && (
              <Button danger icon={<DeleteOutlined />} onClick={() => removePlan(selectedPlan)}>
                Xóa kế hoạch
              </Button>
            )}
          </Space>
          <Typography.Text type='secondary' style={{ marginLeft: 'auto', whiteSpace: 'nowrap', alignSelf: 'center' }}>
            Tổng công việc: {tasks.length}
          </Typography.Text>
        </div>
        <div className='eqms-mp-toolbar-row' style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 }}>
          <div>
            {can('master_plan.create') && (
              <Button type='primary' icon={<PlusOutlined />} onClick={openCreate}>
                Thêm công việc
              </Button>
            )}
            <div style={{ marginTop: 8 }}>
              <TaskStatusLegend />
            </div>
          </div>
          <Space align='start'>
            <Popover
              title='Lọc công việc'
              trigger='click'
              open={filterOpen}
              onOpenChange={setFilterOpen}
              content={
                <Space direction='vertical' style={{ width: 260 }}>
                  <Select
                    allowClear
                    aria-label='Lọc theo phụ trách'
                    placeholder='Phụ trách'
                    value={filters.ownerKey}
                    options={ownerOptions}
                    onChange={(ownerKey) => setFilters((current) => ({ ...current, ownerKey }))}
                    style={{ width: '100%' }}
                  />
                  <Select
                    allowClear
                    aria-label='Lọc theo trạng thái'
                    placeholder='Trạng thái'
                    value={filters.status}
                    options={[
                      ...Object.entries(TASK_STATUS).map(([value, meta]) => ({ value, label: meta.label })),
                      { value: 'overdue', label: 'Quá hạn' },
                    ]}
                    onChange={(status) => setFilters((current) => ({
                      ...current,
                      status: status as TaskStatus | 'overdue' | undefined,
                    }))}
                    style={{ width: '100%' }}
                  />
                  <Select
                    allowClear
                    aria-label='Lọc theo nhóm công việc'
                    placeholder='Nhóm công việc'
                    value={filters.phaseId}
                    options={phases.map((phase) => ({ value: phase.id, label: `${phase.code} · ${phase.name}` }))}
                    onChange={(phaseId) => setFilters((current) => ({ ...current, phaseId }))}
                    style={{ width: '100%' }}
                  />
                  <Button onClick={() => setFilters({})}>Xóa bộ lọc</Button>
                </Space>
              }
            >
              <Button
                aria-label='Lọc công việc'
                title='Lọc công việc'
                type={Object.values(filters).some(Boolean) ? 'primary' : 'default'}
                icon={<FilterOutlined />}
              />
            </Popover>
            <Popover
              title='Nhóm công việc theo'
              trigger='click'
              open={groupOpen}
              onOpenChange={setGroupOpen}
              content={
                <Radio.Group
                  value={groupBy}
                  onChange={(event) => {
                    setGroupBy(event.target.value as GroupBy);
                    setGroupOpen(false);
                  }}
                >
                  <Space direction='vertical'>
                    <Radio value='phase'>Nhóm công việc</Radio>
                    <Radio value='owner'>Phụ trách</Radio>
                    <Radio value='status'>Trạng thái</Radio>
                  </Space>
                </Radio.Group>
              }
            >
              <Button
                aria-label='Nhóm công việc'
                title='Nhóm công việc'
                type={groupBy !== 'phase' ? 'primary' : 'default'}
                icon={<GroupOutlined />}
              />
            </Popover>
            <Button
              aria-label='Mở Gantt Chart'
              title='Gantt Chart'
              icon={<BarChartOutlined />}
              onClick={() => setGanttOpen(true)}
            />
          </Space>
        </div>
      </Card>

      {groupedRows
        .filter((group) => group.tasks.length > 0)
        .map((g) => (
          <Card
            key={g.key}
            size='small'
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span>{g.title}</span>
                <Typography.Text type='secondary' style={{ whiteSpace: 'nowrap' }}>
                  {g.tasks.length} / {g.totalCount}
                </Typography.Text>
              </div>
            }
            style={{ marginBottom: 12 }}
          >
            <TaskTreeTable
              rows={g.rows}
              expandableIds={g.expandableIds}
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
          </Card>
        ))}

      <Modal
        title='Gantt Chart – Tiến độ Master Plan'
        open={ganttOpen}
        onCancel={() => setGanttOpen(false)}
        footer={null}
        width='95vw'
        centered
        styles={{ body: { maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' } }}
      >
        <GanttPage embedded initialPlanId={effectivePlanId} />
      </Modal>

      <TaskFormModal
        open={showTaskForm}
        title={editingId != null ? `Sửa công việc - ${editingTask?.code ?? ''}` : 'Thêm công việc mới'}
        editingId={editingId}
        phases={phases}
        people={people}
        departments={lookups?.departments ?? []}
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