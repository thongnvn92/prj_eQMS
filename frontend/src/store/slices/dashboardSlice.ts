// Dashboard stats + chart data
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { DashboardStats } from '../../mock/types';
import { api } from '../../services/api';

interface DashboardState {
  data: DashboardStats | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string;
}

const initialState: DashboardState = { data: null, status: 'idle' };

export const fetchDashboard = createAsyncThunk('dashboard/fetch', () => api.dashboard());

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.data = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      });
  },
});

export default dashboardSlice.reducer;
