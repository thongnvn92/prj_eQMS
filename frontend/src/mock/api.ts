// ============================================================
// Mock API – mô phỏng BACKEND của DMC eQMS
// Nguyên tắc: MỌI handler đều kiểm lại quyền của actor;
// thiếu quyền ⇒ throw ApiError(403) – không tin dữ liệu từ frontend.
// Khi có Laravel thật: giữ nguyên interface, thay phần trong bằng fetch().
// ============================================================
import { getDb, nextId, nowIso, persist, resetDb, todayStr } from './db';
import { ROLE_CODES, ROLE_NAMES, ROLE_PERMISSIONS, isPermission, type Permission } from '../auth/permissions';
import type {
  ActionItem,
  DashboardStats,
  Department,
  DocAction,
  DocApproval,
  DocumentFile,
  DocumentItem,
  MasterPlan,
  OpportunityItem,
  OpportunityLevel,
  Phase,
  ReviewFrequency,
  ReviewStatus,
  RiskAssessmentItem,
  RiskDashboardStats,
  RiskItem,
  RiskLevel,
  RoStatus,
  RoleItem,
  SessionUser,
  Task,
  TaskStatus,
  User,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function issueToken(userId: number): string {
  return `tok.${userId}.${Math.random().toString(36).slice(2, 10)}`;
}

function userIdFromToken(token: string | null | undefined): number | null {
  if (!token) return null;
  const m = /^tok\.(\d+)\./.exec(token);
  return m ? Number(m[1]) : null;
}

/** Quyền của user = hợp permissions của các role (đọc từ db.roles để hỗ trợ role tùy chỉnh). */
function permissionsOfCodes(roleCodes: string[]): Permission[] {
  const db = getDb();
  const set = new Set<Permission>();
  for (const code of roleCodes) {
    const role = db.roles.find((r) => r.code === code);
    for (const p of role?.permissions ?? ROLE_PERMISSIONS[code as keyof typeof ROLE_PERMISSIONS] ?? []) {
      if (isPermission(p)) set.add(p);
    }
  }
  return [...set];
}

function toSessionUser(u: User): SessionUser {
  const db = getDb();
  const dept = db.departments.find((d) => d.id === u.departmentId);
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    departmentId: u.departmentId,
    departmentName: dept?.name ?? '—',
    roleCodes: [...u.roleCodes],
    roleNames: u.roleCodes.map((c) => db.roles.find((r) => r.code === c)?.name ?? ROLE_NAMES[c] ?? c),
    permissions: permissionsOfCodes(u.roleCodes),
  };
}

/** "Backend authorization" – bắt buộc token hợp lệ (+ quyền nếu truyền permission) */
function authorize(token: string | null | undefined, permission?: Permission): SessionUser {
  const uid = userIdFromToken(token);
  if (uid === null) throw new ApiError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  const user = getDb().users.find((u) => u.id === uid && u.active);
  if (!user) throw new ApiError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  const session = toSessionUser(user);
  if (permission && !session.permissions.includes(permission)) {
    throw new ApiError(403, `Bạn không có quyền "${permission}" để thực hiện thao tác này.`);
  }
  return session;
}

function writeLog(userId: number, action: string, entity: string, entityId: number, oldStatus?: string, newStatus?: string) {
  const db = getDb();
  db.logs.push({ id: nextId(db), userId, action, entity, entityId, oldStatus, newStatus, at: nowIso() });
  if (db.logs.length > 300) db.logs.splice(0, db.logs.length - 300);
}

// ---------- CR-RISK-OPPORTUNITY-001: helpers tính score/level phía "backend" ----------
export function riskLevelFromScore(score: number): RiskLevel {
  return score >= 15 ? 'high' : score >= 5 ? 'medium' : 'low';
}
export function opportunityLevelFromScore(score: number): OpportunityLevel {
  return score >= 15 ? 'priority' : score >= 5 ? 'research' : 'ignore';
}
export function calcReviewStatus(nextReviewDate: string | null | undefined, status: RoStatus): ReviewStatus | null {
  if (status === 'closed' || !nextReviewDate) return null;
  const diffDays = Math.round((new Date(nextReviewDate).getTime() - new Date(todayStr()).getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 30) return 'due_soon';
  return 'normal';
}
export function nextReviewDateByFreq(freq: ReviewFrequency | null | undefined, from = todayStr()): string | null {
  if (!freq) return null;
  const d = new Date(from);
  switch (freq) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: return null; // batch/custom → người dùng tự chọn nextReviewDate
  }
  return d.toISOString().slice(0, 10);
}

/** Gắn actions liên quan + history assessments vào risk (mirror BE RiskResource). */
function withRiskExtras(db: ReturnType<typeof getDb>, risk: RiskItem): RiskItem {
  return {
    ...risk,
    actionCount: db.actions.filter((a) => a.relatedRiskId === risk.id).length,
    actions: db.actions.filter((a) => a.relatedRiskId === risk.id).map((a) => ({ ...a })),
    assessments: db.riskAssessments.filter((a) => a.riskId === risk.id).map((a) => ({ ...a })),
  };
}

/** Gắn actions liên quan vào opportunity (mirror BE OpportunityResource). */
function withOppExtras(db: ReturnType<typeof getDb>, opp: OpportunityItem): OpportunityItem {
  return {
    ...opp,
    actionCount: db.actions.filter((a) => a.relatedOpportunityId === opp.id).length,
    actions: db.actions.filter((a) => a.relatedOpportunityId === opp.id).map((a) => ({ ...a })),
  };
}

export const mockApi = {
  // ---------- AUTH ----------
  async login(username: string, password: string): Promise<{ token: string; user: SessionUser }> {
    await delay();
    const db = getDb();
    const user = db.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
    );
    if (!user || user.password !== password || !user.active) {
      throw new ApiError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
    }
    const token = issueToken(user.id);
    writeLog(user.id, 'login', 'user', user.id);
    persist(db);
    return { token, user: toSessionUser(user) };
  },

  async me(token: string | null): Promise<SessionUser | null> {
    await delay(120);
    const uid = userIdFromToken(token);
    if (uid === null) return null;
    const user = getDb().users.find((u) => u.id === uid && u.active);
    return user ? toSessionUser(user) : null;
  },

  // ---------- LOOKUPS (danh mục phụ trợ cho UI) ----------
  async getLookups(token: string | null): Promise<{
    people: { id: number; fullName: string }[];
    departments: Department[];
    phases: Phase[];
  }> {
    authorize(token);
    await delay(80);
    const db = getDb();
    return {
      people: db.users.map((u) => ({ id: u.id, fullName: u.fullName })),
      departments: [...db.departments],
      phases: [...db.phases],
    };
  },

  // ---------- MASTER PLAN ----------
  async getMasterPlan(token: string | null): Promise<{ phases: Phase[]; tasks: Task[] }> {
    authorize(token, 'master_plan.view');
    await delay();
    const db = getDb();
    return { phases: [...db.phases], tasks: [...db.tasks].sort((a, b) => a.code.localeCompare(b.code)) };
  },

  async updateTask(
    token: string | null,
    id: number,
    patch: { status?: TaskStatus; progress?: number; ownerId?: number; note?: string },
  ): Promise<Task> {
    const actor = authorize(token);
    await delay();
    const task = getDb().tasks.find((x) => x.id === id);
    if (!task) throw new ApiError(404, 'Không tìm thấy công việc.');
    if (patch.ownerId !== undefined) authorize(token, 'master_plan.assign');
    if (patch.status !== undefined || patch.progress !== undefined || patch.note !== undefined) {
      authorize(token, 'master_plan.update');
    }
    const oldStatus = task.status;
    if (patch.status !== undefined) task.status = patch.status;
    if (patch.progress !== undefined) task.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
    if (patch.ownerId !== undefined) task.ownerId = patch.ownerId;
    if (patch.note !== undefined) task.note = patch.note;
    if (task.status === 'completed') task.progress = 100;
    if (oldStatus !== task.status) {
      writeLog(actor.id, 'status_change', 'master_plan_task', task.id, oldStatus, task.status);
    }
    persist(getDb());
    return task;
  },

  // ---------- DOCUMENT CONTROL ----------
  async listDocuments(token: string | null): Promise<DocumentItem[]> {
    authorize(token, 'document.view');
    await delay();
    return [...getDb().documents].sort((a, b) => a.code.localeCompare(b.code));
  },

  /** Thêm tài liệu mới (draft). Quyền: document.create; mã trùng → 422. */
  async createDocument(
    token: string | null,
    input: {
      code: string; name: string; docType: DocumentItem['docType'];
      departmentId?: number | null; ownerId?: number | null;
      relatedTaskId?: number | null; description?: string; changeSummary?: string;
      autoVersion?: boolean;
    },
  ): Promise<DocumentItem> {
    const actor = authorize(token, 'document.create');
    await delay();
    const db = getDb();
    const code = input.code.trim();
    if (!code || !input.name.trim()) throw new ApiError(422, 'Mã và tên tài liệu là bắt buộc.');
    if (db.documents.some((d) => d.code.toLowerCase() === code.toLowerCase())) {
      throw new ApiError(422, `Mã tài liệu "${code}" đã tồn tại.`);
    }
    const doc: DocumentItem = {
      id: nextId(db),
      code,
      name: input.name.trim(),
      docType: input.docType,
      departmentId: input.departmentId ?? actor.departmentId ?? 2,
      ownerId: input.ownerId ?? actor.id,
      currentVersion: 'V0.1',
      status: 'draft',
      workflowStep: 1,
      autoVersion: input.autoVersion ?? false,
      relatedTaskId: input.relatedTaskId ?? undefined,
      description: input.description,
      versions: [{
        id: nextId(db), version: 'V0.1',
        changeSummary: input.changeSummary?.trim() || 'Dự thảo đầu tiên',
        createdBy: actor.id, createdAt: nowIso().slice(0, 10), isCurrent: true,
      }],
      approvals: [],
    };
    db.documents.push(doc);
    writeLog(actor.id, 'create', 'document', doc.id, undefined, 'draft');
    persist(db);
    return doc;
  },

  async updateDocument(
    token: string | null,
    id: number,
    patch: {
      code?: string; name?: string; docType?: DocumentItem['docType'];
      departmentId?: number | null; ownerId?: number | null;
      relatedTaskId?: number | null; description?: string; changeSummary?: string;
      autoVersion?: boolean; version?: string;
    },
  ): Promise<DocumentItem> {
    const actor = authorize(token, 'document.update');
    await delay();
    const db = getDb();
    const doc = db.documents.find((d) => d.id === id);
    if (!doc) throw new ApiError(404, 'Không tìm thấy tài liệu.');
    if (doc.status !== 'draft') throw new ApiError(409, 'Chỉ được sửa tài liệu ở trạng thái dự thảo (draft).');
    if (patch.code !== undefined) {
      const code = patch.code.trim();
      if (!code) throw new ApiError(422, 'Mã tài liệu không được để trống.');
      if (db.documents.some((d) => d.id !== id && d.code.toLowerCase() === code.toLowerCase())) {
        throw new ApiError(422, `Mã tài liệu "${code}" đã tồn tại.`);
      }
      doc.code = code;
    }
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new ApiError(422, 'Tên tài liệu không được để trống.');
      doc.name = patch.name.trim();
    }
    if (patch.docType !== undefined) doc.docType = patch.docType;
    if (patch.departmentId !== undefined && patch.departmentId !== null) doc.departmentId = patch.departmentId;
    if (patch.ownerId !== undefined && patch.ownerId !== null) doc.ownerId = patch.ownerId;
    if (patch.relatedTaskId !== undefined) doc.relatedTaskId = patch.relatedTaskId ?? undefined;
    if (patch.description !== undefined) doc.description = patch.description;
    if (patch.autoVersion !== undefined) doc.autoVersion = patch.autoVersion;
    // Version mới: auto-version → tự tăng V0.x; tắt → dùng version nhập tay (bắt buộc, không trùng) — khớp BE.
    if (patch.changeSummary !== undefined || patch.name !== undefined || patch.version !== undefined) {
      const auto = patch.autoVersion ?? doc.autoVersion ?? false;
      const cur = doc.versions.find((v) => v.isCurrent);
      let next: string;
      if (auto) {
        const curNum = cur ? Number(String(cur.version).replace(/^V0\./, '')) || 0 : 0;
        next = `V0.${curNum + 1}`;
      } else {
        next = (patch.version ?? '').trim();
        if (!next) throw new ApiError(422, 'Vui lòng nhập số version khi tắt tự động đánh version.');
        if (doc.versions.some((v) => v.version === next)) {
          throw new ApiError(409, `Version "${next}" đã tồn tại cho tài liệu này.`);
        }
      }
      if (cur) cur.isCurrent = false;
      doc.versions.push({
        id: nextId(db), version: next,
        changeSummary: patch.changeSummary?.trim() || 'Cập nhật dự thảo',
        createdBy: actor.id, createdAt: nowIso().slice(0, 10), isCurrent: true,
      });
      doc.currentVersion = next;
    }
    writeLog(actor.id, 'update', 'document', doc.id, 'draft', 'draft');
    persist(db);
    return doc;
  },

  /** DELETE /documents/{id} – xóa tài liệu. Quyền: document.delete; published → 409 (khớp BE). */
  async deleteDocument(token: string | null, id: number): Promise<{ status: string }> {
    const actor = authorize(token, 'document.delete');
    await delay();
    const db = getDb();
    const idx = db.documents.findIndex((d) => d.id === id);
    if (idx < 0) throw new ApiError(404, 'Không tìm thấy tài liệu.');
    const doc = db.documents[idx];
    if (doc.status === 'published') {
      throw new ApiError(409, 'Không thể xóa tài liệu đã ban hành (published). Hãy chuyển sang obsolete/archived trước.');
    }
    const oldStatus = doc.status;
    db.documents.splice(idx, 1); // versions/approvals/files đi theo doc (nested) – xóa cả bản ghi.
    writeLog(actor.id, 'delete', 'document', id, oldStatus, undefined);
    persist(db);
    return { status: 'ok' };
  },

  async transitionDocument(
    token: string | null,
    id: number,
    action: DocAction,
    comment?: string,
  ): Promise<DocumentItem> {
    const actor = authorize(token);
    await delay();
    const doc = getDb().documents.find((x) => x.id === id);
    if (!doc) throw new ApiError(404, 'Không tìm thấy tài liệu.');

    const spec: Record<DocAction, { perm: Permission; from: string[]; to: DocumentItem['status'] }> = {
      submit: { perm: 'document.submit', from: ['draft'], to: 'reviewing' },
      review: { perm: 'document.review', from: ['reviewing'], to: 'approval_pending' },
      approve: { perm: 'document.approve', from: ['approval_pending'], to: 'approved' },
      reject: { perm: 'document.approve', from: ['reviewing', 'approval_pending'], to: 'draft' },
      publish: { perm: 'document.publish', from: ['approved'], to: 'published' },
    };
    const s = spec[action];
    authorize(token, s.perm); // kiểm quyền TỪNG transition (403 nếu thiếu)

    if (!s.from.includes(doc.status)) {
      throw new ApiError(409, `Không thể thực hiện "${action}" khi tài liệu đang ở trạng thái "${doc.status}".`);
    }
    if (action === 'reject' && !(comment ?? '').trim()) {
      throw new ApiError(400, 'Bắt buộc nhập lý do từ chối (comment).');
    }

    const oldStatus = doc.status;
    doc.status = s.to;

    if (action === 'publish') {
      const cur = doc.versions.find((v) => v.isCurrent);
      if (/^V0\./.test(doc.currentVersion)) {
        // V0.x = bản nháp; lần ban hành đầu tiên ⇒ V1.0
        if (cur) cur.isCurrent = false;
        doc.versions.push({
          id: nextId(getDb()),
          version: 'V1.0',
          changeSummary: 'Ban hành lần đầu',
          createdBy: actor.id,
          createdAt: todayStr(),
          approvedBy: actor.id,
          approvedAt: todayStr(),
          isCurrent: true,
        });
        doc.currentVersion = 'V1.0';
      } else if (cur) {
        cur.approvedBy = actor.id;
        cur.approvedAt = todayStr();
      }
      doc.effectiveDate = todayStr();
    }

    doc.approvals.push({
      id: nextId(getDb()),
      version: doc.currentVersion,
      step: doc.status,
      approverId: actor.id,
      action,
      comment: comment?.trim() || undefined,
      decidedAt: todayStr(),
    } satisfies DocApproval);

    writeLog(actor.id, action, 'document', doc.id, oldStatus, doc.status);
    persist(getDb());
    return doc;
  },

  // ---------- Tệp đính kèm tài liệu (revision kiểu SVN) ----------
  async documentFiles(token: string | null, documentId: number): Promise<DocumentFile[]> {
    authorize(token, 'document.view');
    await delay();
    const db = getDb();
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) throw new ApiError(404, 'Không tìm thấy tài liệu.');
    return [...(doc.files ?? [])].sort((a, b) => b.revision - a.revision);
  },

  async uploadDocumentFile(
    token: string | null,
    documentId: number,
    files: File[],
    changeNote?: string,
  ): Promise<DocumentFile[]> {
    const actor = authorize(token, 'document.create');
    await delay();
    const db = getDb();
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) throw new ApiError(404, 'Không tìm thấy tài liệu.');
    if (files.length > 10) throw new ApiError(422, 'Chỉ được upload tối đa 10 file mỗi lần.');
    let maxRev = (doc.files ?? []).reduce((m, f) => Math.max(m, f.revision), 0);
    const created: DocumentFile[] = files.map((file) => {
      maxRev += 1;
      return {
        id: nextId(db),
        documentId,
        documentVersionId: doc.versions.find((v) => v.isCurrent)?.id ?? null,
        revision: maxRev,
        changeNote: changeNote ?? null,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedBy: actor.id,
        uploadedAt: nowIso(),
      };
    });
    doc.files = [...(doc.files ?? []), ...created];
    writeLog(actor.id, 'upload', 'document', documentId);
    persist(db);
    return created;
  },

  // ---------- ACTION / CAPA ----------
  async listActions(token: string | null): Promise<ActionItem[]> {
    authorize(token, 'action.view');
    await delay();
    return [...getDb().actions].sort((a, b) => a.code.localeCompare(b.code));
  },

  async updateAction(
    token: string | null,
    id: number,
    patch: {
      status?: ActionItem['status']; progress?: number; result?: string; evidence?: string;
      title?: string; source?: ActionItem['source']; ownerId?: number | null; departmentId?: number | null; dueDate?: string;
      relatedRiskId?: number | null; relatedOpportunityId?: number | null;
    },
  ): Promise<ActionItem> {
    const actor = authorize(token);
    await delay();
    const act = getDb().actions.find((x) => x.id === id);
    if (!act) throw new ApiError(404, 'Không tìm thấy Action.');

    // Ownership check (resource-level) – normal_user chỉ đụng Action của mình
    if (actor.roleCodes.includes('normal_user') && act.ownerId !== actor.id) {
      throw new ApiError(403, 'Bạn chỉ được cập nhật Action do mình phụ trách.');
    }

    const target = patch.status;
    if (target === 'verified') {
      authorize(token, 'action.verify');
      if (act.status !== 'pending_verification') {
        throw new ApiError(409, 'Chỉ xác minh Action đang ở trạng thái "Chờ xác minh".');
      }
    } else if (target === 'closed') {
      authorize(token, 'action.close');
      if (act.status !== 'verified') {
        throw new ApiError(409, 'Chỉ đóng Action khi đã được xác minh (verified).');
      }
      if (!(patch.evidence ?? act.evidence ?? '').trim()) {
        throw new ApiError(400, 'Bắt buộc ghi Evidence trước khi đóng Action.');
      }
    } else if (
      target !== undefined || patch.progress !== undefined || patch.result !== undefined ||
      patch.title !== undefined || patch.source !== undefined ||
      patch.ownerId !== undefined || patch.departmentId !== undefined || patch.dueDate !== undefined
    ) {
      authorize(token, 'action.update');
    }

    const oldStatus = act.status;
    if (patch.status !== undefined) act.status = patch.status;
    if (patch.progress !== undefined) act.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
    if (patch.result !== undefined) act.result = patch.result;
    if (patch.evidence !== undefined) act.evidence = patch.evidence;
    if (patch.title !== undefined) act.title = patch.title;
    if (patch.source !== undefined) act.source = patch.source;
    if (patch.ownerId !== undefined) act.ownerId = patch.ownerId;
    if (patch.departmentId !== undefined) act.departmentId = patch.departmentId;
    if (patch.dueDate !== undefined) act.dueDate = patch.dueDate;
    // CR-RISK-OPPORTUNITY-001: link/unlink Risk/Opportunity + auto-sync source (mirror BE).
    if (patch.relatedRiskId !== undefined) {
      if (patch.relatedRiskId !== null && !getDb().risks.some((r) => r.id === patch.relatedRiskId)) {
        throw new ApiError(422, 'Rủi ro liên kết không tồn tại.');
      }
      act.relatedRiskId = patch.relatedRiskId;
      if (patch.relatedRiskId !== null) {
        act.source = 'risk';
        writeLog(actor.id, 'link_risk', 'action', act.id, undefined, `risk#${patch.relatedRiskId}`);
      } else {
        writeLog(actor.id, 'unlink_risk', 'action', act.id);
      }
    }
    if (patch.relatedOpportunityId !== undefined) {
      if (patch.relatedOpportunityId !== null && !getDb().opportunities.some((o) => o.id === patch.relatedOpportunityId)) {
        throw new ApiError(422, 'Cơ hội liên kết không tồn tại.');
      }
      act.relatedOpportunityId = patch.relatedOpportunityId;
      if (patch.relatedOpportunityId !== null) {
        act.source = 'opportunity';
        writeLog(actor.id, 'link_opportunity', 'action', act.id, undefined, `opportunity#${patch.relatedOpportunityId}`);
      } else {
        writeLog(actor.id, 'unlink_opportunity', 'action', act.id);
      }
    }
    if (act.status === 'verified' || act.status === 'closed') act.progress = 100;
    if (oldStatus !== act.status) {
      writeLog(actor.id, 'status_change', 'action', act.id, oldStatus, act.status);
    }
    persist(getDb());
    return act;
  },

  // ---------- CR-RISK-OPPORTUNITY-001: RISK REGISTER ----------
  async listRisks(
    token: string | null,
    filters?: { level?: RiskLevel | ''; status?: RoStatus | ''; departmentId?: number | ''; q?: string },
  ): Promise<RiskItem[]> {
    const actor = authorize(token, 'risk.view');
    await delay();
    const db = getDb();
    let items = db.risks.map((r) => withRiskExtras(db, r));
    // dept_manager chỉ thấy rủi ro của phòng mình (mirror BE scope).
    if (actor.roleCodes.includes('dept_manager') && !actor.roleCodes.some((c) => ['admin', 'iso_leader', 'iso_deputy', 'iso_member', 'iso_coordinator', 'auditor'].includes(c))) {
      items = items.filter((r) => r.departmentId === actor.departmentId);
    }
    if (filters?.level) items = items.filter((r) => r.riskLevel === filters.level);
    if (filters?.status) items = items.filter((r) => r.status === filters.status);
    if (filters?.departmentId) items = items.filter((r) => r.departmentId === filters.departmentId);
    if (filters?.q) {
      const q = filters.q.toLowerCase();
      items = items.filter((r) => r.code.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q) || (r.objective ?? '').toLowerCase().includes(q));
    }
    return items.sort((a, b) => b.code.localeCompare(a.code));
  },

  async createRisk(
    token: string | null,
    input: {
      sourceType: RiskItem['sourceType']; category?: string | null; objective?: string | null; description?: string | null;
      likelihood: number; impact: number; treatment?: string | null; expectedResult?: string | null;
      ownerId?: number | null; departmentId?: number | null; startDate?: string | null; dueDate?: string | null;
      reviewFrequency?: ReviewFrequency | null; nextReviewDate?: string | null;
    },
  ): Promise<RiskItem> {
    const actor = authorize(token, 'risk.create');
    await delay();
    const db = getDb();
    const likelihood = Math.max(1, Math.min(5, Math.round(input.likelihood)));
    const impact = Math.max(1, Math.min(5, Math.round(input.impact)));
    const score = likelihood * impact; // backend tính, không tin client
    const level = riskLevelFromScore(score);
    const num = db.risks.length + 1;
    const risk: RiskItem = {
      id: nextId(db),
      code: `RISK-${String(num).padStart(3, '0')}`,
      sourceType: input.sourceType,
      category: input.category ?? null,
      objective: input.objective ?? null,
      description: input.description ?? null,
      likelihood, impact, riskScore: score, riskLevel: level,
      initialLikelihood: likelihood, initialImpact: impact, initialScore: score, initialLevel: level,
      treatment: input.treatment ?? null,
      expectedResult: input.expectedResult ?? null,
      ownerId: input.ownerId ?? actor.id,
      departmentId: input.departmentId ?? actor.departmentId,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      reviewFrequency: input.reviewFrequency ?? null,
      nextReviewDate: input.nextReviewDate ?? nextReviewDateByFreq(input.reviewFrequency),
      reviewStatus: null,
      status: 'open',
      createdBy: actor.id,
      updatedAt: nowIso(),
      createdAt: nowIso(),
    };
    risk.reviewStatus = calcReviewStatus(risk.nextReviewDate, risk.status);
    db.risks.push(risk);
    db.riskAssessments.push({
      id: nextId(db), riskId: risk.id, kind: 'initial',
      likelihood, impact, score, level, assessedBy: actor.id, createdAt: nowIso(),
    });
    writeLog(actor.id, 'create', 'risk', risk.id, undefined, 'open');
    persist(db);
    return withRiskExtras(db, risk);
  },
  async getRisk(token: string | null, id: number): Promise<RiskItem> {
    const actor = authorize(token, 'risk.view');
    await delay();
    const db = getDb();
    const risk = db.risks.find((r) => r.id === id);
    if (!risk) throw new ApiError(404, 'Không tìm thấy rủi ro.');
    if (actor.roleCodes.includes('dept_manager') && risk.departmentId !== actor.departmentId) {
      throw new ApiError(403, 'Bạn chỉ xem được rủi ro thuộc phòng ban của mình.');
    }
    return withRiskExtras(db, risk);
  },

  async updateRisk(
    token: string | null,
    id: number,
    patch: Partial<Pick<RiskItem, 'category' | 'objective' | 'description' | 'treatment' | 'expectedResult' | 'ownerId' | 'departmentId' | 'startDate' | 'dueDate' | 'reviewFrequency' | 'nextReviewDate' | 'status' | 'likelihood' | 'impact'>>,
  ): Promise<RiskItem> {
    const actor = authorize(token, 'risk.update');
    await delay();
    const db = getDb();
    const risk = db.risks.find((r) => r.id === id);
    if (!risk) throw new ApiError(404, 'Không tìm thấy rủi ro.');
    if (patch.status === 'closed') authorize(token, 'risk.close');
    const oldStatus = risk.status;
    // score do backend tính lại khi likelihood/impact đổi; KHÔNG ghi đè initial_*.
    if (patch.likelihood !== undefined) risk.likelihood = Math.max(1, Math.min(5, Math.round(patch.likelihood)));
    if (patch.impact !== undefined) risk.impact = Math.max(1, Math.min(5, Math.round(patch.impact)));
    risk.riskScore = risk.likelihood * risk.impact;
    risk.riskLevel = riskLevelFromScore(risk.riskScore);
    for (const k of ['category', 'objective', 'description', 'treatment', 'expectedResult', 'ownerId', 'departmentId', 'startDate', 'dueDate'] as const) {
      if (patch[k] !== undefined) (risk as unknown as Record<string, unknown>)[k] = patch[k];
    }
    if (patch.reviewFrequency !== undefined) {
      risk.reviewFrequency = patch.reviewFrequency;
      risk.nextReviewDate = nextReviewDateByFreq(patch.reviewFrequency);
    }
    if (patch.nextReviewDate !== undefined) risk.nextReviewDate = patch.nextReviewDate;
    if (patch.status !== undefined) risk.status = patch.status;
    risk.reviewStatus = calcReviewStatus(risk.nextReviewDate, risk.status);
    risk.updatedBy = actor.id;
    risk.updatedAt = nowIso();
    if (oldStatus !== risk.status) writeLog(actor.id, 'status_change', 'risk', risk.id, oldStatus, risk.status);
    persist(db);
    return withRiskExtras(db, risk);
  },

  /** Đánh giá lại (residual) – luôn append bản ghi, không ghi đè initial_* (AC-08). */
  async evaluateRisk(token: string | null, id: number, input: { likelihood: number; impact: number; comment?: string }): Promise<RiskItem> {
    const actor = authorize(token, 'risk.evaluate');
    await delay();
    const db = getDb();
    const risk = db.risks.find((r) => r.id === id);
    if (!risk) throw new ApiError(404, 'Không tìm thấy rủi ro.');
    const likelihood = Math.max(1, Math.min(5, Math.round(input.likelihood)));
    const impact = Math.max(1, Math.min(5, Math.round(input.impact)));
    const score = likelihood * impact;
    const level = riskLevelFromScore(score);
    risk.likelihood = likelihood;
    risk.impact = impact;
    risk.riskScore = score;
    risk.riskLevel = level;
    risk.lastReviewedBy = actor.id;
    risk.lastReviewedAt = nowIso();
    risk.lastReviewComment = input.comment ?? null;
    if (risk.reviewFrequency) risk.nextReviewDate = nextReviewDateByFreq(risk.reviewFrequency);
    risk.reviewStatus = calcReviewStatus(risk.nextReviewDate, risk.status);
    risk.updatedBy = actor.id;
    risk.updatedAt = nowIso();
    db.riskAssessments.push({
      id: nextId(db), riskId: risk.id, kind: 'residual',
      likelihood, impact, score, level, assessedBy: actor.id, comment: input.comment ?? null, createdAt: nowIso(),
    });
    writeLog(actor.id, 'evaluate', 'risk', risk.id, undefined, level);
    persist(db);
    return withRiskExtras(db, risk);
  },
  async deleteRisk(token: string | null, id: number): Promise<{ status: string }> {
    authorize(token, 'risk.delete');
    await delay();
    const db = getDb();
    const idx = db.risks.findIndex((r) => r.id === id);
    if (idx === -1) throw new ApiError(404, 'Không tìm thấy rủi ro.');
    db.risks.splice(idx, 1);
    db.riskAssessments = db.riskAssessments.filter((a) => a.riskId !== id);
    for (const a of db.actions) if (a.relatedRiskId === id) a.relatedRiskId = null;
    persist(db);
    return { status: 'deleted' };
  },

  async getRiskHistory(token: string | null, id: number): Promise<RiskAssessmentItem[]> {
    authorize(token, 'risk.view');
    await delay();
    return getDb().riskAssessments.filter((a) => a.riskId === id).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  },

  // ---------- CR-RISK-OPPORTUNITY-001: OPPORTUNITY REGISTER ----------
  async listOpportunities(
    token: string | null,
    filters?: { level?: OpportunityLevel | ''; status?: RoStatus | ''; departmentId?: number | ''; q?: string },
  ): Promise<OpportunityItem[]> {
    const actor = authorize(token, 'opportunity.view');
    await delay();
    const db = getDb();
    let items = db.opportunities.map((o) => withOppExtras(db, o));
    if (actor.roleCodes.includes('dept_manager') && !actor.roleCodes.some((c) => ['admin', 'iso_leader', 'iso_deputy', 'iso_member', 'iso_coordinator', 'auditor'].includes(c))) {
      items = items.filter((o) => o.departmentId === actor.departmentId);
    }
    if (filters?.level) items = items.filter((o) => o.opportunityLevel === filters.level);
    if (filters?.status) items = items.filter((o) => o.status === filters.status);
    if (filters?.departmentId) items = items.filter((o) => o.departmentId === filters.departmentId);
    if (filters?.q) {
      const q = filters.q.toLowerCase();
      items = items.filter((o) => o.code.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q) || (o.objective ?? '').toLowerCase().includes(q));
    }
    return items.sort((a, b) => b.code.localeCompare(a.code));
  },

  async createOpportunity(
    token: string | null,
    input: {
      sourceType: OpportunityItem['sourceType']; category?: string | null; objective?: string | null; description?: string | null;
      feasibility: number; benefit: number; solution?: string | null; expectedResult?: string | null;
      ownerId?: number | null; departmentId?: number | null; startDate?: string | null; dueDate?: string | null;
      reviewFrequency?: ReviewFrequency | null; nextReviewDate?: string | null;
    },
  ): Promise<OpportunityItem> {
    const actor = authorize(token, 'opportunity.create');
    await delay();
    const db = getDb();
    const feasibility = Math.max(1, Math.min(5, Math.round(input.feasibility)));
    const benefit = Math.max(1, Math.min(5, Math.round(input.benefit)));
    const score = feasibility * benefit;
    const opp: OpportunityItem = {
      id: nextId(db),
      code: `OPP-${String(db.opportunities.length + 1).padStart(3, '0')}`,
      sourceType: input.sourceType, category: input.category ?? null, objective: input.objective ?? null, description: input.description ?? null,
      feasibility, benefit, opportunityScore: score, opportunityLevel: opportunityLevelFromScore(score),
      solution: input.solution ?? null, expectedResult: input.expectedResult ?? null, actualResult: null,
      ownerId: input.ownerId ?? actor.id, departmentId: input.departmentId ?? actor.departmentId,
      startDate: input.startDate ?? null, dueDate: input.dueDate ?? null,
      reviewFrequency: input.reviewFrequency ?? null,
      nextReviewDate: input.nextReviewDate ?? nextReviewDateByFreq(input.reviewFrequency),
      reviewStatus: null, status: 'open', createdBy: actor.id, createdAt: nowIso(), updatedAt: nowIso(),
    };
    opp.reviewStatus = calcReviewStatus(opp.nextReviewDate, opp.status);
    db.opportunities.push(opp);
    writeLog(actor.id, 'create', 'opportunity', opp.id, undefined, 'open');
    persist(db);
    return withOppExtras(db, opp);
  },

  async getOpportunity(token: string | null, id: number): Promise<OpportunityItem> {
    const actor = authorize(token, 'opportunity.view');
    await delay();
    const db = getDb();
    const opp = db.opportunities.find((o) => o.id === id);
    if (!opp) throw new ApiError(404, 'Không tìm thấy cơ hội.');
    if (actor.roleCodes.includes('dept_manager') && opp.departmentId !== actor.departmentId) {
      throw new ApiError(403, 'Bạn chỉ xem được cơ hội thuộc phòng ban của mình.');
    }
    return withOppExtras(db, opp);
  },
  async updateOpportunity(
    token: string | null,
    id: number,
    patch: Partial<Pick<OpportunityItem, 'category' | 'objective' | 'description' | 'solution' | 'expectedResult' | 'actualResult' | 'ownerId' | 'departmentId' | 'startDate' | 'dueDate' | 'reviewFrequency' | 'nextReviewDate' | 'status' | 'feasibility' | 'benefit'>>,
  ): Promise<OpportunityItem> {
    const actor = authorize(token, 'opportunity.update');
    await delay();
    const db = getDb();
    const opp = db.opportunities.find((o) => o.id === id);
    if (!opp) throw new ApiError(404, 'Không tìm thấy cơ hội.');
    if (patch.status === 'closed') authorize(token, 'opportunity.close');
    const oldStatus = opp.status;
    if (patch.feasibility !== undefined) opp.feasibility = Math.max(1, Math.min(5, Math.round(patch.feasibility)));
    if (patch.benefit !== undefined) opp.benefit = Math.max(1, Math.min(5, Math.round(patch.benefit)));
    opp.opportunityScore = opp.feasibility * opp.benefit;
    opp.opportunityLevel = opportunityLevelFromScore(opp.opportunityScore);
    for (const k of ['category', 'objective', 'description', 'solution', 'expectedResult', 'actualResult', 'ownerId', 'departmentId', 'startDate', 'dueDate'] as const) {
      if (patch[k] !== undefined) (opp as unknown as Record<string, unknown>)[k] = patch[k];
    }
    if (patch.reviewFrequency !== undefined) {
      opp.reviewFrequency = patch.reviewFrequency;
      opp.nextReviewDate = nextReviewDateByFreq(patch.reviewFrequency);
    }
    if (patch.nextReviewDate !== undefined) opp.nextReviewDate = patch.nextReviewDate;
    if (patch.status !== undefined) opp.status = patch.status;
    opp.reviewStatus = calcReviewStatus(opp.nextReviewDate, opp.status);
    opp.updatedBy = actor.id;
    opp.updatedAt = nowIso();
    if (oldStatus !== opp.status) writeLog(actor.id, 'status_change', 'opportunity', opp.id, oldStatus, opp.status);
    persist(db);
    return withOppExtras(db, opp);
  },

  async evaluateOpportunity(token: string | null, id: number, input: { feasibility: number; benefit: number; comment?: string }): Promise<OpportunityItem> {
    const actor = authorize(token, 'opportunity.evaluate');
    await delay();
    const db = getDb();
    const opp = db.opportunities.find((o) => o.id === id);
    if (!opp) throw new ApiError(404, 'Không tìm thấy cơ hội.');
    const feasibility = Math.max(1, Math.min(5, Math.round(input.feasibility)));
    const benefit = Math.max(1, Math.min(5, Math.round(input.benefit)));
    opp.feasibility = feasibility;
    opp.benefit = benefit;
    opp.opportunityScore = feasibility * benefit;
    opp.opportunityLevel = opportunityLevelFromScore(opp.opportunityScore);
    if (input.comment) opp.actualResult = input.comment;
    if (opp.reviewFrequency) opp.nextReviewDate = nextReviewDateByFreq(opp.reviewFrequency);
    opp.reviewStatus = calcReviewStatus(opp.nextReviewDate, opp.status);
    opp.updatedBy = actor.id;
    opp.updatedAt = nowIso();
    writeLog(actor.id, 'evaluate', 'opportunity', opp.id, undefined, opp.opportunityLevel);
    persist(db);
    return withOppExtras(db, opp);
  },
  async deleteOpportunity(token: string | null, id: number): Promise<{ status: string }> {
    authorize(token, 'opportunity.delete');
    await delay();
    const db = getDb();
    const idx = db.opportunities.findIndex((o) => o.id === id);
    if (idx === -1) throw new ApiError(404, 'Không tìm thấy cơ hội.');
    db.opportunities.splice(idx, 1);
    for (const a of db.actions) if (a.relatedOpportunityId === id) a.relatedOpportunityId = null;
    persist(db);
    return { status: 'deleted' };
  },

  // ---------- CR-RISK-OPPORTUNITY-001: DASHBOARD RISK & OPPORTUNITY ----------
  async getRiskDashboard(token: string | null): Promise<RiskDashboardStats> {
    authorize(token, 'risk.view');
    await delay();
    const db = getDb();
    const risks = db.risks;
    const opps = db.opportunities;
    const count = <T,>(arr: T[], pred: (x: T) => boolean) => arr.filter(pred).length;
    const byLevel = <T extends { riskLevel?: RiskLevel; opportunityLevel?: OpportunityLevel }>(arr: T[], key: 'riskLevel' | 'opportunityLevel') => {
      const groups = new Map<string, number>();
      for (const x of arr) {
        const v = (x[key] ?? '') as string;
        groups.set(v, (groups.get(v) ?? 0) + 1);
      }
      return [...groups.entries()].map(([status, c]) => ({ status, count: c }));
    };
    const byStatus = (arr: RoStatus[]) => {
      const groups = new Map<string, number>();
      for (const s of arr) groups.set(s, (groups.get(s) ?? 0) + 1);
      return [...groups.entries()].map(([status, c]) => ({ status, count: c }));
    };
    const byDept = (arr: { departmentId: number | null }[]) => {
      const groups = new Map<number, number>();
      for (const x of arr) {
        const d = x.departmentId ?? 0;
        groups.set(d, (groups.get(d) ?? 0) + 1);
      }
      return [...groups.entries()]
        .map(([departmentId, c]) => ({ departmentId, name: db.departments.find((d) => d.id === departmentId)?.name ?? 'Chưa gán', count: c }))
        .sort((a, b) => b.count - a.count);
    };
    // 5×5 matrix: đủ 25 ô (likelihood 5→1 × impact 1→5) kể cả count = 0.
    const matrix: RiskDashboardStats['riskMatrix'] = [];
    for (let likelihood = 5; likelihood >= 1; likelihood--) {
      for (let impact = 1; impact <= 5; impact++) {
        const score = likelihood * impact;
        matrix.push({ likelihood, impact, score, level: riskLevelFromScore(score), count: count(risks, (r) => r.likelihood === likelihood && r.impact === impact) });
      }
    }
    const acts = db.actions;
    return {
      riskTotal: risks.length,
      riskHigh: count(risks, (r) => r.riskLevel === 'high'),
      riskMedium: count(risks, (r) => r.riskLevel === 'medium'),
      riskLow: count(risks, (r) => r.riskLevel === 'low'),
      riskReviewOverdue: count(risks, (r) => r.reviewStatus === 'overdue'),
      riskReviewDueSoon: count(risks, (r) => r.reviewStatus === 'due_soon'),
      riskByLevel: byLevel<RiskItem>(risks, 'riskLevel'),
      riskByStatus: byStatus(risks.map((r) => r.status)),
      riskByDepartment: byDept(risks),
      riskMatrix: matrix,
      opportunityTotal: opps.length,
      opportunityPriority: count(opps, (o) => o.opportunityLevel === 'priority'),
      opportunityResearch: count(opps, (o) => o.opportunityLevel === 'research'),
      opportunityIgnore: count(opps, (o) => o.opportunityLevel === 'ignore'),
      opportunityReviewOverdue: count(opps, (o) => o.reviewStatus === 'overdue'),
      opportunityReviewDueSoon: count(opps, (o) => o.reviewStatus === 'due_soon'),
      opportunityByLevel: byLevel<OpportunityItem>(opps, 'opportunityLevel'),
      opportunityByStatus: byStatus(opps.map((o) => o.status)),
      opportunityByDepartment: byDept(opps),
      actionSummary: {
        open: count(acts, (a) => a.status === 'open'),
        inProgress: count(acts, (a) => a.status === 'in_progress'),
        overdue: count(acts, (a) => a.status === 'overdue'),
        closed: count(acts, (a) => a.status === 'verified' || a.status === 'closed'),
      },
    };
  },


  // ---------- DASHBOARD ----------
  async getDashboard(token: string | null): Promise<DashboardStats> {
    authorize(token, 'dashboard.view');
    await delay();
    const db = getDb();
    const today = todayStr();
    const overdueTasks = db.tasks
      .filter((t) => t.dueDate < today && t.status !== 'completed' && t.status !== 'cancelled')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const taskTotal = db.tasks.length;
    const taskCompleted = db.tasks.filter((t) => t.status === 'completed').length;

    return {
      taskTotal,
      taskCompleted,
      taskInProgress: db.tasks.filter((t) => t.status === 'in_progress').length,
      taskNotStarted: db.tasks.filter((t) => t.status === 'not_started').length,
      taskOverdue: overdueTasks.length,
      completionRate: taskTotal ? Math.round((taskCompleted / taskTotal) * 100) : 0,
      avgProgress: taskTotal ? Math.round(db.tasks.reduce((s, t) => s + t.progress, 0) / taskTotal) : 0,
      tasksByStatus: (['not_started', 'in_progress', 'blocked', 'delayed', 'completed', 'cancelled'] as TaskStatus[])
        .map((status) => ({ status, count: db.tasks.filter((t) => t.status === status).length })),
      tasksByPhase: db.phases.map((p) => {
        const phaseTasks = db.tasks.filter((t) => t.phaseId === p.id);
        return {
          phaseId: p.id,
          name: p.name,
          total: phaseTasks.length,
          completed: phaseTasks.filter((t) => t.status === 'completed').length,
          avgProgress: phaseTasks.length
            ? Math.round(phaseTasks.reduce((s, t) => s + t.progress, 0) / phaseTasks.length)
            : 0,
        };
      }),
      tasksByPriority: (['critical', 'high', 'medium', 'low'] as Task['priority'][]).map((priority) => ({
        priority,
        count: db.tasks.filter((t) => t.priority === priority).length,
      })),
      docByStatus: (['draft', 'reviewing', 'approval_pending', 'approved', 'published', 'obsolete', 'archived'] as DocumentItem['status'][])
        .map((status) => ({ status, count: db.documents.filter((d) => d.status === status).length })),
      docPending: db.documents.filter((d) => d.status === 'approval_pending').length,
      actionByStatus: (['open', 'in_progress', 'blocked', 'overdue', 'pending_verification', 'verified', 'closed'] as ActionItem['status'][])
        .map((status) => ({ status, count: db.actions.filter((a) => a.status === status).length })),
      actionOverdue: db.actions.filter(
        (a) => a.status === 'overdue' || (a.dueDate < today && a.status !== 'closed' && a.status !== 'verified'),
      ).length,
      overdueTasks: overdueTasks.slice(0, 8),
      pendingDocs: db.documents.filter((d) => d.status === 'reviewing' || d.status === 'approval_pending'),
    };
  },

  // ---------- ACTION / CAPA: create + delete ----------
  async createAction(
    token: string | null,
    input: {
      code: string; title: string; description?: string; source: ActionItem['source'];
      departmentId?: number | null; ownerId?: number | null; issueDescription?: string;
      relatedDocumentId?: number | null; relatedTaskId?: number | null; dueDate: string;
      relatedRiskId?: number | null; relatedOpportunityId?: number | null;
    },
  ): Promise<ActionItem> {
    const actor = authorize(token, 'action.create');
    await delay();
    const db = getDb();
    // CR-RISK-OPPORTUNITY-001: link ngay khi tạo; auto-sync source (mirror BE).
    let source = input.source;
    if (input.relatedRiskId) source = 'risk';
    if (input.relatedOpportunityId) source = 'opportunity';
    const record: ActionItem = {
      id: nextId(db),
      code: input.code,
      title: input.title,
      description: input.description,
      source,
      departmentId: input.departmentId ?? actor.departmentId ?? 0,
      ownerId: input.ownerId ?? actor.id,
      issue: input.issueDescription ?? '',
      relatedDocumentId: input.relatedDocumentId ?? undefined,
      relatedTaskId: input.relatedTaskId ?? undefined,
      relatedRiskId: input.relatedRiskId ?? null,
      relatedOpportunityId: input.relatedOpportunityId ?? null,
      dueDate: input.dueDate,
      status: 'open',
      progress: 0,
    };
    db.actions.push(record);
    writeLog(actor.id, 'create', 'action', record.id);
    if (input.relatedRiskId) writeLog(actor.id, 'link_risk', 'action', record.id, undefined, `risk#${input.relatedRiskId}`);
    if (input.relatedOpportunityId) writeLog(actor.id, 'link_opportunity', 'action', record.id, undefined, `opportunity#${input.relatedOpportunityId}`);
    persist(db);
    return record;
  },

  async deleteAction(token: string | null, id: number): Promise<{ status: string }> {
    authorize(token, 'action.delete');
    await delay();
    const db = getDb();
    const idx = db.actions.findIndex((a) => a.id === id);
    if (idx < 0) throw new ApiError(404, 'Không tìm thấy Action.');
    db.actions.splice(idx, 1);
    persist(db);
    return { status: 'ok' };
  },

  // ---------- MASTER PLAN: nhiều kế hoạch + CRUD task ----------
  async listMasterPlans(token: string | null): Promise<MasterPlan[]> {
    authorize(token, 'master_plan.view');
    await delay();
    const db = getDb();
    const first = db.phases[0];
    const last = db.phases[db.phases.length - 1];
    return [
      {
        id: 1, code: 'MP-2027', name: 'Kế hoạch ISO 2027', cycleLabel: '2026–2027',
        startDate: first?.startDate ?? '2026-10-01', endDate: last?.endDate ?? '2027-12-31',
        status: 'in_progress', createdBy: 2, createdAt: nowIso(), updatedAt: nowIso(),
      },
    ];
  },

  async createMasterPlan(
    token: string | null,
    input: { code: string; name: string; cycleLabel: string; startDate: string; endDate: string; description?: string },
  ): Promise<MasterPlan> {
    authorize(token, 'master_plan.create');
    await delay();
    return { id: nextId(getDb()), ...input, status: 'not_started', createdBy: null, createdAt: nowIso(), updatedAt: nowIso() };
  },

  async updateMasterPlan(
    token: string | null,
    id: number,
    patch: Partial<{ code: string; name: string; cycleLabel: string; startDate: string; endDate: string; status: string; description: string }>,
  ): Promise<MasterPlan> {
    authorize(token, 'master_plan.update');
    await delay();
    return {
      id, code: patch.code ?? '', name: patch.name ?? '', cycleLabel: patch.cycleLabel ?? '',
      startDate: patch.startDate ?? '', endDate: patch.endDate ?? '', status: patch.status ?? 'not_started',
      description: patch.description, createdBy: null, createdAt: nowIso(), updatedAt: nowIso(),
    };
  },

  async deleteMasterPlan(token: string | null, _id: number): Promise<{ status: string }> {
    authorize(token, 'master_plan.delete');
    await delay();
    return { status: 'ok' };
  },

  async createTask(
    token: string | null,
    input: {
      phaseId: number; parentId?: number | null; code: string; name: string;
      ownerId?: number | null; departmentId?: number | null; priority?: Task['priority'];
      startDate: string; dueDate: string; note?: string;
    },
  ): Promise<Task> {
    const actor = authorize(token, 'master_plan.create');
    await delay();
    const db = getDb();
    const record: Task = {
      id: nextId(db), code: input.code, name: input.name, phaseId: input.phaseId,
      parentId: input.parentId ?? null, sortOrder: 0,
      ownerId: input.ownerId ?? actor.id, departmentId: input.departmentId ?? actor.departmentId,
      priority: input.priority ?? 'medium', status: 'not_started', progress: 0,
      startDate: input.startDate, dueDate: input.dueDate, note: input.note,
    };
    db.tasks.push(record);
    writeLog(actor.id, 'create', 'master_plan_task', record.id);
    persist(db);
    return record;
  },

  async deleteTask(token: string | null, id: number): Promise<{ status: string }> {
    authorize(token, 'master_plan.delete');
    await delay();
    const db = getDb();
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) throw new ApiError(404, 'Không tìm thấy công việc.');
    db.tasks.splice(idx, 1);
    persist(db);
    return { status: 'ok' };
  },

  async reorderTasks(token: string | null, orderedIds: number[]): Promise<{ status: string }> {
    authorize(token, 'master_plan.update');
    await delay();
    const db = getDb();
    orderedIds.forEach((id, i) => {
      const t = db.tasks.find((x) => x.id === id);
      if (t) t.sortOrder = i + 1;
    });
    persist(db);
    return { status: 'ok' };
  },

  // ---------- DOCUMENT: nâng cấp version + auto-version ----------
  async newDocumentVersion(
    token: string | null,
    id: number,
    input: { version?: string; changeSummary?: string },
  ): Promise<DocumentItem> {
    authorize(token, 'document.update');
    await delay();
    const db = getDb();
    const doc = db.documents.find((d) => d.id === id);
    if (!doc) throw new ApiError(404, 'Không tìm thấy tài liệu.');
    if (doc.status !== 'published') throw new ApiError(409, 'Chỉ tạo phiên bản mới cho tài liệu đã ban hành.');
    const major = parseInt(doc.currentVersion.replace(/\D/g, ''), 10) || 0;
    const version = input.version ?? `V${major + 1}.0`;
    doc.versions.forEach((v) => { v.isCurrent = false; });
    doc.versions.push({ id: nextId(db), version, changeSummary: input.changeSummary ?? `Tạo phiên bản ${version}`, createdBy: 0, createdAt: todayStr(), isCurrent: true });
    doc.currentVersion = version;
    doc.status = 'draft';
    doc.workflowStep = 1;
    persist(db);
    return doc;
  },

  async toggleAutoVersion(token: string | null, id: number, autoVersion: boolean): Promise<DocumentItem> {
    authorize(token, 'document.update');
    await delay();
    const db = getDb();
    const doc = db.documents.find((d) => d.id === id);
    if (!doc) throw new ApiError(404, 'Không tìm thấy tài liệu.');
    doc.autoVersion = autoVersion;
    persist(db);
    return doc;
  },

  // ---------- ADMIN (user/role) ----------
  async listUsers(token: string | null) {
    authorize(token, 'user.view');
    await delay();
    return getDb().users.map(({ password: _password, ...safe }) => safe);
  },

  async listRoles(token: string | null) {
    authorize(token, 'role.view');
    await delay();
    return getDb().roles.map((r) => ({ ...r, permissions: [...r.permissions] }));
  },

  /** POST /admin/users – tạo người dùng. Quyền: user.create. */
  async createUser(
    token: string | null,
    input: {
      username: string; password: string; fullName: string;
      email?: string; departmentId?: number | null;
      roleCodes?: string[]; active?: boolean;
    },
  ) {
    const actor = authorize(token, 'user.create');
    await delay();
    const db = getDb();
    const username = input.username.trim();
    if (!username || !input.fullName.trim() || !input.password) {
      throw new ApiError(422, 'Username, họ tên và mật khẩu là bắt buộc.');
    }
    if (input.password.length < 6) throw new ApiError(422, 'Mật khẩu phải có ít nhất 6 ký tự.');
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new ApiError(422, `Username "${username}" đã tồn tại.`);
    }
    const email = input.email?.trim() || '';
    if (email && db.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
      throw new ApiError(422, `Email "${email}" đã tồn tại.`);
    }
    const roleCodes = input.roleCodes ?? [];
    for (const code of roleCodes) {
      if (!db.roles.some((r) => r.code === code)) throw new ApiError(422, `Vai trò "${code}" không tồn tại.`);
    }
    const user: User = {
      id: nextId(db),
      username,
      password: input.password,
      fullName: input.fullName.trim(),
      email,
      departmentId: input.departmentId ?? null,
      roleCodes: roleCodes as User['roleCodes'],
      active: input.active ?? true,
    };
    db.users.push(user);
    writeLog(actor.id, 'create', 'user', user.id);
    persist(db);
    const { password: _password, ...safe } = user;
    return safe;
  },

  /** PATCH /admin/users/{id} – sửa người dùng. Quyền: user.update. */
  async updateUser(
    token: string | null,
    id: number,
    patch: {
      username?: string; password?: string; fullName?: string;
      email?: string; departmentId?: number | null;
      roleCodes?: string[]; active?: boolean;
    },
  ) {
    const actor = authorize(token, 'user.update');
    await delay();
    const db = getDb();
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new ApiError(404, 'Không tìm thấy người dùng.');
    if (patch.username !== undefined) {
      const username = patch.username.trim();
      if (!username) throw new ApiError(422, 'Username không được để trống.');
      if (db.users.some((u) => u.id !== id && u.username.toLowerCase() === username.toLowerCase())) {
        throw new ApiError(422, `Username "${username}" đã tồn tại.`);
      }
      user.username = username;
    }
    if (patch.password) {
      if (patch.password.length < 6) throw new ApiError(422, 'Mật khẩu phải có ít nhất 6 ký tự.');
      user.password = patch.password;
    }
    if (patch.fullName !== undefined) {
      if (!patch.fullName.trim()) throw new ApiError(422, 'Họ tên không được để trống.');
      user.fullName = patch.fullName.trim();
    }
    if (patch.email !== undefined) {
      const email = patch.email.trim();
      if (email && db.users.some((u) => u.id !== id && u.email?.toLowerCase() === email.toLowerCase())) {
        throw new ApiError(422, `Email "${email}" đã tồn tại.`);
      }
      user.email = email;
    }
    if (patch.departmentId !== undefined) user.departmentId = patch.departmentId;
    if (patch.active !== undefined) {
      if (actor.id === id && !patch.active) {
        throw new ApiError(409, 'Không thể tự vô hiệu hóa tài khoản của chính mình.');
      }
      user.active = patch.active;
    }
    if (patch.roleCodes !== undefined) {
      for (const code of patch.roleCodes) {
        if (!db.roles.some((r) => r.code === code)) throw new ApiError(422, `Vai trò "${code}" không tồn tại.`);
      }
      user.roleCodes = patch.roleCodes as User['roleCodes'];
    }
    writeLog(actor.id, 'update', 'user', user.id);
    persist(db);
    const { password: _password, ...safe } = user;
    return safe;
  },

  /** DELETE /admin/users/{id} – xóa người dùng. Quyền: user.update. Chặn tự xóa. */
  async deleteUser(token: string | null, id: number): Promise<{ status: string }> {
    const actor = authorize(token, 'user.update');
    await delay();
    if (actor.id === id) throw new ApiError(409, 'Không thể xóa tài khoản của chính mình.');
    const db = getDb();
    const index = db.users.findIndex((u) => u.id === id);
    if (index < 0) throw new ApiError(404, 'Không tìm thấy người dùng.');
    db.users.splice(index, 1);
    writeLog(actor.id, 'delete', 'user', id);
    persist(db);
    return { status: 'ok' };
  },

  /** POST /admin/roles – tạo vai trò mới. Quyền: role.manage. */
  async createRole(
    token: string | null,
    input: { code: string; name: string; description?: string; permissions?: string[] },
  ): Promise<RoleItem> {
    const actor = authorize(token, 'role.manage');
    await delay();
    const db = getDb();
    const code = input.code.trim().toLowerCase();
    if (!code || !/^[a-z][a-z0-9_]*$/.test(code)) {
      throw new ApiError(422, 'Mã vai trò chỉ gồm chữ thường, số và dấu gạch dưới, bắt đầu bằng chữ.');
    }
    if (db.roles.some((r) => r.code === code)) throw new ApiError(422, `Mã vai trò "${code}" đã tồn tại.`);
    const name = input.name.trim();
    if (!name) throw new ApiError(422, 'Tên vai trò là bắt buộc.');
    const permissions = (input.permissions ?? []).filter(isPermission);
    const role: RoleItem = { id: nextId(db), code, name, description: input.description, permissions };
    db.roles.push(role);
    writeLog(actor.id, 'create', 'role', role.id ?? 0);
    persist(db);
    return { ...role, permissions: [...role.permissions] };
  },

  /** PATCH /admin/roles/{id} – sửa tên + phân quyền. Quyền: role.manage. */
  async updateRole(
    token: string | null,
    id: number,
    patch: { name?: string; description?: string; permissions?: string[] },
  ): Promise<RoleItem> {
    const actor = authorize(token, 'role.manage');
    await delay();
    const db = getDb();
    const role = db.roles.find((r) => r.id === id);
    if (!role) throw new ApiError(404, 'Không tìm thấy vai trò.');
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new ApiError(422, 'Tên vai trò không được để trống.');
      role.name = patch.name.trim();
    }
    if (patch.description !== undefined) role.description = patch.description;
    if (patch.permissions !== undefined) role.permissions = patch.permissions.filter(isPermission);
    writeLog(actor.id, 'update', 'role', role.id ?? 0);
    persist(db);
    return { ...role, permissions: [...role.permissions] };
  },

  /** DELETE /admin/roles/{id} – xóa vai trò tùy chỉnh. Chặn vai trò chuẩn + vai trò đang gán user. */
  async deleteRole(token: string | null, id: number): Promise<{ status: string }> {
    const actor = authorize(token, 'role.manage');
    await delay();
    const db = getDb();
    const role = db.roles.find((r) => r.id === id);
    if (!role) throw new ApiError(404, 'Không tìm thấy vai trò.');
    if ((ROLE_CODES as readonly string[]).includes(role.code)) {
      throw new ApiError(409, 'Không thể xóa vai trò chuẩn của hệ thống. Chỉ được sửa phân quyền.');
    }
    if (db.users.some((u) => (u.roleCodes as string[]).includes(role.code))) {
      throw new ApiError(409, 'Vai trò đang được gán cho người dùng. Hãy gán lại người dùng trước khi xóa.');
    }
    db.roles = db.roles.filter((r) => r.id !== role.id);
    writeLog(actor.id, 'delete', 'role', role.id ?? 0);
    persist(db);
    return { status: 'ok' };
  },

  async resetDemo(token: string | null): Promise<void> {
    authorize(token, 'user.view');
    await delay(150);
    resetDb();
  },
};


