// Data hooks – API facade cho pages, ĐẶT TRÊN Redux Toolkit store.
// Pages giữ nguyên cách dùng (useMasterPlan().data, updateTask.mutate(...)),
// thay thế hoàn toàn @tanstack/react-query.
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { api } from '../services/api';
import type { ImportResult } from '../services/api';
import { fetchActions, updateAction, createAction, deleteAction } from '../store/slices/actionsSlice';
import { fetchDashboard } from '../store/slices/dashboardSlice';
import { fetchDocuments, transitionDocument, createDocument, importDocuments, updateDocument, deleteDocument, uploadDocumentFile, newDocumentVersion, toggleAutoVersion } from '../store/slices/documentsSlice';
import { fetchLookups } from '../store/slices/lookupsSlice';
import { fetchMasterPlan, updateTask, updateTaskProgress, createTask, importTasks, deleteTask, reorderTasks, createMasterPlan, updateMasterPlan, deleteMasterPlan } from '../store/slices/masterPlanSlice';
import { fetchAdmin, resetDemo, createUser, updateUser, deleteUser, createRole, updateRole, deleteRole, fetchDepartments, fetchPhases, fetchDocumentStatuses, createDepartment, updateDepartment, deleteDepartment, createPhase, updatePhase, deletePhase, createDocumentStatus, updateDocumentStatus, deleteDocumentStatus } from '../store/slices/adminSlice';
import { fetchRisks, createRisk, updateRisk, evaluateRisk, deleteRisk, fetchRiskDetail } from '../store/slices/risksSlice';
import { fetchOpportunities, createOpportunity, updateOpportunity, evaluateOpportunity, deleteOpportunity } from '../store/slices/opportunitiesSlice';
import { fetchRiskDashboard } from '../store/slices/riskDashboardSlice';
import type {
  ActionItem, DashboardStats, Department, DocAction, DocumentItem, DocumentStatusItem, MasterPlan, OpportunityItem, Phase,
  RiskAssessmentItem, RiskDashboardStats, RiskItem, Task, TaskStatus,
} from '../mock/types';

export type Status = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface QueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  status: Status;
}

export interface MutationCallbacks<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (error: unknown) => void;
}

/** Wrapper mutation (giống useMutation của TanStack Query): mutate(args, callbacks). */
export interface Mutation<TArgs, TResult = unknown> {
  isPending: boolean;
  mutate: (args: TArgs, callbacks?: MutationCallbacks<TResult>) => Promise<void>;
}

/** Nạp data khi mount nếu slice chưa có data (giống lazy query) */
function useFetchOnce(status: Status, hasData: boolean, fetcher: () => void) {
  useEffect(() => {
    if (status === 'idle' && !hasData) fetcher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasData]);
}

// ---------- Queries dùng chung ----------
export function useLookups(): QueryResult<{
  people: { id: number; fullName: string }[];
  departments: { id: number; code: string; name: string }[];
  phases: { id: number; code: string; name: string; startDate: string; endDate: string }[];
  documentStatuses: { id: number; code: string; label: string; color?: string; sortOrder?: number; isActive?: boolean; isSystem?: boolean }[];
}> {
  const dispatch = useAppDispatch();
  const { people, departments, phases, documentStatuses, status } = useAppSelector((s) => s.lookups);
  useFetchOnce(status, status === 'succeeded', () => void dispatch(fetchLookups()));
  return { data: status === 'succeeded' ? { people, departments, phases, documentStatuses } : undefined, isLoading: status === 'loading', status };
}

export function useDashboard(): QueryResult<DashboardStats> {
  const dispatch = useAppDispatch();
  const { data, status } = useAppSelector((s) => s.dashboard);
  useFetchOnce(status, !!data, () => void dispatch(fetchDashboard()));
  return { data: data ?? undefined, isLoading: status === 'loading' || (status === 'idle' && !data), status };
}

export function useMasterPlan(): QueryResult<{ phases: Phase[]; tasks: Task[]; plans: MasterPlan[] }> {
  const dispatch = useAppDispatch();
  const { phases, tasks, plans, status } = useAppSelector((s) => s.masterPlan);
  useFetchOnce(status, status === 'succeeded', () => void dispatch(fetchMasterPlan()));
  return { data: status === 'succeeded' ? { phases, tasks, plans } : undefined, isLoading: status === 'loading', status };
}

export function useDocuments(): QueryResult<DocumentItem[]> {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.documents);
  useFetchOnce(status, status === 'succeeded', () => void dispatch(fetchDocuments()));
  return { data: status === 'succeeded' ? items : undefined, isLoading: status === 'loading', status };
}

export function useActionItems(): QueryResult<ActionItem[]> {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.actions);
  useFetchOnce(status, status === 'succeeded', () => void dispatch(fetchActions()));
  return { data: status === 'succeeded' ? items : undefined, isLoading: status === 'loading', status };
}

export function useUsers() {
  const dispatch = useAppDispatch();
  const { users, status } = useAppSelector((s) => s.admin);
  useFetchOnce(status, status === 'succeeded', () => void dispatch(fetchAdmin()));
  return { data: status === 'succeeded' ? users : undefined, isLoading: status === 'loading', status };
}

export function useRoles() {
  const dispatch = useAppDispatch();
  const { roles, status } = useAppSelector((s) => s.admin);
  useFetchOnce(status, status === 'succeeded', () => void dispatch(fetchAdmin()));
  return { data: status === 'succeeded' ? roles : undefined, isLoading: status === 'loading', status };
}

// ---------- Master Plan: Task & Plan mutations ----------
export function useUpdateTask(): Mutation<{ id: number; patch: { status?: TaskStatus; progress?: number; ownerId?: number; note?: string; code?: string; name?: string; phaseId?: number; priority?: Task['priority']; departmentId?: number | null; startDate?: string; dueDate?: string; result?: string } }> {
  const dispatch = useAppDispatch();
  const updating = useAppSelector((s) => s.masterPlan.updating);
  return { isPending: updating, mutate: (input, callbacks) => dispatch(updateTask(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateTaskProgress(): Mutation<{ id: number; progress: number }> {
  const dispatch = useAppDispatch();
  const updating = useAppSelector((s) => s.masterPlan.updating);
  return { isPending: updating, mutate: (input, callbacks) => dispatch(updateTaskProgress(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useCreateTask(): Mutation<Parameters<typeof api.createTask>[0]> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (input, callbacks) => dispatch(createTask(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

/** Import hàng loạt task (bulk endpoint) – 1 request cho cả file CSV. */
export function useImportTasks(): Mutation<Parameters<typeof api.importTasks>[0], ImportResult> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (input, callbacks) => dispatch(importTasks(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteTask(): Mutation<number> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (id, callbacks) => dispatch(deleteTask(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useReorderTasks(): Mutation<number[]> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (orderedIds, callbacks) => dispatch(reorderTasks(orderedIds)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useCreateMasterPlan(): Mutation<Parameters<typeof api.createMasterPlan>[0]> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (input, callbacks) => dispatch(createMasterPlan(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateMasterPlan(): Mutation<{ id: number; patch: Parameters<typeof api.updateMasterPlan>[1] }> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (input, callbacks) => dispatch(updateMasterPlan(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteMasterPlan(): Mutation<number> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (id, callbacks) => dispatch(deleteMasterPlan(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

// ---------- Action / CAPA mutations ----------
export function useCreateAction(): Mutation<Parameters<typeof api.createAction>[0]> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (input, callbacks) => dispatch(createAction(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateAction(): Mutation<{
  id: number;
  patch: { status?: ActionItem['status']; progress?: number; result?: string; evidence?: string };
}> {
  const dispatch = useAppDispatch();
  const updating = useAppSelector((s) => s.actions.updating);
  return { isPending: updating, mutate: (input, callbacks) => dispatch(updateAction(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteAction(): Mutation<number> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (id, callbacks) => dispatch(deleteAction(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

// ---------- Document Control mutations ----------
export function useCreateDocument(): Mutation<{
  code: string; name: string; docType: DocumentItem['docType'];
  departmentId?: number | null; ownerId?: number | null; ownerName?: string | null;
  relatedTaskId?: number | null; description?: string; changeSummary?: string;
  autoVersion?: boolean;
}> {
  const dispatch = useAppDispatch();
  const creating = useAppSelector((s) => s.documents.creating);
  return { isPending: creating, mutate: (input, callbacks) => dispatch(createDocument(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

/** Import hàng loạt tài liệu (bulk endpoint) – 1 request cho cả file CSV. */
export function useImportDocuments(): Mutation<Parameters<typeof api.importDocuments>[0], ImportResult> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (input, callbacks) => dispatch(importDocuments(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateDocument(): Mutation<{
  id: number; patch: {
    code?: string; name?: string; docType?: DocumentItem['docType'];
    departmentId?: number | null; ownerId?: number | null; ownerName?: string | null;
    relatedTaskId?: number | null; description?: string; changeSummary?: string;
    autoVersion?: boolean; version?: string;
  };
}> {
  const dispatch = useAppDispatch();
  const updating = useAppSelector((s) => s.documents.updating);
  return { isPending: updating, mutate: (input, callbacks) => dispatch(updateDocument(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteDocument(): Mutation<number> {
  const dispatch = useAppDispatch();
  const deleting = useAppSelector((s) => s.documents.deleting);
  return { isPending: deleting, mutate: (id, callbacks) => dispatch(deleteDocument(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useTransitionDocument(): Mutation<{ id: number; action: DocAction; comment?: string }> {
  const dispatch = useAppDispatch();
  const transitioning = useAppSelector((s) => s.documents.transitioning);
  return { isPending: transitioning, mutate: (input, callbacks) => dispatch(transitionDocument(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useNewDocumentVersion(): Mutation<{ id: number; version?: string; changeSummary?: string }> {
  const dispatch = useAppDispatch();
  const updating = useAppSelector((s) => s.documents.updating);
  return { isPending: updating, mutate: (input, callbacks) => dispatch(newDocumentVersion(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useToggleAutoVersion(): Mutation<{ id: number; autoVersion: boolean }> {
  const dispatch = useAppDispatch();
  const updating = useAppSelector((s) => s.documents.updating);
  return { isPending: updating, mutate: (input, callbacks) => dispatch(toggleAutoVersion(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUploadDocumentFile(): Mutation<{ documentId: number; files: File[]; changeNote?: string }> {
  const dispatch = useAppDispatch();
  const uploading = useAppSelector((s) => s.documents.uploading);
  return { isPending: uploading, mutate: (input, callbacks) => dispatch(uploadDocumentFile(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

// ---------- Admin (users, roles, reset demo) mutations ----------
export function useCreateUser(): Mutation<Parameters<typeof api.createUser>[0]> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(createUser(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateUser(): Mutation<{ id: number; patch: Parameters<typeof api.updateUser>[1] }> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(updateUser(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteUser(): Mutation<number> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (id, callbacks) => dispatch(deleteUser(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useCreateRole(): Mutation<Parameters<typeof api.createRole>[0]> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(createRole(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateRole(): Mutation<{ id: number; patch: { name?: string; description?: string; permissions?: string[] } }> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(updateRole(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteRole(): Mutation<number> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (id, callbacks) => dispatch(deleteRole(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useResetDemo(): Mutation<void> {
  const dispatch = useAppDispatch();
  const resetting = useAppSelector((s) => s.admin.resetting);
  return { isPending: resetting, mutate: (_input, callbacks) => dispatch(resetDemo()).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

// ---------- Admin master-data (departments / phases / document statuses) ----------
export function useAdminDepartments(): QueryResult<Department[]> {
  const dispatch = useAppDispatch();
  const { departments, departmentsStatus } = useAppSelector((s) => s.admin);
  useFetchOnce(departmentsStatus, departmentsStatus === 'succeeded', () => void dispatch(fetchDepartments()));
  return { data: departmentsStatus === 'succeeded' ? departments : undefined, isLoading: departmentsStatus === 'loading', status: departmentsStatus };
}

export function useAdminPhases(): QueryResult<Phase[]> {
  const dispatch = useAppDispatch();
  const { phases, phasesStatus } = useAppSelector((s) => s.admin);
  useFetchOnce(phasesStatus, phasesStatus === 'succeeded', () => void dispatch(fetchPhases()));
  return { data: phasesStatus === 'succeeded' ? phases : undefined, isLoading: phasesStatus === 'loading', status: phasesStatus };
}

export function useAdminDocumentStatuses(): QueryResult<DocumentStatusItem[]> {
  const dispatch = useAppDispatch();
  const { documentStatuses, documentStatusesStatus } = useAppSelector((s) => s.admin);
  useFetchOnce(documentStatusesStatus, documentStatusesStatus === 'succeeded', () => void dispatch(fetchDocumentStatuses()));
  return { data: documentStatusesStatus === 'succeeded' ? documentStatuses : undefined, isLoading: documentStatusesStatus === 'loading', status: documentStatusesStatus };
}

export function useCreateDepartment(): Mutation<Parameters<typeof api.createDepartment>[0]> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(createDepartment(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateDepartment(): Mutation<{ id: number; patch: Parameters<typeof api.updateDepartment>[1] }> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(updateDepartment(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteDepartment(): Mutation<number> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (id, callbacks) => dispatch(deleteDepartment(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useCreatePhase(): Mutation<Parameters<typeof api.createPhase>[0]> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(createPhase(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdatePhase(): Mutation<{ id: number; patch: Parameters<typeof api.updatePhase>[1] }> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(updatePhase(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeletePhase(): Mutation<number> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (id, callbacks) => dispatch(deletePhase(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useCreateDocumentStatus(): Mutation<Parameters<typeof api.createDocumentStatus>[0]> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(createDocumentStatus(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateDocumentStatus(): Mutation<{ id: number; patch: Parameters<typeof api.updateDocumentStatus>[1] }> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(updateDocumentStatus(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteDocumentStatus(): Mutation<number> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.admin.saving);
  return { isPending: saving, mutate: (id, callbacks) => dispatch(deleteDocumentStatus(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

// ---------- Rủi ro & Cơ hội (CR-RISK-OPPORTUNITY-001) ----------
export function useRiskItems(): QueryResult<RiskItem[]> {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.risks);
  useFetchOnce(status, status === 'succeeded', () => void dispatch(fetchRisks()));
  return { data: status === 'succeeded' ? items : undefined, isLoading: status === 'loading', status };
}

export function useOpportunityItems(): QueryResult<OpportunityItem[]> {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.opportunities);
  useFetchOnce(status, status === 'succeeded', () => void dispatch(fetchOpportunities()));
  return { data: status === 'succeeded' ? items : undefined, isLoading: status === 'loading', status };
}

export function useRiskDashboard(): QueryResult<RiskDashboardStats> {
  const dispatch = useAppDispatch();
  const { stats, status } = useAppSelector((s) => s.riskDashboard);
  useFetchOnce(status, !!stats, () => void dispatch(fetchRiskDashboard()));
  return { data: stats ?? undefined, isLoading: status === 'loading' || (status === 'idle' && !stats), status };
}

export function useCreateRisk(): Mutation<Parameters<typeof api.createRisk>[0], RiskItem> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.risks.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(createRisk(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateRisk(): Mutation<{ id: number; patch: Parameters<typeof api.updateRisk>[1] }, RiskItem> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.risks.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(updateRisk(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useEvaluateRisk(): Mutation<{ id: number; likelihood: number; impact: number; comment?: string }, RiskItem> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.risks.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(evaluateRisk(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteRisk(): Mutation<number> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.risks.saving);
  return { isPending: saving, mutate: (id, callbacks) => dispatch(deleteRisk(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useFetchRiskDetail(): Mutation<number, { risk: RiskItem; history: RiskAssessmentItem[] }> {
  const dispatch = useAppDispatch();
  return { isPending: false, mutate: (id, callbacks) => dispatch(fetchRiskDetail(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useCreateOpportunity(): Mutation<Parameters<typeof api.createOpportunity>[0], OpportunityItem> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.opportunities.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(createOpportunity(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useUpdateOpportunity(): Mutation<{ id: number; patch: Parameters<typeof api.updateOpportunity>[1] }, OpportunityItem> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.opportunities.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(updateOpportunity(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useEvaluateOpportunity(): Mutation<{ id: number; feasibility: number; benefit: number; comment?: string }, OpportunityItem> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.opportunities.saving);
  return { isPending: saving, mutate: (input, callbacks) => dispatch(evaluateOpportunity(input)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}

export function useDeleteOpportunity(): Mutation<number> {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.opportunities.saving);
  return { isPending: saving, mutate: (id, callbacks) => dispatch(deleteOpportunity(id)).unwrap().then((result) => callbacks?.onSuccess?.(result)).catch((e) => callbacks?.onError?.(e)) };
}




