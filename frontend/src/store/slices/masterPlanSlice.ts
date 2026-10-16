// ISO Master Plan (plans + phases + tasks) + CRUD
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { MasterPlan, Phase, Task } from '../../mock/types';
import { api } from '../../services/api';
import { fetchDashboard } from './dashboardSlice';

interface MasterPlanState {
  plans: MasterPlan[];
  phases: Phase[];
  tasks: Task[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string;
  updating: boolean;
}

const initialState: MasterPlanState = {
  plans: [],
  phases: [],
  tasks: [],
  status: 'idle',
  updating: false,
};

export const fetchMasterPlan = createAsyncThunk('masterPlan/fetch', async () => {
  const [mp, plans] = await Promise.all([api.masterPlan(), api.masterPlans()]);
  return { phases: mp.phases, tasks: mp.tasks, plans };
});

export const updateTask = createAsyncThunk(
  'masterPlan/updateTask',
  async (input: { id: number; patch: Record<string, unknown> }, { dispatch }) => {
    const task = await api.updateTask(input.id, input.patch);
    await Promise.all([dispatch(fetchMasterPlan()), dispatch(fetchDashboard())]);
    return task;
  },
);

/** CR Master Plan ISO – owner cập nhật tiến độ (endpoint riêng, không cần master_plan.update). */
export const updateTaskProgress = createAsyncThunk(
  'masterPlan/updateTaskProgress',
  async (input: { id: number; progress: number }, { dispatch }) => {
    const task = await api.updateTaskProgress(input.id, input.progress);
    await Promise.all([dispatch(fetchMasterPlan()), dispatch(fetchDashboard())]);
    return task;
  },
);

export const createTask = createAsyncThunk('masterPlan/createTask', async (input: Parameters<typeof api.createTask>[0], { dispatch }) => {
  const task = await api.createTask(input);
  await dispatch(fetchMasterPlan());
  return task;
});

/** Import hàng loạt công việc (bulk endpoint) – 1 request, trả { imported, errors }. */
export const importTasks = createAsyncThunk('masterPlan/importTasks', async (rows: Parameters<typeof api.importTasks>[0], { dispatch }) => {
  const result = await api.importTasks(rows);
  await dispatch(fetchMasterPlan());
  return result;
});

export const deleteTask = createAsyncThunk('masterPlan/deleteTask', async (id: number, { dispatch }) => {
  await api.deleteTask(id);
  await dispatch(fetchMasterPlan());
});

export const reorderTasks = createAsyncThunk('masterPlan/reorderTasks', async (orderedIds: number[], { dispatch }) => {
  await api.reorderTasks(orderedIds);
  await dispatch(fetchMasterPlan());
});

export const createMasterPlan = createAsyncThunk('masterPlan/createPlan', async (input: Parameters<typeof api.createMasterPlan>[0], { dispatch }) => {
  const plan = await api.createMasterPlan(input);
  await dispatch(fetchMasterPlan());
  return plan;
});

export const updateMasterPlan = createAsyncThunk('masterPlan/updatePlan', async (input: { id: number; patch: Parameters<typeof api.updateMasterPlan>[1] }, { dispatch }) => {
  const plan = await api.updateMasterPlan(input.id, input.patch);
  await dispatch(fetchMasterPlan());
  return plan;
});

export const deleteMasterPlan = createAsyncThunk('masterPlan/deletePlan', async (id: number, { dispatch }) => {
  await api.deleteMasterPlan(id);
  await dispatch(fetchMasterPlan());
});

const masterPlanSlice = createSlice({
  name: 'masterPlan',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMasterPlan.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchMasterPlan.fulfilled, (state, action) => {
        state.phases = action.payload.phases;
        state.tasks = action.payload.tasks;
        state.plans = action.payload.plans;
        state.status = 'succeeded';
      })
      .addCase(fetchMasterPlan.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(updateTask.pending, (state) => {
        state.updating = true;
      })
      .addCase(updateTask.fulfilled, (state) => {
        state.updating = false;
      })
      .addCase(updateTask.rejected, (state) => {
        state.updating = false;
      })
      .addCase(updateTaskProgress.pending, (state) => {
        state.updating = true;
      })
      .addCase(updateTaskProgress.fulfilled, (state) => {
        state.updating = false;
      })
      .addCase(updateTaskProgress.rejected, (state) => {
        state.updating = false;
      });
  },
});

export default masterPlanSlice.reducer;
