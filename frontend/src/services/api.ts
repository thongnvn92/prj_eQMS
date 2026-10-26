// API facade – UI/hooks chỉ gọi `api.*`.
// Chế độ chạy xác định bởi `.env` (xem .env.example):
//   - VITE_USE_MOCK='true'  → mockApi (in-memory, không cần backend) cho dev/test nhanh.
//   - còn lại (mặc định)   → Laravel API thật qua fetch(`${VITE_API_URL}/api/...`)
//                             với header Authorization: Bearer <token>.
// KHÔNG fallback âm thầm sang mock khi API thật lỗi – lỗi ném ApiError cho UI xử lý.
import { mockApi, ApiError } from '../mock/api';
import type {
  ActionItem, DashboardStats, Department, DocAction,
  DocumentFile, DocumentItem, DocumentStatusItem, MasterPlan, OpportunityItem, OpportunityLevel, Phase,
  ReviewFrequency, RiskAssessmentItem, RiskDashboardStats, RiskItem, RiskLevel, RoStatus, SessionUser, Task, TaskStatus,
} from '../mock/types';

// ---- Cấu hình môi trường (không hardcode URL backend trong source) ----
/** Origin của Laravel API; để trống nếu chạy sau Vite proxy '/api'. */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const token = () => localStorage.getItem('eqms.session');

/** Thông báo mặc định theo HTTP status khi backend không trả message. */
function defaultMessage(status: number): string {
  switch (status) {
    case 400: return 'Yêu cầu không hợp lệ.';
    case 401: return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
    case 403: return 'Bạn không có quyền thực hiện thao tác này.';
    case 404: return 'Không tìm thấy dữ liệu.';
    case 409: return 'Thao tác không hợp lệ tại trạng thái hiện tại.';
    case 422: return 'Dữ liệu không hợp lệ.';
    default: return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  }
}

/**
 * HTTP client dùng chung: JSON in/out, Bearer token tự gắn, lỗi thống nhất.
 * - 401 ở request cần auth → phát sự kiện 'eqms:unauthorized' để AuthContext logout.
 * - Lỗi mạng (backend tắt) → ApiError(0, ...) – không bao giờ fallback sang mock.
 */
async function http<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.');
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }

  if (!res.ok) {
    const data = payload as { message?: string; errors?: Record<string, string[]> } | null;

    // 422 validation: ưu tiên message lỗi đầu tiên backend trả.
    let message = data?.message ?? defaultMessage(res.status);
    if (res.status === 422 && data?.errors) {
      const first = Object.values(data.errors).flat()[0];
      if (first) message = first;
    }

    // Hết hạn / token sai ở request cần auth → báo để AuthContext logout.
    if (res.status === 401 && auth) {
      window.dispatchEvent(new CustomEvent('eqms:unauthorized'));
    }

    throw new ApiError(res.status, message);
  }

  return payload as T;
}

// ---- Kiểu phụ cho Admin (khớp SafeUser/RoleRow của adminSlice) ----
interface AdminUserRow {
  id: number; username: string; fullName: string; email: string;
  departmentId: number | null; roleCodes: string[]; active: boolean;
}
interface AdminRoleRow { code: string; name: string; permissions: string[]; }

export const api = {
  login: (username: string, password: string) =>
    USE_MOCK
      ? mockApi.login(username, password)
      : http<{ token: string; user: SessionUser }>('/login', {
          method: 'POST',
          body: { username, password },
          auth: false,
        }),

  // /me: hết hạn token/sai token → trả null (khớp contract mock) để AuthContext logout sạch.
  me: async (): Promise<SessionUser | null> => {
    if (USE_MOCK) return mockApi.me(token());
    try {
      return await http<SessionUser>('/me');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },

  lookups: () =>
    USE_MOCK
      ? mockApi.getLookups(token())
      : http<{
          people: { id: number; fullName: string }[];
          departments: Department[];
          phases: Phase[];
          documentStatuses: DocumentStatusItem[];
        }>('/lookups'),

  masterPlan: () =>
    USE_MOCK ? mockApi.getMasterPlan(token()) : http<{ phases: Phase[]; tasks: Task[] }>('/master-plan'),

  dashboard: () => (USE_MOCK ? mockApi.getDashboard(token()) : http<DashboardStats>('/dashboard')),

  updateTask: (id: number, patch: { status?: TaskStatus; progress?: number; ownerId?: number | null; ownerName?: string | null; note?: string }) =>
    USE_MOCK
      ? mockApi.updateTask(token(), id, patch)
      : http<Task>(`/master-plan/tasks/${id}`, { method: 'PATCH', body: patch }),

  /**
   * CR Master Plan ISO – cập nhật TIẾN ĐỘ một task.
   * Owner cập nhật task của mình; người có master_plan.update cập nhật task bất kỳ.
   */
  updateTaskProgress: (id: number, progress: number) =>
    USE_MOCK
      ? mockApi.updateTask(token(), id, { progress })
      : http<Task>(`/master-plan/tasks/${id}/progress`, { method: 'PATCH', body: { progress } }),

  documents: (query: { departmentId?: number; status?: string; docType?: string; keyword?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {}) => {
    if (USE_MOCK) return mockApi.listDocuments(token());
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });
    const qs = params.toString();
    return http<DocumentItem[]>(`/documents${qs ? `?${qs}` : ''}`);
  },

  createDocument: (input: {
    code: string; name: string; docType: DocumentItem['docType'];
    departmentId?: number | null; ownerId?: number | null; ownerName?: string | null;
    relatedTaskId?: number | null; description?: string; changeSummary?: string;
    autoVersion?: boolean;
  }) =>
    USE_MOCK
      ? mockApi.createDocument(token(), input)
      : http<DocumentItem>('/documents', { method: 'POST', body: input }),

  // ---------- Import hàng loạt (bulk) – 1 request thay cho N lần create ----------
  importDocuments: async (
    rows: Array<{ line?: number; code: string; name: string; docType: DocumentItem['docType']; departmentId?: number | null; ownerId?: number | null; ownerName?: string | null; description?: string }>,
  ): Promise<ImportResult> => {
    if (!USE_MOCK) return http<ImportResult>('/documents/import', { method: 'POST', body: { rows } });
    const errors: ImportRowError[] = [];
    let imported = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const { line, ...input } = rows[i];
      try {
        await mockApi.createDocument(token(), input);
        imported += 1;
      } catch (e) {
        errors.push({ index: i, line, message: e instanceof ApiError ? e.message : String(e) });
      }
    }
    return { imported, errors };
  },

  updateDocument: (id: number, patch: {
    code?: string; name?: string; docType?: DocumentItem['docType'];
    departmentId?: number | null; ownerId?: number | null; ownerName?: string | null;
    relatedTaskId?: number | null; description?: string; changeSummary?: string;
    autoVersion?: boolean; version?: string;
  }) =>
    USE_MOCK
      ? mockApi.updateDocument(token(), id, patch)
      : http<DocumentItem>(`/documents/${id}`, { method: 'PATCH', body: patch }),

  /** Xóa tài liệu. Quyền document.delete; published → 409 (BE/mock chặn). */
  deleteDocument: (id: number) =>
    USE_MOCK
      ? mockApi.deleteDocument(token(), id)
      : http<{ status: string }>(`/documents/${id}`, { method: 'DELETE' }),

  // ---------- Tệp đính kèm tài liệu (revision kiểu SVN) ----------
  documentFiles: (documentId: number) =>
    USE_MOCK
      ? mockApi.documentFiles(token(), documentId)
      : http<DocumentFile[]>(`/documents/${documentId}/files`),

  /**
   * Upload NHIỀU file đính kèm (multipart, tối đa 10 file/lần).
   * Trả về DocumentFile[] vừa tạo (mỗi file 1 revision mới).
   */
  uploadDocumentFile: async (documentId: number, files: File[], changeNote?: string): Promise<DocumentFile[]> => {
    if (USE_MOCK) return mockApi.uploadDocumentFile(token(), documentId, files, changeNote);
    const form = new FormData();
    files.forEach((f) => form.append('files[]', f));
    if (changeNote) form.append('changeNote', changeNote);

    const headers: Record<string, string> = { Accept: 'application/json' };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;

    let res: Response;
    try {
      res = await fetch(`${BASE}/api/documents/${documentId}/files`, { method: 'POST', headers, body: form });
    } catch {
      throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.');
    }
    const text = await res.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const data = payload as { message?: string; errors?: Record<string, string[]> } | null;
      let message = data?.message ?? defaultMessage(res.status);
      if (res.status === 422 && data?.errors) {
        const first = Object.values(data.errors).flat()[0];
        if (first) message = first;
      }
      if (res.status === 401) window.dispatchEvent(new CustomEvent('eqms:unauthorized'));
      throw new ApiError(res.status, message);
    }
    return payload as DocumentFile[];
  },

  /** Tạo phiên bản mới cho tài liệu đã ban hành + bắt đầu lại workflow. */
  newDocumentVersion: (id: number, input: { version?: string; changeSummary?: string }) =>
    USE_MOCK
      ? mockApi.newDocumentVersion(token(), id, input)
      : http<DocumentItem>(`/documents/${id}/new-version`, { method: 'POST', body: input }),

  /** Bật/tắt tự động đánh version cho tài liệu. */
  toggleAutoVersion: (id: number, autoVersion: boolean) =>
    USE_MOCK
      ? mockApi.toggleAutoVersion(token(), id, autoVersion)
      : http<DocumentItem>(`/documents/${id}/auto-version`, { method: 'PATCH', body: { autoVersion } }),

  /**
   * Tải/xem file. PDF mở tab mới (xem trực tiếp), file khác tải về.
   * Cần Bearer token → fetch blob rồi tạo object URL (không mở trực tiếp bằng href).
   */
  downloadDocumentFile: async (documentFileId: number, originalName: string, mimeType?: string | null): Promise<void> => {
    const headers: Record<string, string> = {};
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;

    let res: Response;
    try {
      res = await fetch(`${BASE}/api/documents/files/${documentFileId}/download`, { headers });
    } catch {
      throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.');
    }
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new CustomEvent('eqms:unauthorized'));
      throw new ApiError(res.status, defaultMessage(res.status));
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const isPdf = (mimeType ?? '').toLowerCase() === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      window.open(url, '_blank', 'noopener');
      // Giải phóng sau khi tab mới đã tải.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  },

  // ---------- MASTER PLAN CRUD (nhiều kế hoạch, sub-task, reorder) ----------
  masterPlans: () => (USE_MOCK ? mockApi.listMasterPlans(token()) : http<MasterPlan[]>('/master-plan/plans')),

  createMasterPlan: (input: {
    code: string; name: string; cycleLabel: string; startDate: string; endDate: string; description?: string;
  }) =>
    USE_MOCK
      ? mockApi.createMasterPlan(token(), input)
      : http<MasterPlan>('/master-plan/plans', { method: 'POST', body: input }),

  updateMasterPlan: (id: number, patch: {
    code?: string; name?: string; cycleLabel?: string; startDate?: string; endDate?: string; status?: string; description?: string;
  }) =>
    USE_MOCK
      ? mockApi.updateMasterPlan(token(), id, patch)
      : http<MasterPlan>(`/master-plan/plans/${id}`, { method: 'PATCH', body: patch }),

  deleteMasterPlan: (id: number) =>
    USE_MOCK
      ? mockApi.deleteMasterPlan(token(), id)
      : http<{ status: string }>(`/master-plan/plans/${id}`, { method: 'DELETE' }),

  createTask: (input: {
    phaseId: number; parentId?: number | null; code: string; name: string;
    ownerId?: number | null; ownerName?: string | null; departmentId?: number | null; priority?: Task['priority'];
    startDate: string; dueDate: string; note?: string;
  }) =>
    USE_MOCK
      ? mockApi.createTask(token(), input)
      : http<Task>('/master-plan/tasks', { method: 'POST', body: input }),

  // ---------- Import hàng loạt (bulk) – 1 request thay cho N lần create ----------
  importTasks: async (
    rows: Array<{ line?: number; phaseId: number; parentId?: number | null; code: string; name: string; ownerId?: number | null; ownerName?: string | null; departmentId?: number | null; priority?: Task['priority']; startDate: string; dueDate: string; note?: string }>,
  ): Promise<ImportResult> => {
    if (!USE_MOCK) return http<ImportResult>('/master-plan/tasks/import', { method: 'POST', body: { rows } });
    const errors: ImportRowError[] = [];
    let imported = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const { line, ...input } = rows[i];
      try {
        await mockApi.createTask(token(), input);
        imported += 1;
      } catch (e) {
        errors.push({ index: i, line, message: e instanceof ApiError ? e.message : String(e) });
      }
    }
    return { imported, errors };
  },

  deleteTask: (id: number) =>
    USE_MOCK
      ? mockApi.deleteTask(token(), id)
      : http<{ status: string }>(`/master-plan/tasks/${id}`, { method: 'DELETE' }),

  reorderTasks: (orderedIds: number[]) =>
    USE_MOCK
      ? mockApi.reorderTasks(token(), orderedIds)
      : http<{ status: string }>('/master-plan/tasks/reorder', { method: 'POST', body: { orderedIds } }),

  transitionDocument: (id: number, action: DocAction, comment?: string) =>
    USE_MOCK
      ? mockApi.transitionDocument(token(), id, action, comment)
      : http<DocumentItem>(`/documents/${id}/transition`, {
          method: 'POST',
          body: { action, ...(comment ? { comment } : {}) },
        }),

  actions: () => (USE_MOCK ? mockApi.listActions(token()) : http<ActionItem[]>('/actions')),

  updateAction: (id: number, patch: {
    status?: ActionItem['status']; progress?: number; result?: string; evidence?: string;
    title?: string; source?: ActionItem['source']; ownerId?: number | null; ownerName?: string | null; departmentId?: number | null; dueDate?: string;
    relatedRiskId?: number | null; relatedOpportunityId?: number | null;
  }) =>
    USE_MOCK
      ? mockApi.updateAction(token(), id, patch)
      : http<ActionItem>(`/actions/${id}`, { method: 'PATCH', body: patch }),

  createAction: (input: {
    code: string; title: string; description?: string; source: ActionItem['source'];
    departmentId?: number | null; ownerId?: number | null; ownerName?: string | null; issueDescription?: string;
    relatedDocumentId?: number | null; relatedTaskId?: number | null; dueDate: string;
    relatedRiskId?: number | null; relatedOpportunityId?: number | null;
  }) =>
    USE_MOCK
      ? mockApi.createAction(token(), input)
      : http<ActionItem>('/actions', { method: 'POST', body: input }),

  deleteAction: (id: number) =>
    USE_MOCK
      ? mockApi.deleteAction(token(), id)
      : http<{ status: string }>(`/actions/${id}`, { method: 'DELETE' }),

  // ---------- CR-RISK-OPPORTUNITY-001: Risk & Opportunity ----------
  risks: (query: { level?: RiskLevel | ''; status?: RoStatus | ''; departmentId?: number | ''; q?: string } = {}) => {
    if (USE_MOCK) return mockApi.listRisks(token(), query);
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });
    const qs = params.toString();
    return http<RiskItem[]>(`/risks${qs ? `?${qs}` : ''}`);
  },

  createRisk: (input: {
    sourceType: RiskItem['sourceType']; category?: string | null; objective?: string | null; description?: string | null;
    likelihood: number; impact: number; treatment?: string | null; expectedResult?: string | null;
    ownerId?: number | null; ownerName?: string | null; departmentId?: number | null; startDate?: string | null; dueDate?: string | null;
    reviewFrequency?: ReviewFrequency | null; nextReviewDate?: string | null;
  }) =>
    USE_MOCK
      ? mockApi.createRisk(token(), input)
      : http<RiskItem>('/risks', { method: 'POST', body: input }),

  risk: (id: number) => (USE_MOCK ? mockApi.getRisk(token(), id) : http<RiskItem>(`/risks/${id}`)),

  updateRisk: (id: number, patch: Partial<{
    category: string | null; objective: string | null; description: string | null; treatment: string | null;
    expectedResult: string | null; ownerId: number | null; departmentId: number | null;
    startDate: string | null; dueDate: string | null; reviewFrequency: ReviewFrequency | null;
    nextReviewDate: string | null; status: RoStatus; likelihood: number; impact: number;
  }>) =>
    USE_MOCK
      ? mockApi.updateRisk(token(), id, patch)
      : http<RiskItem>(`/risks/${id}`, { method: 'PATCH', body: patch }),

  evaluateRisk: (id: number, input: { likelihood: number; impact: number; comment?: string }) =>
    USE_MOCK
      ? mockApi.evaluateRisk(token(), id, input)
      : http<RiskItem>(`/risks/${id}/evaluate`, { method: 'POST', body: input }),

  riskHistory: (id: number) =>
    USE_MOCK
      ? mockApi.getRiskHistory(token(), id)
      : http<RiskAssessmentItem[]>(`/risks/${id}/history`),

  deleteRisk: (id: number) =>
    USE_MOCK
      ? mockApi.deleteRisk(token(), id)
      : http<{ status: string }>(`/risks/${id}`, { method: 'DELETE' }),

  opportunities: (query: { level?: OpportunityLevel | ''; status?: RoStatus | ''; departmentId?: number | ''; q?: string } = {}) => {
    if (USE_MOCK) return mockApi.listOpportunities(token(), query);
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });
    const qs = params.toString();
    return http<OpportunityItem[]>(`/opportunities${qs ? `?${qs}` : ''}`);
  },

  createOpportunity: (input: {
    sourceType: OpportunityItem['sourceType']; category?: string | null; objective?: string | null; description?: string | null;
    feasibility: number; benefit: number; solution?: string | null; expectedResult?: string | null;
    ownerId?: number | null; ownerName?: string | null; departmentId?: number | null; startDate?: string | null; dueDate?: string | null;
    reviewFrequency?: ReviewFrequency | null; nextReviewDate?: string | null;
  }) =>
    USE_MOCK
      ? mockApi.createOpportunity(token(), input)
      : http<OpportunityItem>('/opportunities', { method: 'POST', body: input }),

  opportunity: (id: number) => (USE_MOCK ? mockApi.getOpportunity(token(), id) : http<OpportunityItem>(`/opportunities/${id}`)),

  updateOpportunity: (id: number, patch: Partial<{
    category: string | null; objective: string | null; description: string | null; solution: string | null;
    expectedResult: string | null; actualResult: string | null; ownerId: number | null; departmentId: number | null;
    startDate: string | null; dueDate: string | null; reviewFrequency: ReviewFrequency | null;
    nextReviewDate: string | null; status: RoStatus; feasibility: number; benefit: number;
  }>) =>
    USE_MOCK
      ? mockApi.updateOpportunity(token(), id, patch)
      : http<OpportunityItem>(`/opportunities/${id}`, { method: 'PATCH', body: patch }),

  evaluateOpportunity: (id: number, input: { feasibility: number; benefit: number; comment?: string }) =>
    USE_MOCK
      ? mockApi.evaluateOpportunity(token(), id, input)
      : http<OpportunityItem>(`/opportunities/${id}/evaluate`, { method: 'POST', body: input }),

  deleteOpportunity: (id: number) =>
    USE_MOCK
      ? mockApi.deleteOpportunity(token(), id)
      : http<{ status: string }>(`/opportunities/${id}`, { method: 'DELETE' }),

  riskDashboard: () =>
    USE_MOCK
      ? mockApi.getRiskDashboard(token())
      : http<RiskDashboardStats>('/risk-dashboard'),

  users: () => (USE_MOCK ? mockApi.listUsers(token()) : http<AdminUserRow[]>('/admin/users')),

  roles: () => (USE_MOCK ? mockApi.listRoles(token()) : http<AdminRoleRow[]>('/admin/roles')),

  // ---------- Admin CRUD: Người dùng ----------
  createUser: (input: {
    username: string; password: string; fullName: string;
    email?: string; departmentId?: number | null; roleCodes?: string[]; active?: boolean;
  }) =>
    USE_MOCK
      ? mockApi.createUser(token(), input)
      : http<AdminUserRow>('/admin/users', { method: 'POST', body: input }),

  updateUser: (id: number, patch: {
    username?: string; password?: string; fullName?: string;
    email?: string; departmentId?: number | null; roleCodes?: string[]; active?: boolean;
  }) =>
    USE_MOCK
      ? mockApi.updateUser(token(), id, patch)
      : http<AdminUserRow>(`/admin/users/${id}`, { method: 'PATCH', body: patch }),

  deleteUser: (id: number) =>
    USE_MOCK
      ? mockApi.deleteUser(token(), id)
      : http<{ status: string }>(`/admin/users/${id}`, { method: 'DELETE' }),

  // Get single user by ID
  getUser: (id: number) =>
    USE_MOCK
      ? mockApi.getUser(token(), id)
      : http<AdminUserRow>(`/admin/users/${id}`),

  // ---------- Admin CRUD: Vai trò & Phân quyền ----------
  createRole: (input: { code: string; name: string; description?: string; permissions?: string[] }) =>
    USE_MOCK
      ? mockApi.createRole(token(), input)
      : http<AdminRoleRow>('/admin/roles', { method: 'POST', body: input }),

  updateRole: (id: number, patch: { name?: string; description?: string; permissions?: string[] }) =>
    USE_MOCK
      ? mockApi.updateRole(token(), id, patch)
      : http<AdminRoleRow>(`/admin/roles/${id}`, { method: 'PATCH', body: patch }),

  deleteRole: (id: number) =>
    USE_MOCK
      ? mockApi.deleteRole(token(), id)
      : http<{ status: string }>(`/admin/roles/${id}`, { method: 'DELETE' }),

  resetDemo: async (): Promise<void> => {
    if (USE_MOCK) return mockApi.resetDemo(token());
    await http('/admin/reset-demo', { method: 'POST' });
  },

/**
 * Admin master-data – CRUD Phòng ban.
 * Quyền: GET department.view | POST/PATCH/DELETE department.manage.
 */
adminDepartments: () =>
  USE_MOCK
    ? mockApi.getDepartments(token())
    : http<Department[]>('/admin/departments'),

createDepartment: (input: {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
}) =>
  USE_MOCK
    ? mockApi.createDepartment(token(), input)
    : http<Department>('/admin/departments', { method: 'POST', body: input }),

updateDepartment: (id: number, patch: {
  code?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
}) =>
  USE_MOCK
    ? mockApi.updateDepartment(token(), id, patch)
    : http<Department>(`/admin/departments/${id}`, { method: 'PATCH', body: patch }),

deleteDepartment: (id: number) =>
  USE_MOCK
    ? mockApi.deleteDepartment(token(), id)
    : http<{ status: string }>(`/admin/departments/${id}`, { method: 'DELETE' }),

/**
 * Admin master-data – CRUD Giai đoạn (phase).
 * Quyền: POST/PATCH/DELETE master_plan.create | master_plan.update | master_plan.delete.
 */
adminPhases: () =>
  USE_MOCK
    ? mockApi.getPhases(token())
    : http<Phase[]>('/admin/phases'),

createPhase: (input: {
  masterPlanId?: number;
  code: string;
  name: string;
  sortOrder?: number;
  startDate?: string;
  endDate?: string;
}) =>
  USE_MOCK
    ? mockApi.createPhase(token(), input)
    : http<Phase>('/admin/phases', { method: 'POST', body: input }),

updatePhase: (id: number, patch: {
  masterPlanId?: number;
  code?: string;
  name?: string;
  sortOrder?: number;
  startDate?: string;
  endDate?: string;
}) =>
  USE_MOCK
    ? mockApi.updatePhase(token(), id, patch)
    : http<Phase>(`/admin/phases/${id}`, { method: 'PATCH', body: patch }),

deletePhase: (id: number) =>
  USE_MOCK
    ? mockApi.deletePhase(token(), id)
    : http<{ status: string }>(`/admin/phases/${id}`, { method: 'DELETE' }),

/**
 * Admin master-data – CRUD Trạng thái tài liệu (document_statuses).
 * Quyền: POST/PATCH/DELETE document_status.manage.
 */
adminDocumentStatuses: () =>
  USE_MOCK
    ? mockApi.getDocumentStatuses(token())
    : http<DocumentStatusItem[]>('/admin/document-statuses'),

createDocumentStatus: (input: {
  code: string;
  label: string;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
}) =>
  USE_MOCK
    ? mockApi.createDocumentStatus(token(), input)
    : http<DocumentStatusItem>('/admin/document-statuses', { method: 'POST', body: input }),

updateDocumentStatus: (id: number, patch: {
  label?: string;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
}) =>
  USE_MOCK
    ? mockApi.updateDocumentStatus(token(), id, patch)
    : http<DocumentStatusItem>(`/admin/document-statuses/${id}`, { method: 'PATCH', body: patch }),

deleteDocumentStatus: (id: number) =>
  USE_MOCK
    ? mockApi.deleteDocumentStatus(token(), id)
    : http<{ status: string }>(`/admin/document-statuses/${id}`, { method: 'DELETE' }),

};


/** Đang dùng mock API? (dev/test) – để UI/debug phân biệt chế độ. */
export const isMockApi = USE_MOCK;

export type { DocAction, DocumentItem };
export { ApiError };

/** Lỗi 1 dòng trong import hàng loạt (BE echo lại line để FE map về số dòng CSV). */
export interface ImportRowError {
  index: number;
  line?: number | null;
  message: string;
}

/** Kết quả import hàng loạt – partial import (dòng đúng vẫn tạo, dòng sai trả lỗi). */
export interface ImportResult {
  imported: number;
  errors: ImportRowError[];
}

