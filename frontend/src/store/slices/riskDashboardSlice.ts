// CR-RISK-OPPORTUNITY-001 – Dashboard Rủi ro & Cơ hội (KPI + grouping + 5×5)
import { createAsyncThunk, createSlice, type ActionReducerMapBuilder, type PayloadAction } from '@reduxjs/toolkit';
import type { RiskAssessmentItem, RiskDashboardStats, RiskItem, RiskLevel, RoStatus } from '../../mock/types';
import { api } from '../../services/api';

interface RiskDashboardState {
  stats: RiskDashboardStats | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string;
}

const initialState: RiskDashboardState = {
  stats: null,
  status: 'idle',
  error: undefined,
};

export const fetchRiskDashboard = createAsyncThunk('riskDashboard/fetch', () => api.riskDashboard());

const riskDashboardSlice = createSlice({
  name: 'riskDashboard',
  initialState,
  reducers: {
    clearRiskDashboard(state) {
      state.stats = null;
      state.status = 'idle';
    },
  },
  extraReducers: (builder: ActionReducerMapBuilder<RiskDashboardState>) => {
    builder
      .addCase(fetchRiskDashboard.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchRiskDashboard.fulfilled, (state, action: PayloadAction<RiskDashboardStats>) => {
        state.stats = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchRiskDashboard.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      });
  },
});

export const { clearRiskDashboard } = riskDashboardSlice.actions;
export default riskDashboardSlice.reducer;