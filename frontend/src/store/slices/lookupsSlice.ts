// Lookups (people, departments, phases) – nạp 1 lần, không refetch
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { Department, Phase } from '../../mock/types';
import { api } from '../../services/api';

interface LookupsState {
  people: { id: number; fullName: string }[];
  departments: Department[];
  phases: Phase[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string;
}

const initialState: LookupsState = {
  people: [],
  departments: [],
  phases: [],
  status: 'idle',
};

export const fetchLookups = createAsyncThunk('lookups/fetch', () => api.lookups());

const lookupsSlice = createSlice({
  name: 'lookups',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLookups.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchLookups.fulfilled, (state, action) => {
        state.people = action.payload.people;
        state.departments = action.payload.departments;
        state.phases = action.payload.phases;
        state.status = 'succeeded';
      })
      .addCase(fetchLookups.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      });
  },
});

export default lookupsSlice.reducer;
