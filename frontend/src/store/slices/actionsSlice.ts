// Action / CAPA (action items + update mutation)
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { ActionItem } from '../../mock/types';
import { api } from '../../services/api';
import { fetchDashboard } from './dashboardSlice';

interface ActionsState {
  items: ActionItem[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string;
  updating: boolean;
}

const initialState: ActionsState = {
  items: [],
  status: 'idle',
  updating: false,
};

export const fetchActions = createAsyncThunk('actions/fetch', () => api.actions());

export const createAction = createAsyncThunk('actions/createAction', async (input: Parameters<typeof api.createAction>[0], { dispatch }) => {
  const item = await api.createAction(input);
  await dispatch(fetchActions());
  return item;
});

export const deleteAction = createAsyncThunk('actions/deleteAction', async (id: number, { dispatch }) => {
  await api.deleteAction(id);
  await dispatch(fetchActions());
});

export const updateAction = createAsyncThunk(
  'actions/updateAction',
  async (
    input: {
      id: number;
      patch: {
        status?: ActionItem['status']; progress?: number; result?: string; evidence?: string;
        title?: string; source?: ActionItem['source']; ownerId?: number | null; departmentId?: number | null; dueDate?: string;
        relatedRiskId?: number | null; relatedOpportunityId?: number | null;
      };
    },
    { dispatch },
  ) => {
    const item = await api.updateAction(input.id, input.patch);
    await Promise.all([dispatch(fetchActions()), dispatch(fetchDashboard())]);
    return item;
  },
);

const actionsSlice = createSlice({
  name: 'actions',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchActions.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchActions.fulfilled, (state, action) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchActions.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(updateAction.pending, (state) => {
        state.updating = true;
      })
      .addCase(updateAction.fulfilled, (state) => {
        state.updating = false;
      })
      .addCase(updateAction.rejected, (state) => {
        state.updating = false;
      });
  },
});

export default actionsSlice.reducer;
