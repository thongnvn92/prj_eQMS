// Kiểu dữ liệu domain – DMC eQMS (khớp với docs/database-schema.md)
import type { Permission, RoleCode } from '../auth/permissions';

export type TaskStatus =
  | 'not_started' | 'in_progress' | 'blocked' | 'delayed' | 'completed' | 'cancelled';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export type DocumentStatus =
  | 'draft' | 'reviewing' | 'approval_pending' | 'approved' | 'published' | 'obsolete' | 'archived';

export type DocumentType =
  | 'policy' | 'manual' | 'regulation' | 'procedure' | 'work_instruction' | 'form' | 'record' | 'standard';

export type ActionStatus =
  | 'open' | 'in_progress' | 'blocked' | 'overdue' | 'pending_verification' | 'verified' | 'closed';

export type ActionSource =
  | 'audit_finding' | 'ncr' | 'complaint' | 'risk' | 'opportunity' | 'management' | 'internal_audit' | 'other';

export type DocAction = 'submit' | 'review' | 'approve' | 'reject' | 'publish';

export interface Department {
  id: number;
  code: string;
  name: string;
}

export interface User {
  id: number;
  username: string;
  password: string; // demo plain text; production = bcrypt hash
  fullName: string;
  email: string;
  departmentId: number | null;
  roleCodes: RoleCode[];
  active: boolean;
}

export interface Phase {
  id: number;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  /** CR Master Plan ISO: phase thuộc Master Plan nào (backend PhaseResource). */
  masterPlanId?: number;
}

/** Kế hoạch tổng thể (một master plan có nhiều phase + task). */
export interface MasterPlan {
  id: number;
  code: string;
  name: string;
  cycleLabel: string;
  startDate: string;
  endDate: string;
  status: string;
  description?: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: number;
  code: string;
  name: string;
  phaseId: number;
  parentId?: number | null;
  sortOrder?: number;
  ownerId: number | null;
  departmentId: number | null;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  startDate: string;
  dueDate: string;
  result?: string;
  note?: string;
  /** Sub-task lồng bên trong (tối đa 5 cấp); do backend trả khi expand. */
  children?: Task[];
}

export interface DocVersion {
  id: number;
  version: string;
  changeSummary: string;
  createdBy: number;
  createdAt: string;
  approvedBy?: number;
  approvedAt?: string;
  isCurrent: boolean;
}

export interface DocApproval {
  id: number;
  version: string;
  step: string;
  approverId: number;
  action: string;
  comment?: string;
  decidedAt: string;
}

/** Tệp đính kèm của tài liệu, quản lý theo revision (kiểu SVN). */
export interface DocumentFile {
  id: number;
  documentId: number;
  documentVersionId: number | null;
  revision: number;
  changeNote: string | null;
  originalName: string;
  mimeType: string | null;
  size: number;
  uploadedBy: number;
  uploadedAt: string;
}

export interface DocumentItem {
  id: number;
  code: string;
  name: string;
  docType: DocumentType;
  departmentId: number;
  ownerId: number;
  currentVersion: string;
  status: DocumentStatus;
  statusUpdatedAt?: string;
  autoVersion?: boolean;
  createdAt?: string;
  updatedAt?: string;
  workflowStep: number;
  relatedTaskId?: number;
  description?: string;
  effectiveDate?: string;
  versions: DocVersion[];
  approvals: DocApproval[];
  files?: DocumentFile[];
}

export interface ActionItem {
  id: number;
  code: string;
  title: string;
  description?: string;
  source: ActionSource;
  departmentId: number | null;
  ownerId: number | null;
  issue: string;
  relatedDocumentId?: number;
  relatedTaskId?: number;
  /** CR-RISK-OPPORTUNITY-001: liên kết Action ↔ Risk/Opportunity. */
  relatedRiskId?: number | null;
  relatedOpportunityId?: number | null;
  dueDate: string;
  status: ActionStatus;
  progress: number;
  result?: string;
  evidence?: string;
}

// ---------- CR-RISK-OPPORTUNITY-001: Risk & Opportunity ----------

export type RiskLevel = 'low' | 'medium' | 'high';
export type OpportunityLevel = 'ignore' | 'research' | 'priority';
export type RoStatus = 'open' | 'in_progress' | 'blocked' | 'pending_verification' | 'closed';
export type RoSourceType = 'internal' | 'external' | 'interested_party';
export type ReviewFrequency = 'daily' | 'monthly' | 'quarterly' | 'yearly' | 'batch' | 'custom';
export type ReviewStatus = 'overdue' | 'due_soon' | 'normal';

/** Risk Register – QT-BISO.03-BM.02 (score = likelihood × impact, backend tính). */
export interface RiskItem {
  id: number;
  code: string;
  sourceType: RoSourceType;
  category?: string | null;
  objective?: string | null;
  description?: string | null;
  likelihood: number; // 1..5
  impact: number; // 1..5
  riskScore: number; // = likelihood × impact
  riskLevel: RiskLevel;
  initialLikelihood: number;
  initialImpact: number;
  initialScore: number;
  initialLevel: RiskLevel;
  treatment?: string | null;
  expectedResult?: string | null;
  ownerId: number | null;
  departmentId: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  reviewFrequency?: ReviewFrequency | null;
  nextReviewDate?: string | null;
  reviewStatus?: ReviewStatus | null;
  status: RoStatus;
  progress?: number;
  actionCount?: number;
  lastReviewedBy?: number | null;
  lastReviewedAt?: string | null;
  lastReviewComment?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string;
  updatedAt?: string;
  assessments?: RiskAssessmentItem[];
  actions?: ActionItem[];
}

/** Lịch sử đánh giá rủi ro: initial + residual. */
export interface RiskAssessmentItem {
  id: number;
  riskId: number;
  kind: 'initial' | 'residual';
  likelihood: number;
  impact: number;
  score: number;
  level: RiskLevel;
  assessedBy: number | null;
  comment?: string | null;
  createdAt?: string;
}

/** Opportunity Register – QT-BISO.03-BM.03 (score = feasibility × benefit). */
export interface OpportunityItem {
  id: number;
  code: string;
  sourceType: RoSourceType;
  category?: string | null;
  objective?: string | null;
  description?: string | null;
  feasibility: number; // 1..5
  benefit: number; // 1..5
  opportunityScore: number;
  opportunityLevel: OpportunityLevel;
  solution?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  ownerId: number | null;
  departmentId: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  reviewFrequency?: ReviewFrequency | null;
  nextReviewDate?: string | null;
  reviewStatus?: ReviewStatus | null;
  status: RoStatus;
  progress?: number;
  actionCount?: number;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string;
  updatedAt?: string;
  actions?: ActionItem[];
}

/** Dashboard Rủi ro & Cơ hội (GET /risk-dashboard). */
export interface RiskDashboardStats {
  riskTotal: number;
  riskHigh: number;
  riskMedium: number;
  riskLow: number;
  riskReviewOverdue: number;
  riskReviewDueSoon: number;
  riskByLevel: { status: string; count: number }[];
  riskByStatus: { status: string; count: number }[];
  riskByDepartment: { departmentId: number; name: string; count: number }[];
  riskMatrix: { likelihood: number; impact: number; score: number; level: RiskLevel; count: number }[];
  opportunityTotal: number;
  opportunityPriority: number;
  opportunityResearch: number;
  opportunityIgnore: number;
  opportunityReviewOverdue: number;
  opportunityReviewDueSoon: number;
  opportunityByLevel: { status: string; count: number }[];
  opportunityByStatus: { status: string; count: number }[];
  opportunityByDepartment: { departmentId: number; name: string; count: number }[];
  actionSummary: { open: number; inProgress: number; overdue: number; closed: number };
}

export interface ActivityLog {
  id: number;
  userId: number;
  action: string;
  entity: string;
  entityId: number;
  oldStatus?: string;
  newStatus?: string;
  at: string;
}

/** Vai trò (RBAC) – 9 vai trò chuẩn + role tùy chỉnh do admin tạo. */
export interface RoleItem {
  id?: number;
  code: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface MockDb {
  departments: Department[];
  users: User[];
  roles: RoleItem[];
  phases: Phase[];
  tasks: Task[];
  documents: DocumentItem[];
  actions: ActionItem[];
  logs: ActivityLog[];
  seq: number;
  /** CR-RISK-OPPORTUNITY-001 */
  risks: RiskItem[];
  opportunities: OpportunityItem[];
  riskAssessments: RiskAssessmentItem[];
}

/** Thông tin user trả về client – KHÔNG có password */
export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  departmentId: number | null;
  departmentName: string;
  roleCodes: RoleCode[];
  roleNames: string[];
  permissions: Permission[];
}

export interface DashboardStats {
  taskTotal: number;
  taskCompleted: number;
  taskInProgress: number;
  taskNotStarted: number;
  taskOverdue: number;
  completionRate: number;
  avgProgress: number;
  tasksByStatus: { status: TaskStatus; count: number }[];
  tasksByPhase: { phaseId: number; name: string; total: number; completed: number; avgProgress: number }[];
  tasksByPriority: { priority: Priority; count: number }[];
  docByStatus: { status: DocumentStatus; count: number }[];
  docPending: number;
  actionByStatus: { status: ActionStatus; count: number }[];
  actionOverdue: number;
  overdueTasks: Task[];
  pendingDocs: DocumentItem[];
}
