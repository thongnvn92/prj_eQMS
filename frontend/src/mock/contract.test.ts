// Task 06 – Contract check: TS types (mock/types.ts) ↔ shape response thực tế.
// - expectTypeOf: kiểm tra compile-time type-level (chạy trong vitest typecheck / tsc).
// - Key assertions: bắt drift camelCase ↔ snake_case giữa BE resources và FE types.
import { describe, expect, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type {
  ActionItem, DashboardStats, Department, DocApproval, DocVersion,
  DocumentItem, Phase, SessionUser, Task,
} from './types';

/** Key contract của từng entity – khớp API Resources backend (camelCase, không bọc data). */
const CONTRACT = {
  sessionUser: ['id', 'username', 'fullName', 'departmentId', 'departmentName', 'roleCodes', 'roleNames', 'permissions'],
  department: ['id', 'code', 'name'],
  phase: ['id', 'code', 'name', 'startDate', 'endDate', 'masterPlanId'],
  task: ['id', 'code', 'name', 'phaseId', 'ownerId', 'departmentId', 'priority', 'status', 'progress', 'startDate', 'dueDate'],
  docVersion: ['id', 'version', 'changeSummary', 'createdBy', 'createdAt', 'isCurrent'],
  docApproval: ['id', 'version', 'step', 'approverId', 'action', 'decidedAt'],
  document: ['id', 'code', 'name', 'docType', 'departmentId', 'ownerId', 'currentVersion', 'status', 'workflowStep', 'versions', 'approvals'],
  action: ['id', 'code', 'title', 'source', 'departmentId', 'ownerId', 'issue', 'dueDate', 'status', 'progress'],
  dashboardStats: [
    'taskTotal', 'taskCompleted', 'taskInProgress', 'taskNotStarted', 'taskOverdue',
    'completionRate', 'avgProgress', 'tasksByStatus', 'tasksByPhase', 'tasksByPriority',
    'docByStatus', 'docPending', 'actionByStatus', 'actionOverdue', 'overdueTasks', 'pendingDocs',
  ],
} as const;

/** So key thực tế (từ fixture response) với contract – fail nếu lệch (thiếu/thừa/snake_case). */
function expectKeys(obj: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(obj).sort();
  expect(actual, `${label} key contract`).toEqual([...expected].sort());
  // Không bao giờ có key snake_case lọt sang FE.
  for (const key of actual) {
    expect(key, `${label} không chứa snake_case`).not.toMatch(/_[a-z]/);
  }
}

describe('API contract – type-level (mock/types.ts)', () => {
  it('SessionUser/Task/DocumentItem/ActionItem/DashboardStats khớp type FE', () => {
    // Compile-time: gán sai shape sẽ fail ở `npm run build` (tsc) và vitest typecheck.
    expectTypeOf<SessionUser>().toMatchTypeOf<{
      id: number; username: string; fullName: string;
      departmentId: number | null; departmentName: string;
      roleCodes: string[]; roleNames: string[]; permissions: string[];
    }>();
    expectTypeOf<Task['status']>().toEqualTypeOf<
      'not_started' | 'in_progress' | 'blocked' | 'delayed' | 'completed' | 'cancelled'
    >();
    expectTypeOf<DocumentItem['status']>().toEqualTypeOf<
      'draft' | 'reviewing' | 'approval_pending' | 'approved' | 'published' | 'obsolete' | 'archived'
    >();
    expectTypeOf<ActionItem['status']>().toEqualTypeOf<
      'open' | 'in_progress' | 'blocked' | 'overdue' | 'pending_verification' | 'verified' | 'closed'
    >();
    expectTypeOf<DashboardStats['tasksByStatus']>().toEqualTypeOf<{ status: Task['status']; count: number }[]>();
  });
});

describe('API contract – runtime key check (fixtures khớp response backend)', () => {
  it('SessionUser fixture khớp contract keys', () => {
    // Response thực từ GET /api/me (xem AuthStatelessTest + SessionUserResource).
    const fixture = {
      id: 2, username: 'leader', fullName: 'Trần Văn Long',
      departmentId: 2, departmentName: 'Phòng ISO',
      roleCodes: ['iso_leader'], roleNames: ['ISO Committee Leader'],
      permissions: ['dashboard.view', 'master_plan.update'],
    };
    expectKeys(fixture, CONTRACT.sessionUser, 'SessionUser');
    // Không leak password.
    expect(fixture).not.toHaveProperty('password');
  });

  it('Task fixture khớp contract keys (camelCase)', () => {
    const fixture = {
      id: 2, code: 'MP-002', name: 'Soạn thảo QT đào tạo', phaseId: 1,
      ownerId: 3, departmentId: 2, priority: 'high', status: 'in_progress',
      progress: 45, startDate: '2026-01-01', dueDate: '2026-12-31',
    };
    expectKeys(fixture, CONTRACT.task, 'Task');
  });

  it('DocumentItem fixture khớp contract keys + versions/approvals', () => {
    const version = {
      id: 4, version: 'V0.1', changeSummary: 'Dự thảo', createdBy: 5,
      createdAt: '2026-10-06', isCurrent: true,
    };
    const approval = {
      id: 5, version: 'V0.2', step: 'reviewing', approverId: 3,
      action: 'review', decidedAt: '2026-10-05',
    };
    const fixture: DocumentItem = {
      id: 2, code: 'QT-HCNS.02', name: 'Quy trình đào tạo', docType: 'procedure',
      departmentId: 3, ownerId: 5, currentVersion: 'V0.1', status: 'draft',
      workflowStep: 1, versions: [version], approvals: [approval],
    };
    expectKeys(fixture as unknown as Record<string, unknown>, CONTRACT.document, 'DocumentItem');
    expectKeys(version, CONTRACT.docVersion, 'DocVersion');
    expectKeys(approval, CONTRACT.docApproval, 'DocApproval');
    // Type-level đồng thời (fixture đã khai báo đúng type → sai shape sẽ fail tsc).
    expectTypeOf(version).toMatchTypeOf<DocVersion>();
    expectTypeOf(approval).toMatchTypeOf<DocApproval>();
  });

  it('ActionItem fixture khớp contract keys', () => {
    const fixture = {
      id: 1, code: 'ACT-001', title: 'Cập nhật QT khiếu nại',
      source: 'audit_finding', departmentId: 4, ownerId: 8,
      issue: 'Chưa quy định thời hạn', dueDate: '2026-10-15',
      status: 'in_progress', progress: 50,
    };
    expectKeys(fixture, CONTRACT.action, 'ActionItem');
  });

  it('DashboardStats fixture khớp contract keys (đủ 16 field)', () => {
    const fixture = {
      taskTotal: 16, taskCompleted: 4, taskInProgress: 5, taskNotStarted: 3,
      taskOverdue: 2, completionRate: 25, avgProgress: 48,
      tasksByStatus: [], tasksByPhase: [], tasksByPriority: [],
      docByStatus: [], docPending: 2, actionByStatus: [], actionOverdue: 1,
      overdueTasks: [], pendingDocs: [],
    };
    expectKeys(fixture, CONTRACT.dashboardStats, 'DashboardStats');
    expectTypeOf(fixture).toMatchTypeOf<DashboardStats>();
  });

  it('Lookups + Department/Phase fixtures khớp contract', () => {
    const department: Department = { id: 1, code: 'BGD', name: 'Ban Giám đốc' };
    const phase: Phase = {
      id: 1, code: 'P1', name: 'Giai đoạn 1',
      startDate: '2026-01-01', endDate: '2026-06-30', masterPlanId: 1,
    };
    expectKeys(department as unknown as Record<string, unknown>, CONTRACT.department, 'Department');
    expectKeys(phase as unknown as Record<string, unknown>, CONTRACT.phase, 'Phase');
  });
});

