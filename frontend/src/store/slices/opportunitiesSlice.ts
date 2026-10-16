// CR-RISK-OPPORTUNITY-001 – Opportunity Register (list + mutations)
import { createAsyncThunk, createSlice, type ActionReducerMapBuilder } from '@reduxjs/toolkit';
import type { OpportunityItem, OpportunityLevel, RoStatus } from '../../mock/types';
import { api } from '../../services/api';

export interface OpportunityFilters {
  level?: OpportunityLevel | '';
  status?: RoStatus | '';
  departmentId?: number | '';
  q?: string;
}

interface OpportunitiesState {
  items: OpportunityItem[];
  filters: OpportunityFilters;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  saving: boolean;
  error?: string;
}

const initialState: OpportunitiesState = {
  items: [],
  filters: {},
  status: 'idle',
  saving: false,
};

export const fetchOpportunities = createAsyncThunk('opportunities/fetch', (filters?: OpportunityFilters) => api.opportunities(filters ?? {}));

export const createOpportunity = createAsyncThunk(
  'opportunities/create',
  async (input: Parameters<typeof api.createOpportunity>[0], { dispatch, getState }) => {
    const item = await api.createOpportunity(input);
    const filters = (getState() as { opportunities: OpportunitiesState }).opportunities.filters;
    await dispatch(fetchOpportunities(filters));
    return item;
  },
);

export const updateOpportunity = createAsyncThunk(
  'opportunities/update',
  async (input: { id: number; patch: Parameters<typeof api.updateOpportunity>[1] }, { dispatch, getState }) => {
    const item = await api.updateOpportunity(input.id, input.patch);
    const filters = (getState() as { opportunities: OpportunitiesState }).opportunities.filters;
    await dispatch(fetchOpportunities(filters));
    return item;
  },
);

export const evaluateOpportunity = createAsyncThunk(
  'opportunities/evaluate',
  async (input: { id: number; feasibility: number; benefit: number; comment?: string }, { dispatch, getState }) => {
    const item = await api.evaluateOpportunity(input.id, { feasibility: input.feasibility, benefit: input.benefit, comment: input.comment });
    const filters = (getState() as { opportunities: OpportunitiesState }).opportunities.filters;
    await dispatch(fetchOpportunities(filters));
    return item;
  },
);

export const deleteOpportunity = createAsyncThunk('opportunities/delete', async (id: number, { dispatch, getState }) => {
  await api.deleteOpportunity(id);
  const filters = (getState() as { opportunities: OpportunitiesState }).opportunities.filters;
  await dispatch(fetchOpportunities(filters));
});

const opportunitiesSlice = createSlice({
  name: 'opportunities',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOpportunities.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchOpportunities.fulfilled, (state, action) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchOpportunities.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(createOpportunity.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(updateOpportunity.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(evaluateOpportunity.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(deleteOpportunity.fulfilled, (state) => {
        state.saving = false;
      })
      .addMatcher(
        (action) => action.type.startsWith('opportunities/') && action.type.endsWith('/pending'),
        (state) => {
          state.saving = true;
        },
      )
      .addMatcher(
        (action) => action.type.startsWith('opportunities/') && action.type.endsWith('/rejected'),
        (state) => {
          state.saving = false;
        },
      );
  },
});

export default opportunitiesSlice.reducer;