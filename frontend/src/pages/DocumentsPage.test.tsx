// DocumentsPage: hiển thị cột "Phiên bản" (version từng tài liệu) ngay sau "Tên tài liệu";
// nút "Phiên bản mới" nằm trong cột Workflow và CHỈ render khi published + có quyền.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { App as AntdApp } from 'antd';
import DocumentsPage from './DocumentsPage';
import { ApiError } from '../services/api';
import type { DocumentItem, DocumentStatus } from '../mock/types';

// --- jsdom thiếu API antd có thể dùng tới ---
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// --- Giả lập RBAC: đổi authState.perms từng test ---
const authState = vi.hoisted(() => ({ perms: [] as string[] }));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    can: (p: string) => authState.perms.includes(p),
    canAny: (ps: string[]) => ps.some((p) => authState.perms.includes(p)),
  }),
}));

// --- Mock services/api: chỉ những endpoint DocumentsPage/documentsSlice gọi trong test ---
const apiMock = vi.hoisted(() => ({
  documents: vi.fn(),
  newDocumentVersion: vi.fn(),
  transitionDocument: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  lookups: vi.fn(),
  dashboard: vi.fn(),
}));
vi.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  api: apiMock,
}));

// Reducers như store thật – tạo store mới mỗi test để không dính state giữa các test.
import lookupsReducer from '../store/slices/lookupsSlice';
import dashboardReducer from '../store/slices/dashboardSlice';
import masterPlanReducer from '../store/slices/masterPlanSlice';
import documentsReducer from '../store/slices/documentsSlice';
import actionsReducer from '../store/slices/actionsSlice';
import adminReducer from '../store/slices/adminSlice';

const ALL_STATUSES: DocumentStatus[] = [
  'draft', 'reviewing', 'approval_pending', 'approved', 'published', 'obsolete', 'archived',
];
const DOC_PERMS = [
  'document.create', 'document.update', 'document.submit',
  'document.review', 'document.approve', 'document.publish',
];

function makeDoc(id: number, status: DocumentStatus): DocumentItem {
  return {
    id,
    code: `QT-${String(id).padStart(2, '0')}.01`,
    name: `Tài liệu ${id}`,
    docType: 'procedure',
    departmentId: 1,
    ownerId: 1,
    currentVersion: 'V1.0',
    status,
    workflowStep: 1,
    versions: [],
    approvals: [],
  };
}

function renderPage(docs: DocumentItem[]) {
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
      // status='succeeded' → hooks không dispatch fetch khi mount.
      lookups: { people: [], departments: [], phases: [], status: 'succeeded' as const },
      documents: {
        items: docs,
        status: 'succeeded' as const,
        transitioning: false,
        creating: false,
        updating: false,
        uploading: false,
        deleting: false,
      },
    },
  });
  return render(
    <Provider store={store}>
      <AntdApp>
        <DocumentsPage />
      </AntdApp>
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.perms = [];
  apiMock.documents.mockResolvedValue([]);
  apiMock.lookups.mockResolvedValue({ people: [], departments: [], phases: [] });
  apiMock.dashboard.mockResolvedValue(null);
  // Sau khi tạo phiên bản mới, BE reset status về draft (giữ nguyên flow hiện tại).
  apiMock.newDocumentVersion.mockResolvedValue(makeDoc(1, 'draft'));
  apiMock.deleteDocument.mockResolvedValue({ status: 'ok' });
});

describe('DocumentsPage version UI', () => {
  it('hiển thị cột "Phiên bản" (version từng tài liệu) ngay sau "Tên tài liệu"', async () => {
    authState.perms = [...DOC_PERMS];
    renderPage([makeDoc(1, 'published'), makeDoc(2, 'draft')]);
    // Đợi dữ liệu render xong (2 dòng trong bảng chính).
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
    expect(screen.getByText('QT-02.01')).toBeInTheDocument();
    // Header bảng chính: có cột Phiên bản ngay sau Tên tài liệu.
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    expect(headers.some((t) => t.includes('Phiên bản'))).toBe(true);
    expect(headers.indexOf('Tên tài liệu') + 1).toBe(headers.indexOf('Phiên bản'));
    // Mỗi dòng hiển thị đúng version của tài liệu đó.
    const row1 = screen.getByText('QT-01.01').closest('tr');
    const row2 = screen.getByText('QT-02.01').closest('tr');
    expect(row1!.textContent).toContain('V1.0');
    expect(row2!.textContent).toContain('V1.0');
    // "Đã cập nhật" và "Cập nhật trạng thái" là một → chỉ giữ "Cập nhật trạng thái".
    expect(headers.some((t) => t === 'Đã cập nhật')).toBe(false);
    expect(headers.some((t) => t.includes('Cập nhật trạng thái'))).toBe(true);
    // Thứ tự cuối bảng: "Ngày tạo" → "Cập nhật trạng thái" → "Thao tác" → Workflow (CR-DOC-UI-002).
    expect(headers.indexOf('Ngày tạo') + 1).toBe(headers.indexOf('Cập nhật trạng thái'));
    expect(headers.indexOf('Cập nhật trạng thái') + 1).toBe(headers.indexOf('Thao tác'));
    expect(headers.indexOf('Thao tác') + 1).toBe(headers.indexOf('Workflow'));
    // Cột Workflow vẫn còn.
    expect(headers.some((t) => t.includes('Workflow'))).toBe(true);
  });

  it('AC-02 + AC-04 + AC-05: published + có quyền → 1 nút "Phiên bản mới" (không disabled) trong cột Workflow', async () => {
    authState.perms = [...DOC_PERMS];
    renderPage([makeDoc(1, 'published')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
    const btns = screen.getAllByRole('button', { name: 'Phiên bản mới' });
    expect(btns).toHaveLength(1);
    expect(btns[0]).not.toBeDisabled();
    // Nút nằm trong cùng hàng của bảng và thuộc cột Workflow (cell chứa nút thuộc hàng QT-01.01).
    const row = screen.getByText('QT-01.01').closest('tr');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('Phiên bản mới');
  });

  it('AC-06: không duplicate nút "Phiên bản mới" ở vị trí cũ', async () => {
    authState.perms = [...DOC_PERMS];
    renderPage([makeDoc(1, 'published')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Phiên bản mới' })).toHaveLength(1);
  });

  it('AC-07: published nhưng không có quyền → ẩn nút', async () => {
    authState.perms = []; // không có document.create|document.update
    renderPage([makeDoc(1, 'published')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phiên bản mới' })).toBeNull();
  });

  it.each([['draft'], ['reviewing'], ['approval_pending'], ['approved'], ['obsolete'], ['archived']] as Array<[DocumentStatus]>)(
    'AC-03: status %s (có quyền) → ẩn nút "Phiên bản mới"',
    async (status) => {
      authState.perms = [...DOC_PERMS];
      const { unmount } = renderPage([makeDoc(1, status)]);
      expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Phiên bản mới' })).toBeNull();
      unmount();
    },
  );

  it('AC-03 (tổng hợp): danh sách nhiều status chỉ published có nút', async () => {
    authState.perms = [...DOC_PERMS];
    const docs = ALL_STATUSES.map((s, i) => makeDoc(i + 1, s));
    renderPage(docs);
    expect(await screen.findByText('QT-01.01', {}, { timeout: 10000 })).toBeInTheDocument();
    // Chỉ 1 published trong ALL_STATUSES → đúng 1 nút.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Phiên bản mới' })).toHaveLength(1), { timeout: 10000 });
  }, 15000);

  it('AC-08: click "Phiên bản mới" vẫn chạy đúng versioning flow hiện tại', async () => {
    authState.perms = [...DOC_PERMS];
    renderPage([makeDoc(1, 'published')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Phiên bản mới' }));
    // Modal reuse hiện tại mở ra (title "Tạo phiên bản mới – QT-01.01" — khớp chính xác để tránh trùng paragraph).
    expect(await screen.findByText('Tạo phiên bản mới – QT-01.01', {}, { timeout: 10000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên bản' }));
    await waitFor(() => expect(apiMock.newDocumentVersion).toHaveBeenCalled(), { timeout: 10000 });
    // Thunk gọi BE: (id, { version: undefined, changeSummary: ... })
    expect(apiMock.newDocumentVersion).toHaveBeenCalledWith(1, expect.objectContaining({ version: undefined }));
  }, 15000);

  it('AC-09: checkbox "Tự động đánh số phiên bản (auto-version)" vẫn tồn tại trong form', async () => {
    authState.perms = [...DOC_PERMS];
    renderPage([makeDoc(1, 'draft')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Thêm tài liệu/ }));
    expect(await screen.findByText('Tự động đánh số phiên bản (auto-version)')).toBeInTheDocument();
  });
});

// ============================================================
// CR-DOC-UI-002: cột "Thao tác" + nút Xoá tài liệu
// ============================================================
describe('DocumentsPage cột Thao tác + nút Xoá', () => {
  it('AC-01: cột "Thao tác" tồn tại và nằm ngay trước cột "Workflow"', async () => {
    authState.perms = [...DOC_PERMS, 'document.delete'];
    renderPage([makeDoc(1, 'draft')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    expect(headers.indexOf('Thao tác')).toBeGreaterThanOrEqual(0);
    expect(headers.indexOf('Thao tác') + 1).toBe(headers.indexOf('Workflow'));
  });

  it('AC-02: có document.delete (draft) → hiện nút "Xoá"; thiếu quyền → ẩn', async () => {
    authState.perms = [...DOC_PERMS, 'document.delete'];
    const { unmount } = renderPage([makeDoc(1, 'draft')]);
    expect(await screen.findByText('QT-01.01', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Xoá/ })).toHaveLength(1);
    unmount();

    authState.perms = [...DOC_PERMS]; // thiếu document.delete
    renderPage([makeDoc(1, 'draft')]);
    expect(await screen.findByText('QT-01.01', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xoá/ })).toBeNull();
  }, 20000);

  it('AC-03: published → ẩn nút "Xoá" (kể cả có quyền) – khớp policy 409 của BE/mock', async () => {
    authState.perms = [...DOC_PERMS, 'document.delete'];
    renderPage([makeDoc(1, 'published')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xoá/ })).toBeNull();
  });

  it('AC-04: bấm "Xoá" → ConfirmModal hiện ra; Hủy → KHÔNG gọi API', async () => {
    authState.perms = [...DOC_PERMS, 'document.delete'];
    renderPage([makeDoc(1, 'draft')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Xoá/ }));
    // Modal xác nhận chung (ConfirmModal) hiện ra.
    expect(await screen.findByText('Xác nhận xóa tài liệu', {}, { timeout: 10000 })).toBeInTheDocument();
    // Hủy → không gọi API.
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(apiMock.deleteDocument).not.toHaveBeenCalled();
  }, 15000);

  it('AC-05: xác nhận trong modal → gọi deleteDocument(id) → reload list (documents được gọi lại)', async () => {
    authState.perms = [...DOC_PERMS, 'document.delete'];
    renderPage([makeDoc(1, 'draft')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();
    const listCallsBefore = apiMock.documents.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /Xoá/ }));
    expect(await screen.findByText('Xác nhận xóa tài liệu', {}, { timeout: 10000 })).toBeInTheDocument();
    // Nút "Xoá" trong footer modal (có 2 nút Xoá: cột Action + modal → lấy trong dialog).
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(apiMock.deleteDocument).toHaveBeenCalledWith(1), { timeout: 10000 });
    // Thunk sau khi xóa sẽ dispatch fetchDocuments (+ fetchDashboard) → gọi API list lại.
    await waitFor(() => expect(apiMock.documents.mock.calls.length).toBeGreaterThan(listCallsBefore), { timeout: 10000 });
  }, 15000);

  it('AC-06: lỗi API khi xóa (409/403) → hiển thị message lỗi, không crash', async () => {
    authState.perms = [...DOC_PERMS, 'document.delete'];
    apiMock.deleteDocument.mockRejectedValue(new ApiError(409, 'Không thể xóa tài liệu đã ban hành (published).'));
    renderPage([makeDoc(1, 'draft')]);
    expect(await screen.findByText('QT-01.01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Xoá/ }));
    expect(await screen.findByText('Xác nhận xóa tài liệu', {}, { timeout: 10000 })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xoá' }));

    expect(
      await screen.findByText('Không thể xóa tài liệu đã ban hành (published).', {}, { timeout: 10000 }),
    ).toBeInTheDocument();
  }, 15000);
});

// ============================================================
// Phân trang danh sách tài liệu (defaultPageSize – uncontrolled)
// ============================================================
describe('DocumentsPage phân trang', () => {
  /** Mở Select đổi cỡ trang trong footer bảng rồi chọn option theo tiền lệ label ("50"...). */
  async function selectPageSize(labelPrefix: string) {
    const changer = document.querySelector('.ant-pagination-options-size-changer');
    expect(changer).not.toBeNull();
    fireEvent.mouseDown(changer!.querySelector('.ant-select-selector')!);
    const options = await screen.findAllByRole('option');
    const target = options.find((o) => o.textContent?.trim().startsWith(labelPrefix));
    expect(target, `Không tìm thấy option cỡ trang "${labelPrefix}"`).toBeTruthy();
    fireEvent.click(target!);
  }

  it('mặc định 100 tài liệu/trang; đổi cỡ trang 50 → hiển thị đúng 50 dòng', async () => {
    authState.perms = [...DOC_PERMS];
    const docs = Array.from({ length: 125 }, (_, i) => makeDoc(i + 1, 'draft'));
    renderPage(docs);

    // Mặc định: 125 tài liệu → 100 dòng đầu, dòng 101 không nằm ở trang 1.
    expect(await screen.findByText('QT-100.01', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByText('QT-101.01')).toBeNull();
    expect(screen.getByText('1–100 / 125 tài liệu')).toBeInTheDocument();

    // Đổi cỡ trang 50 → bảng hiển thị đúng 50 dòng tương ứng.
    await selectPageSize('50');
    expect(await screen.findByText('QT-50.01', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByText('QT-51.01')).toBeNull();
    expect(screen.getByText('1–50 / 125 tài liệu')).toBeInTheDocument();

    // Đổi cỡ trang 200 (> tổng) → hiển thị toàn bộ 125 dòng.
    await selectPageSize('200');
    expect(await screen.findByText('QT-125.01', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText('1–125 / 125 tài liệu')).toBeInTheDocument();
  }, 40000);
});

