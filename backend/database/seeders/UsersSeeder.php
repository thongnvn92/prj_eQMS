<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class UsersSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            ['username' => 'admin', 'full_name' => 'Nguyễn Minh Admin', 'email' => 'admin@dmc.vn', 'department_id' => 1, 'role_codes' => ['super_admin'], 'active' => true, 'password' => 'Admin123!'],
            ['username' => 'leader', 'full_name' => 'Trần Văn Long', 'email' => 'long.tv@dmc.vn', 'department_id' => 2, 'role_codes' => ['iso_leader'], 'active' => true, 'password' => 'Leader123!'],
            ['username' => 'deputy', 'full_name' => 'Lê Thị Hoa', 'email' => 'hoa.lt@dmc.vn', 'department_id' => 2, 'role_codes' => ['iso_deputy'], 'active' => true, 'password' => 'Deputy123!'],
            ['username' => 'coordinator', 'full_name' => 'Phạm Văn Nam', 'email' => 'nam.pv@dmc.vn', 'department_id' => 2, 'role_codes' => ['iso_coordinator'], 'active' => true, 'password' => 'Coord123!'],
            ['username' => 'member', 'full_name' => 'Đỗ Thị Lan', 'email' => 'lan.dt@dmc.vn', 'department_id' => 2, 'role_codes' => ['iso_member'], 'active' => true, 'password' => 'Member123!'],
            ['username' => 'owner', 'full_name' => 'Hoàng Thị Mai', 'email' => 'mai.ht@dmc.vn', 'department_id' => 3, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Owner123!'],
            ['username' => 'manager', 'full_name' => 'Vũ Văn Trung', 'email' => 'trung.vv@dmc.vn', 'department_id' => 5, 'role_codes' => ['dept_manager'], 'active' => true, 'password' => 'Manager123!'],
            ['username' => 'auditor', 'full_name' => 'Đặng Văn Phúc', 'email' => 'phuc.dv@dmc.vn', 'department_id' => 2, 'role_codes' => ['auditor'], 'active' => true, 'password' => 'Audit123!'],
            ['username' => 'user', 'full_name' => 'Nguyễn Văn Hùng', 'email' => 'hung.nv@dmc.vn', 'department_id' => 4, 'role_codes' => ['normal_user'], 'active' => true, 'password' => 'User123!'],
            // Người biên soạn theo bảng theo dõi tài liệu ISO (Ban ISO Q4/2026–Q4/2027).
            ['username' => 'chauloan', 'full_name' => 'Châu Loan', 'email' => 'loan.chau@dmc.vn', 'department_id' => 2, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'phamhanh', 'full_name' => 'Phạm Hạnh', 'email' => 'hanh.ph@dmc.vn', 'department_id' => 3, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'minhhang', 'full_name' => 'Minh Hằng', 'email' => 'hang.minh@dmc.vn', 'department_id' => 3, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'myhuong', 'full_name' => 'Mỹ Hương', 'email' => 'huong.my@dmc.vn', 'department_id' => 3, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'hongthom', 'full_name' => 'Hồng Thơm', 'email' => 'thom.hong@dmc.vn', 'department_id' => 3, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'khaihoang', 'full_name' => 'Khải Hoàng', 'email' => 'hoang.khai@dmc.vn', 'department_id' => 4, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'thaibinh', 'full_name' => 'Thái Bình', 'email' => 'binh.thai@dmc.vn', 'department_id' => 4, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'minhtuan', 'full_name' => 'Minh Tuân', 'email' => 'tuan.minh@dmc.vn', 'department_id' => 4, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'thuytrang', 'full_name' => 'Thùy Trang', 'email' => 'trang.thuy@dmc.vn', 'department_id' => 7, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'thuthuy', 'full_name' => 'Thu Thủy', 'email' => 'thuy.thu@dmc.vn', 'department_id' => 7, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'tanve', 'full_name' => 'Tấn Vệ', 'email' => 've.tan@dmc.vn', 'department_id' => 8, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
            ['username' => 'hoanghuy', 'full_name' => 'Hoàng Huy', 'email' => 'huy.hoang@dmc.vn', 'department_id' => 8, 'role_codes' => ['document_owner'], 'active' => true, 'password' => 'Eqms123!'],
        ];

        foreach ($users as $u) {
            $user = User::updateOrCreate(
                ['username' => $u['username']],
                [
                    'full_name' => $u['full_name'], 'email' => $u['email'],
                    'department_id' => $u['department_id'], 'is_active' => $u['active'],
                    'password' => $u['password'], 'last_login_at' => null,
                ],
            );
            $user->roles()->sync(
                Role::whereIn('code', $u['role_codes'])->pluck('id')->toArray(),
                false
            );
        }
    }
}
