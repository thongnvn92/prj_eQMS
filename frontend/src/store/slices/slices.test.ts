// Task 06 – Redux Toolkit slices: fetch/update thunks gọi api đúng,
// trạng thái pending → fulfilled/failed chính xác.
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import dashboardReducer, { fetchDashboard } from './dashboardSlice';
import masterPlanReducer, { fetchMasterPlan, updateTask } from './masterPlanSlice';
import documentsReducer, { fetchDocuments, transitionDocument } from './documentsSlice';
import type { DashboardStats, DocumentItem, Task } from '../../mock/types';
import { ApiError } from '../../mock/api';

const dashboardMock = vi.fn();
const masterPlanMock = vi.fn();
const masterPlansMock = vi.fn();
const updateTaskMock = vi.fn();
const documentsMock = vi.fn();
const transitionMock = vi.fn();

vi.mock('../../services/api', () => ({
  api: {
    dashboard: (...a: unknown[]) => dashboardMock(...a),
    masterPlan: (...a: unknown[]) => masterPlanMock(...a),
    masterPlans: (...a: unknown[]) => masterPlansMock(...a),
    updateTask: (...a: unknown[]) => updateTaskMock(...a),
    documents: (...a: unknown[]) => documentsMock(...a),
    transitionDocument: (...a: unknown[]) => transitionMock(...a),
  },
}));

/** Store test riêng từng slice (không dùng store singleton) – 3 helper để giữ nguyên type state. */
function makeDashboardStore() {
  return configureStore({ reducer: { dashboard: dashboardReducer } });
}
function makeMasterPlanStore() {
  return configureStore({ reducer: { masterPlan: masterPlanReducer } });
}
function makeDocumentsStore() {
  return configureStore({ reducer: { documents: documentsReducer } });
}

const sampleStats = {
  taskTotal: 16, taskCompleted: 4, taskInProgress: 5, taskNotStarted: 3,
  taskOverdue: 2, completionRate: 25, avgProgress: 48,
  tasksByStatus: [], tasksByPhase: [], tasksByPriority: [],
  docByStatus: [], docPending: 2, actionByStatus: [], actionOverdue: 1,
  overdueTasks: [], pendingDocs: [],
} satisfies DashboardStats;

const sampleTask = {
  id: 2, code: 'MP-002', name: 'Soạn thảo QT đào tạo', phaseId: 1,
  ownerId: 3, departmentId: 2, priority: 'high', status: 'in_progress',
  progress: 45, startDate: '2026-01-01', dueDate: '2026-12-31',
} satisfies Task;

const sampleDoc = {
  id: 2, code: 'QT-HCNS.02', name: 'QT đào tạo', docType: 'procedure',
  departmentId: 3, ownerId: 5, currentVersion: 'V0.1', status: 'reviewing',
  workflowStep: 2, versions: [], approvals: [],
} satisfies DocumentItem;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dashboardSlice', () => {
  it('fetchDashboard fulfilled → lưu stats + status succeeded', async () => {
    dashboardMock.mockResolvedValue(sampleStats);
    const store = makeDashboardStore();

    expect(store.getState().dashboard.status).toBe('idle');
    await store.dispatch(fetchDashboard());
    const state = store.getState().dashboard;

    expect(state.status).toBe('succeeded');
    expect(state.data?.taskTotal).toBe(16);
    expect(dashboardMock).toHaveBeenCalledTimes(1);
  });

  it('fetchDashboard rejected → status failed + error message', async () => {
    dashboardMock.mockRejectedValue(new ApiError(403, 'Bạn không có quyền thực hiện thao tác này.'));
    const store = makeDashboardStore();

    await store.dispatch(fetchDashboard());
    const state = store.getState().dashboard;

    expect(state.status).toBe('failed');
    expect(state.data).toBeNull();
    expect(state.error).toBe('Bạn không có quyền thực hiện thao tác này.');
  });
});

describe('masterPlanSlice', () => {
  it('fetchMasterPlan fulfilled → lưu phases + tasks', async () => {
    masterPlanMock.mockResolvedValue({
      phases: [{ id: 1, code: 'P1', name: 'GĐ 1', startDate: '2026-01-01', endDate: '2026-06-30' }],
      tasks: [sampleTask],
    });
    masterPlansMock.mockResolvedValue([]);
    const store = makeMasterPlanStore();

    await store.dispatch(fetchMasterPlan());
    const state = store.getState().masterPlan;

    expect(state.status).toBe('succeeded');
    expect(state.tasks).toHaveLength(1);
    expect(state.phases).toHaveLength(1);
  });

  it('updateTask fulfilled → tắt updating + đã gọi api đúng tham số + refetch', async () => {
    updateTaskMock.mockResolvedValue({ ...sampleTask, progress: 60 });
    masterPlanMock.mockResolvedValue({ phases: [], tasks: [{ ...sampleTask, progress: 60 }] });
    dashboardMock.mockResolvedValue(sampleStats);
    const store = makeMasterPlanStore();

    const promise = store.dispatch(updateTask({ id: 2, patch: { progress: 60 } }));
    // pending → updating=true ngay lập tức.
    expect(store.getState().masterPlan.updating).toBe(true);

    await promise;
    const state = store.getState().masterPlan;

    expect(updateTaskMock).toHaveBeenCalledWith(2, { progress: 60 });
    // Sau update phải refetch master plan + dashboard (invalidate style).
    expect(masterPlanMock).toHaveBeenCalled();
    expect(dashboardMock).toHaveBeenCalled();
    expect(state.updating).toBe(false);
  });

  it('updateTask rejected → tắt updating, không refetch', async () => {
    updateTaskMock.mockRejectedValue(new ApiError(403, 'Thiếu quyền master_plan.update'));
    const store = makeMasterPlanStore();

    await store.dispatch(updateTask({ id: 2, patch: { progress: 10 } }));

    expect(store.getState().masterPlan.updating).toBe(false);
    expect(masterPlanMock).not.toHaveBeenCalled();
  });
});

describe('documentsSlice', () => {
  it('fetchDocuments fulfilled → lưu items', async () => {
    documentsMock.mockResolvedValue([sampleDoc]);
    const store = makeDocumentsStore();

    await store.dispatch(fetchDocuments());

    expect(store.getState().documents.items).toHaveLength(1);
    expect(store.getState().documents.status).toBe('succeeded');
  });

  it('transitionDocument fulfilled → tắt transitioning + refetch documents/dashboard', async () => {
    transitionMock.mockResolvedValue({ ...sampleDoc, status: 'approval_pending' });
    documentsMock.mockResolvedValue([{ ...sampleDoc, status: 'approval_pending' }]);
    dashboardMock.mockResolvedValue(sampleStats);
    const store = makeDocumentsStore();

    await store.dispatch(transitionDocument({ id: 2, action: 'review' }));

    expect(transitionMock).toHaveBeenCalledWith(2, 'review', undefined);
    expect(documentsMock).toHaveBeenCalled();
    expect(dashboardMock).toHaveBeenCalled();
    expect(store.getState().documents.transitioning).toBe(false);
  });

  it('transitionDocument rejected (409) → tắt transitioning, error giữ ở thunk', async () => {
    transitionMock.mockRejectedValue(new ApiError(409, 'Sai trạng thái'));
    const store = makeDocumentsStore();

    const result = await store.dispatch(transitionDocument({ id: 2, action: 'publish' }));

    expect(result.payload).toBeUndefined();
    expect((result as { error?: { message?: string } }).error?.message).toBe('Sai trạng thái');
    expect(store.getState().documents.transitioning).toBe(false);
  });
});

