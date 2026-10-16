// ============================================================
// RBAC – DMC eQMS (nguồn sự thật về permission, module.action)
// Tham chiếu: docs/requirements.md §3 – Ma trận quyền
// ============================================================

export const PERMISSIONS = [
  'dashboard.view',
  'master_plan.view',
  'master_plan.create',
  'master_plan.update',
  'master_plan.assign',
  'master_plan.close',
  'master_plan.delete',
  'document.view',
  'document.create',
  'document.update',
  'document.delete',
  'document.submit',
  'document.review',
  'document.approve',
  'document.publish',
  'action.view',
  'action.create',
  'action.update',
  'action.verify',
  'action.close',
  'action.delete',
  'risk.view',
  'risk.create',
  'risk.update',
  'risk.evaluate',
  'risk.close',
  'risk.delete',
  'opportunity.view',
  'opportunity.create',
  'opportunity.update',
  'opportunity.evaluate',
  'opportunity.close',
  'opportunity.delete',
  'user.view',
  'user.create',
  'user.update',
  'role.view',
  'role.manage',
  'department.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_CODES = [
  'super_admin',
  'iso_leader',
  'iso_deputy',
  'iso_member',
  'iso_coordinator',
  'dept_manager',
  'document_owner',
  'auditor',
  'normal_user',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_NAMES: Record<RoleCode, string> = {
  super_admin: 'System Admin',
  iso_leader: 'ISO Committee Leader',
  iso_deputy: 'ISO Committee Deputy',
  iso_member: 'ISO Committee Member',
  iso_coordinator: 'ISO Coordinator',
  dept_manager: 'Department Manager',
  document_owner: 'Document Owner',
  auditor: 'Auditor',
  normal_user: 'Normal User',
};

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  super_admin: ALL,
  iso_leader: [
    'dashboard.view',
    'master_plan.view', 'master_plan.create', 'master_plan.update', 'master_plan.assign', 'master_plan.close', 'master_plan.delete',
    'document.view', 'document.create', 'document.update', 'document.delete', 'document.review', 'document.approve', 'document.publish',
    'action.view', 'action.create', 'action.update', 'action.verify', 'action.close', 'action.delete',
    'risk.view', 'risk.create', 'risk.update', 'risk.evaluate', 'risk.close', 'risk.delete',
    'opportunity.view', 'opportunity.create', 'opportunity.update', 'opportunity.evaluate', 'opportunity.close', 'opportunity.delete',
    'department.view',
  ],
  iso_deputy: [
    'dashboard.view',
    'master_plan.view', 'master_plan.create', 'master_plan.update', 'master_plan.assign', 'master_plan.close', 'master_plan.delete',
    'document.view', 'document.create', 'document.update', 'document.delete', 'document.submit', 'document.review',
    'action.view', 'action.create', 'action.update', 'action.verify', 'action.delete',
    'risk.view', 'risk.create', 'risk.update', 'risk.evaluate', 'risk.delete',
    'opportunity.view', 'opportunity.create', 'opportunity.update', 'opportunity.evaluate', 'opportunity.delete',
    'department.view',
  ],
  iso_member: [
    'dashboard.view',
    'master_plan.view', 'master_plan.create', 'master_plan.update',
    'document.view', 'document.create', 'document.update', 'document.submit', 'document.review',
    'action.view', 'action.create', 'action.update',
    'risk.view', 'risk.create', 'risk.update', 'risk.evaluate',
    'opportunity.view', 'opportunity.create', 'opportunity.update', 'opportunity.evaluate',
    'department.view',
  ],
  iso_coordinator: [
    'dashboard.view',
    'master_plan.view', 'master_plan.create', 'master_plan.update',
    'document.view', 'document.create', 'document.update',
    'action.view', 'action.create', 'action.update', 'action.verify',
    'risk.view', 'risk.create', 'risk.update',
    'opportunity.view', 'opportunity.create', 'opportunity.update',
    'department.view',
  ],
  dept_manager: [
    'dashboard.view',
    'master_plan.view',
    'document.view', 'document.review', 'document.approve',
    'action.view', 'action.update',
    'risk.view', 'risk.update', 'risk.close',
    'opportunity.view', 'opportunity.update', 'opportunity.close',
    'department.view',
  ],
  document_owner: [
    'dashboard.view',
    'master_plan.view', 'master_plan.create', 'master_plan.update',
    'document.view', 'document.create', 'document.update', 'document.submit',
    'action.view', 'action.create', 'action.update',
    'risk.view', 'risk.create', 'risk.update',
    'opportunity.view', 'opportunity.create', 'opportunity.update',
    'department.view',
  ],
  auditor: [
    'dashboard.view',
    'master_plan.view',
    'document.view',
    'action.view', 'action.create',
    'risk.view',
    'opportunity.view',
    'department.view',
  ],
  normal_user: [
    'dashboard.view',
    'document.view',
    'action.view', 'action.update',
    'risk.view',
    'opportunity.view',
    'department.view',
  ],
};

/** User nhiều role → quyền = hợp của các role */
export function permissionsOf(roleCodes: RoleCode[]): Permission[] {
  const set = new Set<Permission>();
  for (const code of roleCodes) {
    for (const p of ROLE_PERMISSIONS[code] ?? []) set.add(p);
  }
  return [...set];
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
