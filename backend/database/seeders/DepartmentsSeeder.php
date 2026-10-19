<?php

namespace Database\Seeders;

use App\Models\Department;
use Illuminate\Database\Seeder;

class DepartmentsSeeder extends Seeder
{
    public function run(): void
    {
        $depts = [
            ['code' => 'BM01', 'name' => 'Ban Giám đốc', 'description' => 'Ban Giám đốc công ty', 'is_active' => true],
            ['code' => 'BM02', 'name' => 'Ban ISO', 'description' => 'Ban phối hợp ISO 9001', 'is_active' => true],
            ['code' => 'BM03', 'name' => 'Phòng Hành chính – Nhân sự', 'description' => 'Hành chính – Nhân sự', 'is_active' => true],
            ['code' => 'BM04', 'name' => 'Phòng Kinh doanh', 'description' => 'Kinh doanh – Khách hàng', 'is_active' => true],
            ['code' => 'BM05', 'name' => 'Phòng Kỹ thuật – Đảm bảo chất lượng', 'description' => 'Kỹ thuật + QA', 'is_active' => true],
            ['code' => 'BM06', 'name' => 'Phòng Sản xuất', 'description' => 'Sản xuất – Thương mại', 'is_active' => true],
            // Phòng phụ trách theo bảng theo dõi tài liệu ISO (Q4/2026–Q4/2027).
            ['code' => 'BM07', 'name' => 'Phòng Tài chính – Kế toán', 'description' => 'Tài chính – Kế toán (TCKT)', 'is_active' => true],
            ['code' => 'BM08', 'name' => 'Phòng Kỹ thuật – Sản xuất', 'description' => 'Kỹ thuật – Sản xuất (KTSX)', 'is_active' => true],
        ];

        foreach ($depts as $d) {
            Department::updateOrCreate(['code' => $d['code']], $d);
        }
    }
}
