// CR-RISK-OPPORTUNITY-001 – Risk Register (list + detail + mutations)
import { createAsyncThunk, createSlice, type ActionReducerMapBuilder } from '@reduxjs/toolkit';
import type { RiskAssessmentItem, RiskItem, RiskLevel, ReviewFrequency, RoStatus } from '../../mock/types';
import { api } from '../../services/api';

export interface RiskFilters {
  level?: RiskLevel | '';
  status?: RoStatus | '';
  departmentId?: number | '';
  q?: string;
}

interface RisksState {
  items: RiskItem[];
  filters: RiskFilters;
  detail: RiskItem | null;
  history: RiskAssessmentItem[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  saving: boolean;
  error?: string;
}

const initialState: RisksState = {
  items: [],
  filters: {},
  detail: null,
  history: [],
  status: 'idle',
  saving: false,
};

export const fetchRisks = createAsyncThunk('risks/fetch', (filters?: RiskFilters) => api.risks(filters ?? {}));

export const createRisk = createAsyncThunk(
  'risks/create',
  async (input: Parameters<typeof api.createRisk>[0], { dispatch, getState }) => {
    const item = await api.createRisk(input);
    const filters = (getState() as { risks: RisksState }).risks.filters;
    await dispatch(fetchRisks(filters));
    return item;
  },
);

export const updateRisk = createAsyncThunk(
  'risks/update',
  async (input: { id: number; patch: Parameters<typeof api.updateRisk>[1] }, { dispatch, getState }) => {
    const item = await api.updateRisk(input.id, input.patch);
    const filters = (getState() as { risks: RisksState }).risks.filters;
    await dispatch(fetchRisks(filters));
    return item;
  },
);

export const evaluateRisk = createAsyncThunk(
  'risks/evaluate',
  async (input: { id: number; likelihood: number; impact: number; comment?: string }, { dispatch, getState }) => {
    const item = await api.evaluateRisk(input.id, { likelihood: input.likelihood, impact: input.impact, comment: input.comment });
    const filters = (getState() as { risks: RisksState }).risks.filters;
    await dispatch(fetchRisks(filters));
    return item;
  },
);

export const deleteRisk = createAsyncThunk('risks/delete', async (id: number, { dispatch, getState }) => {
  await api.deleteRisk(id);
  const filters = (getState() as { risks: RisksState }).risks.filters;
  await dispatch(fetchRisks(filters));
});

export const fetchRiskDetail = createAsyncThunk('risks/detail', async (id: number) => {
  const [risk, history] = await Promise.all([api.risk(id), api.riskHistory(id)]);
  return { risk, history };
});

const risksSlice = createSlice({
  name: 'risks',
  initialState,
  reducers: {
    setRiskFilters(state, action: { payload: RiskFilters }) {
      state.filters = action.payload;
    },
    clearRiskDetail(state) {
      state.detail = null;
      state.history = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRisks.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchRisks.fulfilled, (state, action) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchRisks.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(fetchRiskDetail.fulfilled, (state, action) => {
        state.detail = action.payload.risk;
        state.history = action.payload.history;
        state.saving = false;
      })
      .addCase(createRisk.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(updateRisk.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(evaluateRisk.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(deleteRisk.fulfilled, (state) => {
        state.saving = false;
      })
      .addMatcher(
        (action) => action.type.startsWith('risks/') && action.type.endsWith('/pending'),
        (state) => {
          state.saving = true;
        },
      )
      .addMatcher(
        (action) => action.type.startsWith('risks/') && action.type.endsWith('/rejected'),
        (state) => {
          state.saving = false;
        },
      );
  },
});

export const { setRiskFilters, clearRiskDetail } = risksSlice.actions;
export default risksSlice.reducer;