import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from './AdminPage';

const authState = vi.hoisted(() => ({ perms: [] as string[] }));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin', fullName: 'Admin', roleCodes: ['super_admin'] },
    token: 'x',
    can: (p: string) => authState.perms.includes(p),
    canAny: (ps: string[]) => ps.some((p) => authState.perms.includes(p)),
  }),
}));

vi.mock('../services/ai', () => ({
  AI_PROVIDER_META: { openai: { label: 'OpenAI', defaultModel: 'gpt-4o-mini', docs: 'https://example.com' } },
  loadAiSettings: () => ({ provider: 'openai', apiKey: '', model: 'gpt-4o-mini', enabled: false }),
  saveAiSettings: vi.fn(),
  analyzeWithAi: vi.fn(async () => 'ok'),
  isAiConfigured: () => true,
}));

import lookupsReducer from '../store/slices/lookupsSlice';
import dashboardReducer from '../store/slices/dashboardSlice';
import masterPlanReducer from '../store/slices/masterPlanSlice';
import documentsReducer from '../store/slices/documentsSlice';
import actionsReducer from '../store/slices/actionsSlice';
import adminReducer from '../store/slices/adminSlice';

function renderPage(section: 'all' | 'users' | 'functions' | 'settings' = 'all', withMasterData = false) {
  const store = configureStore({
    reducer: {
      lookups: lookupsReducer,
      dashboard: dashboardReducer,
      masterPlan: masterPlanReducer,
      documents: documentsReducer,
      actions: actionsReducer,
      admin: adminReducer,
    },
    preloadedState: {
      lookups: { people: [], departments: [], phases: [], documentStatuses: [], status: 'succeeded' as const },
      dashboard: { data: null, status: 'succeeded' as const },
      masterPlan: { phases: [], tasks: [], plans: [], status: 'succeeded' as const, updating: false },
      documents: { items: [], status: 'succeeded' as const, transitioning: false, creating: false, updating: false, uploading: false, deleting: false },
      actions: { items: [], status: 'succeeded' as const, saving: false, updating: false },
      admin: {
        users: [],
        roles: [],
        departments: withMasterData
          ? [
              { id: 21, code: 'DPT-EDIT', name: 'Phòng ban sửa', description: 'Mô tả phòng ban', isActive: false },
              { id: 24, code: 'DPT-SECOND', name: 'Phòng ban thứ hai', description: 'Mô tả thứ hai', isActive: true },
            ]
          : [],
        phases: withMasterData
          ? [
              { id: 22, code: 'PHASE-EDIT', name: 'Giai đoạn sửa', sortOrder: 17, startDate: '2026-10-01', endDate: '2026-10-31' },
              { id: 25, code: 'PHASE-SECOND', name: 'Giai đoạn thứ hai', sortOrder: 4, startDate: '2026-11-01', endDate: '2026-11-30' },
            ]
          : [],
        documentStatuses: withMasterData
          ? [
              { id: 23, code: 'DOC-EDIT', label: 'Trạng thái sửa', color: '#ff0000', sortOrder: 19, isActive: false, isSystem: false },
              { id: 26, code: 'DOC-SECOND', label: 'Trạng thái thứ hai', color: '#00ff00', sortOrder: 2, isActive: true, isSystem: false },
            ]
          : [],
        status: 'succeeded' as const,
        departmentsStatus: 'succeeded' as const,
        phasesStatus: 'succeeded' as const,
        documentStatusesStatus: 'succeeded' as const,
        resetting: false,
        saving: false,
      },
    },
  });

  return render(
    <Provider store={store}>
      <AntdApp>
        <AdminPage section={section} />
      </AntdApp>
    </Provider>,
  );
}

beforeEach(() => {
  authState.perms = [
    'user.create', 'user.update', 'user.view',
    'role.manage',
    'department.manage', 'department.view',
    'master_plan.create', 'master_plan.update', 'master_plan.delete',
    'document_status.manage',
    'document.create', 'document.view',
  ];
});

describe('AdminPage master-data management', () => {
  it('shows the CRUD master-data section for phases, departments, and document statuses', () => {
    renderPage('functions');

    expect(screen.getByText('Quản lý master data')).toBeInTheDocument();
    expect(screen.getByText('Nhóm công việc')).toBeInTheDocument();
    expect(screen.getByText('Phòng ban')).toBeInTheDocument();
    expect(screen.getByText('Trạng thái tài liệu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thêm nhóm công việc/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thêm phòng ban/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thêm trạng thái/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Quản lý master data/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /Người dùng/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Tích hợp AI/i })).not.toBeInTheDocument();
  });

  it('shows the user and role tabs for the user submenu', () => {
    renderPage('users');

    expect(screen.getByRole('tab', { name: /Người dùng/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Vai trò & Phân quyền/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Quản lý master data/i })).not.toBeInTheDocument();
  });

  it('loads the selected department into the edit form', () => {
    renderPage('functions', true);

    const row = screen.getByText('DPT-EDIT').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('button', { name: /Sửa/i }));

    expect(screen.getByDisplayValue('DPT-EDIT')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Phòng ban sửa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mô tả phòng ban')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Hoạt động' })).toHaveAttribute('aria-checked', 'false');
  });

  it('loads the selected work group into the edit form', () => {
    renderPage('functions', true);

    const row = screen.getByText('PHASE-EDIT').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('button', { name: /Sửa/i }));

    expect(screen.getByDisplayValue('PHASE-EDIT')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Giai đoạn sửa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('17')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-10-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-10-31')).toBeInTheDocument();
  });

  it('loads the selected document status into the edit form', () => {
    renderPage('functions', true);

    const row = screen.getByText('DOC-EDIT').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('button', { name: /Sửa/i }));

    expect(screen.getByDisplayValue('Trạng thái sửa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('#ff0000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('19')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Kích hoạt' })).toHaveAttribute('aria-checked', 'false');
  });

  it('reinitializes each master-data edit form when switching records', async () => {
    renderPage('functions', true);

    const cases = [
      { firstValue: 'PHASE-EDIT', secondCode: 'PHASE-SECOND', secondValue: 'Giai đoạn thứ hai' },
      { firstValue: 'DPT-EDIT', secondCode: 'DPT-SECOND', secondValue: 'Phòng ban thứ hai' },
      { firstValue: 'Trạng thái sửa', secondCode: 'DOC-SECOND', secondValue: 'Trạng thái thứ hai' },
    ];

    for (const { firstValue, secondCode, secondValue } of cases) {
      const firstCode = firstValue === 'Trạng thái sửa' ? 'DOC-EDIT' : firstValue;
      const firstRow = screen.getByText(firstCode).closest('tr');
      expect(firstRow).not.toBeNull();
      fireEvent.click(within(firstRow!).getByRole('button', { name: /Sửa/i }));
      expect(await screen.findByDisplayValue(firstValue)).toBeInTheDocument();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      const secondRow = screen.getByText(secondCode).closest('tr');
      expect(secondRow).not.toBeNull();
      fireEvent.click(within(secondRow!).getByRole('button', { name: /Sửa/i }));
      expect(await screen.findByDisplayValue(secondValue)).toBeInTheDocument();
      expect(screen.queryByDisplayValue(firstValue)).not.toBeInTheDocument();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  });

  it('uses clean defaults when opening a create form after editing a record', async () => {
    renderPage('functions', true);

    const phaseRow = screen.getByText('PHASE-EDIT').closest('tr');
    fireEvent.click(within(phaseRow!).getByRole('button', { name: /Sửa/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Thêm nhóm công việc/i }));
    expect(screen.getByLabelText('Mã giai đoạn')).toHaveValue('');
    expect(screen.getByLabelText('Tên giai đoạn')).toHaveValue('');
    expect(screen.getByDisplayValue('0')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const departmentRow = screen.getByText('DPT-EDIT').closest('tr');
    fireEvent.click(within(departmentRow!).getByRole('button', { name: /Sửa/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Thêm phòng ban/i }));
    expect(screen.getByLabelText('Mã phòng ban')).toHaveValue('');
    expect(screen.getByLabelText('Tên phòng ban')).toHaveValue('');
    expect(screen.getByRole('switch', { name: 'Hoạt động' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const statusRow = screen.getByText('DOC-EDIT').closest('tr');
    fireEvent.click(within(statusRow!).getByRole('button', { name: /Sửa/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Thêm trạng thái/i }));
    expect(screen.getByLabelText('Tên trạng thái')).toHaveValue('');
    expect(screen.getByLabelText('Màu sắc')).toHaveValue('#1677ff');
    expect(screen.getByRole('switch', { name: 'Kích hoạt' })).toHaveAttribute('aria-checked', 'true');
  });

  it('opens the AI settings tab for the settings submenu', () => {
    renderPage('settings');

    expect(screen.getByRole('tab', { name: /Tích hợp AI/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /Người dùng/i })).not.toBeInTheDocument();
  });
});
