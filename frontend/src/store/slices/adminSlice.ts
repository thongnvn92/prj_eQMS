// Admin (users, roles, reset demo)
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { RoleCode } from '../../auth/permissions';
import { fetchDashboard } from './dashboardSlice';
import { fetchLookups } from './lookupsSlice';
import { fetchMasterPlan } from './masterPlanSlice';
import { fetchDocuments } from './documentsSlice';
import { fetchActions } from './actionsSlice';

export interface SafeUser {
  id: number;
  username: string;
  fullName: string;
  email: string;
  departmentId: number | null;
  roleCodes: RoleCode[];
  active: boolean;
}

export interface RoleRow {
  code: RoleCode;
  name: string;
  permissions: string[];
}

interface AdminState {
  users: SafeUser[];
  roles: RoleRow[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string;
  resetting: boolean;
  saving: boolean;
}

const initialState: AdminState = {
  users: [],
  roles: [],
  status: 'idle',
  resetting: false,
  saving: false,
};

export const fetchAdmin = createAsyncThunk('admin/fetch', async () => {
  const [users, roles] = await Promise.all([api.users(), api.roles()]);
  return { users: users as SafeUser[], roles: roles as RoleRow[] };
});

export const resetDemo = createAsyncThunk('admin/resetDemo', async (_, { dispatch }) => {
  await api.resetDemo();
  // sau khi reset → nạp lại toàn bộ dữ liệu đang hiển thị
  await Promise.all([
    dispatch(fetchAdmin()),
    dispatch(fetchLookups()),
    dispatch(fetchMasterPlan()),
    dispatch(fetchDocuments()),
    dispatch(fetchActions()),
    dispatch(fetchDashboard()),
  ]);
});

// ---- CRUD Người dùng ----
export const createUser = createAsyncThunk(
  'admin/createUser',
  async (input: {
    username: string; password: string; fullName: string;
    email?: string; departmentId?: number | null; roleCodes?: string[]; active?: boolean;
  }, { dispatch }) => {
    const user = await api.createUser(input);
    await Promise.all([dispatch(fetchAdmin()), dispatch(fetchLookups())]);
    return user;
  },
);

export const updateUser = createAsyncThunk(
  'admin/updateUser',
  async (input: {
    id: number;
    patch: {
      username?: string; password?: string; fullName?: string;
      email?: string; departmentId?: number | null; roleCodes?: string[]; active?: boolean;
    };
  }, { dispatch }) => {
    const user = await api.updateUser(input.id, input.patch);
    await Promise.all([dispatch(fetchAdmin()), dispatch(fetchLookups())]);
    return user;
  },
);

export const deleteUser = createAsyncThunk('admin/deleteUser', async (id: number, { dispatch }) => {
  const res = await api.deleteUser(id);
  await Promise.all([dispatch(fetchAdmin()), dispatch(fetchLookups())]);
  return res;
});

// ---- CRUD Vai trò & Phân quyền ----
export const createRole = createAsyncThunk(
  'admin/createRole',
  async (input: { code: string; name: string; description?: string; permissions?: string[] }, { dispatch }) => {
    const role = await api.createRole(input);
    await dispatch(fetchAdmin());
    return role;
  },
);

export const updateRole = createAsyncThunk(
  'admin/updateRole',
  async (input: { id: number; patch: { name?: string; description?: string; permissions?: string[] } }, { dispatch }) => {
    const role = await api.updateRole(input.id, input.patch);
    await dispatch(fetchAdmin());
    return role;
  },
);

export const deleteRole = createAsyncThunk('admin/deleteRole', async (id: number, { dispatch }) => {
  const res = await api.deleteRole(id);
  await dispatch(fetchAdmin());
  return res;
});

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdmin.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchAdmin.fulfilled, (state, action) => {
        state.users = action.payload.users;
        state.roles = action.payload.roles;
        state.status = 'succeeded';
      })
      .addCase(fetchAdmin.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(resetDemo.pending, (state) => {
        state.resetting = true;
      })
      .addCase(resetDemo.fulfilled, (state) => {
        state.resetting = false;
      })
      .addCase(resetDemo.rejected, (state) => {
        state.resetting = false;
      })
      // CRUD users/roles: dùng chung cờ saving cho mọi mutation.
      .addMatcher(
        (action) => action.type.startsWith('admin/create') || action.type.startsWith('admin/update') || action.type.startsWith('admin/delete'),
        (state, action) => {
          if (action.type.endsWith('/pending')) state.saving = true;
          if (action.type.endsWith('/fulfilled') || action.type.endsWith('/rejected')) state.saving = false;
        },
      );
  },
});

export default adminSlice.reducer;

