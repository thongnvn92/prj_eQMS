<?php

namespace Database\Seeders;

use App\Models\MasterPlan;
use Illuminate\Database\Seeder;

class DemoRunnerSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolesAndPermissionsSeeder::class,
            DepartmentsSeeder::class,
            UsersSeeder::class,
        ]);

        $masterPlan = MasterPlan::updateOrCreate(
            ['cycle_label' => 'T10/2026–T12/2027'],
            [
                'code' => 'MP-2026',
                'name' => 'Kế hoạch ISO T10/2026 – T12/2027',
                'cycle_label' => 'T10/2026–T12/2027',
                'start_date' => '2026-09-01',
                'end_date' => '2027-12-31',
                'status' => 'in_progress',
                'created_by' => 1,
            ],
        );

        $this->call(MasterPlanSeeder::class);
        $this->call(DocumentsSeeder::class);
        $this->call(ActionsSeeder::class);
        // CR-RISK-OPPORTUNITY-001: demo Risk & Opportunity (idempotent).
        $this->call(RiskOpportunitySeeder::class);
    }
}
