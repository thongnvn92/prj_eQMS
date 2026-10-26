<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolesAndPermissionsSeeder extends Seeder
{
    /** Ma trận quyền chuẩn 29 quyền MVP (khớp frontend/src/auth/permissions.ts) */
    private const ROLE_PERMISSIONS = [
        'iso_leader' => [
            'dashboard.view',
            'master_plan.view', 'master_plan.create', 'master_plan.update', 'master_plan.assign', 'master_plan.close', 'master_plan.delete',
            'document.view', 'document.create', 'document.update', 'document.delete', 'document.review', 'document.approve', 'document.publish',
            'action.view', 'action.create', 'action.update', 'action.verify', 'action.close', 'action.delete',
            'risk.view', 'risk.create', 'risk.update', 'risk.evaluate', 'risk.close', 'risk.delete',
            'opportunity.view', 'opportunity.create', 'opportunity.update', 'opportunity.evaluate', 'opportunity.close', 'opportunity.delete',
            'department.view', 'department.manage',
        ],
        'iso_deputy' => [
            'dashboard.view',
            'master_plan.view', 'master_plan.create', 'master_plan.update', 'master_plan.assign', 'master_plan.close', 'master_plan.delete',
            'document.view', 'document.create', 'document.update', 'document.delete', 'document.submit', 'document.review',
            'action.view', 'action.create', 'action.update', 'action.verify', 'action.delete',
            'risk.view', 'risk.create', 'risk.update', 'risk.evaluate', 'risk.delete',
            'opportunity.view', 'opportunity.create', 'opportunity.update', 'opportunity.evaluate', 'opportunity.delete',
            'department.view',
        ],
        'iso_member' => [
            'dashboard.view',
            'master_plan.view', 'master_plan.create', 'master_plan.update',
            'document.view', 'document.create', 'document.update', 'document.submit', 'document.review',
            'action.view', 'action.create', 'action.update',
            'risk.view', 'risk.create', 'risk.update', 'risk.evaluate',
            'opportunity.view', 'opportunity.create', 'opportunity.update', 'opportunity.evaluate',
            'department.view',
        ],
        'iso_coordinator' => [
            'dashboard.view',
            'master_plan.view', 'master_plan.create', 'master_plan.update',
            'document.view', 'document.create', 'document.update',
            'action.view', 'action.create', 'action.update', 'action.verify',
            'risk.view', 'risk.create', 'risk.update',
            'opportunity.view', 'opportunity.create', 'opportunity.update',
            'department.view',
        ],
        'dept_manager' => [
            'dashboard.view',
            'master_plan.view',
            'document.view', 'document.review', 'document.approve',
            'action.view', 'action.update',
            'risk.view', 'risk.update', 'risk.close',
            'opportunity.view', 'opportunity.update', 'opportunity.close',
            'department.view',
        ],
        'document_owner' => [
            'dashboard.view',
            'master_plan.view', 'master_plan.create', 'master_plan.update',
            'document.view', 'document.create', 'document.update', 'document.submit',
            'action.view', 'action.create', 'action.update',
            'risk.view', 'risk.create', 'risk.update',
            'opportunity.view', 'opportunity.create', 'opportunity.update',
            'department.view',
        ],
        'auditor' => [
            'dashboard.view',
            'master_plan.view',
            'document.view',
            'action.view', 'action.create',
            'risk.view',
            'opportunity.view',
            'department.view',
        ],
        'normal_user' => [
            'dashboard.view',
            'document.view',
            'action.view', 'action.update',
            'risk.view',
            'opportunity.view',
            'department.view',
        ],
    ];

    public function run(): void
    {
        $roles = [
            ['code' => 'super_admin', 'name' => 'System Admin', 'description' => 'Toàn quyền hệ thống'],
            ['code' => 'iso_leader', 'name' => 'ISO Committee Leader', 'description' => 'Chỉ đạo, approve'],
            ['code' => 'iso_deputy', 'name' => 'ISO Committee Deputy', 'description' => 'Điều phối Master Plan'],
            ['code' => 'iso_member', 'name' => 'ISO Committee Member', 'description' => 'Đại diện phòng, rà soát'],
            ['code' => 'iso_coordinator', 'name' => 'ISO Coordinator', 'description' => 'Cập nhật tiến độ'],
            ['code' => 'dept_manager', 'name' => 'Department Manager', 'description' => 'Review/approve trong phạm vi phòng'],
            ['code' => 'document_owner', 'name' => 'Document Owner', 'description' => 'Soạn thảo, cập nhật tài liệu'],
            ['code' => 'auditor', 'name' => 'Auditor', 'description' => 'Audit, tạo Action'],
            ['code' => 'normal_user', 'name' => 'Normal User', 'description' => 'Xem + thực hiện Action được giao'],
        ];

        foreach ($roles as $role) {
            Role::updateOrCreate(['code' => $role['code']], $role);
        }

        $moduleAction = [
            'dashboard.view',
            'master_plan.view', 'master_plan.create', 'master_plan.update', 'master_plan.assign', 'master_plan.close', 'master_plan.delete',
            'document.view', 'document.create', 'document.update', 'document.delete', 'document.submit', 'document.review', 'document.approve', 'document.publish',
            'action.view', 'action.create', 'action.update', 'action.verify', 'action.close', 'action.delete',
            'risk.view', 'risk.create', 'risk.update', 'risk.evaluate', 'risk.close', 'risk.delete',
            'opportunity.view', 'opportunity.create', 'opportunity.update', 'opportunity.evaluate', 'opportunity.close', 'opportunity.delete',
            'issue.create',
            'user.view', 'user.create', 'user.update',
            'role.view', 'role.manage',
            'department.view', 'department.manage',
            'document_status.manage',
        ];

        foreach ($moduleAction as $code) {
            [$module, $action] = explode('.', $code);
            Permission::updateOrCreate(
                ['code' => $code],
                ['module' => $module, 'action' => $action, 'description' => "Quyền {$code}"]
            );
        }

        // Gán ma trận quyền chuẩn cho từng role (super_admin = tất cả)
        $allPermissions = Permission::pluck('id', 'code');
        foreach (Role::all() as $role) {
            if ($role->code === 'super_admin') {
                $role->permissions()->sync($allPermissions->values()->all());
            } else {
                $codes = self::ROLE_PERMISSIONS[$role->code] ?? [];
                $role->permissions()->sync(
                    $allPermissions->only($codes)->values()->all()
                );
            }
        }
    }
}
