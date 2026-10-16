<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Action;
use App\Models\Department;
use App\Models\Opportunity;
use App\Models\Risk;
use App\Support\Helpers;
use App\Support\RiskSupport;
use Illuminate\Http\JsonResponse;

/**
 * Dashboard Rủi ro & Cơ hội – tổng hợp KPI, biểu đồ, ma trận 5×5.
 * Đọc data aggregate, không log (chỉ GET).
 */
class RiskDashboardController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $risks = Risk::all();
        $opps = Opportunity::all();
        $linkedActions = Action::whereNotNull('related_risk_id')
            ->orWhereNotNull('related_opportunity_id')
            ->get();

        return response()->json([
            'riskTotal' => $risks->count(),
            'riskHigh' => $risks->where('risk_level', 'high')->count(),
            'riskMedium' => $risks->where('risk_level', 'medium')->count(),
            'riskLow' => $risks->where('risk_level', 'low')->count(),
            'riskReviewOverdue' => $risks->filter(fn ($r) => RiskSupport::reviewStatus($r->next_review_date?->format('Y-m-d'), $r->status) === 'overdue')->count(),
            'riskReviewDueSoon' => $risks->filter(fn ($r) => RiskSupport::reviewStatus($r->next_review_date?->format('Y-m-d'), $r->status) === 'due_soon')->count(),
            'riskByLevel' => Helpers::countByStatuses($risks, 'risk_level', ['high', 'medium', 'low']),
            'riskByStatus' => Helpers::countByStatuses($risks, 'status', ['open', 'in_progress', 'closed']),
            'riskByDepartment' => $this->byDepartment($risks),
            'riskMatrix' => $this->riskMatrix($risks),

            'opportunityTotal' => $opps->count(),
            'opportunityPriority' => $opps->where('opportunity_level', 'priority')->count(),
            'opportunityResearch' => $opps->where('opportunity_level', 'research')->count(),
            'opportunityIgnore' => $opps->where('opportunity_level', 'ignore')->count(),
            'opportunityReviewOverdue' => $opps->filter(fn ($o) => RiskSupport::reviewStatus($o->next_review_date?->format('Y-m-d'), $o->status) === 'overdue')->count(),
            'opportunityReviewDueSoon' => $opps->filter(fn ($o) => RiskSupport::reviewStatus($o->next_review_date?->format('Y-m-d'), $o->status) === 'due_soon')->count(),
            'opportunityByLevel' => Helpers::countByStatuses($opps, 'opportunity_level', ['priority', 'research', 'ignore']),
            'opportunityByStatus' => Helpers::countByStatuses($opps, 'status', ['open', 'in_progress', 'closed']),
            'opportunityByDepartment' => $this->byDepartment($opps),

            'actionSummary' => $this->actionSummary($linkedActions),
        ]);
    }

    /** Thống kê theo phòng ban – mảng { departmentId, name, count }. */
    private function byDepartment($items): array
    {
        $depts = Department::pluck('name', 'id');
        $counts = $items->groupBy('department_id');

        $out = [];
        foreach ($counts as $deptId => $group) {
            $out[] = [
                'departmentId' => (int) $deptId,
                'name' => $depts[$deptId] ?? 'Không phân bổ',
                'count' => $group->count(),
            ];
        }
        usort($out, fn ($a, $b) => $b['count'] <=> $a['count']);

        return $out;
    }

    /** Ma trận 5×5 – đủ 25 ô (count=0 nếu trống) để FE render không phải lấp. */
    private function riskMatrix($risks): array
    {
        $cells = [];
        for ($likelihood = 1; $likelihood <= 5; $likelihood++) {
            for ($impact = 1; $impact <= 5; $impact++) {
                $score = $likelihood * $impact;
                $cells[] = [
                    'likelihood' => $likelihood,
                    'impact' => $impact,
                    'score' => $score,
                    'level' => RiskSupport::riskLevel($score)->value,
                    'count' => $risks->where('likelihood', $likelihood)->where('impact', $impact)->count(),
                ];
            }
        }

        return $cells;
    }

    /** Action liên kết Risk/Opportunity: open / inProgress / overdue / closed. */
    private function actionSummary($actions): array
    {
        $today = now()->format('Y-m-d');
        $overdue = $actions->filter(fn ($a) => $a->status === 'overdue'
            || ($a->due_date && $a->due_date->format('Y-m-d') < $today
                && ! in_array($a->status, ['closed', 'verified'], true)))->count();

        return [
            'open' => $actions->where('status', 'open')->count(),
            'inProgress' => $actions->where('status', 'in_progress')->count(),
            'overdue' => $overdue,
            'closed' => $actions->where('status', 'closed')->count(),
        ];
    }
}
