<?php

namespace Tests\Feature;

use App\Models\Action;
use App\Models\ActivityLog;
use App\Models\Opportunity;
use App\Models\Risk;
use App\Models\RiskAssessment;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CR-RISK-OPPORTUNITY-001 – Business rules QT-BISO.03-BM.02/03:
 * Risk Score = Likelihood × Impact (1–4 low, 5–10 medium, >=12 high),
 * Opportunity Score = Feasibility × Benefit (1–4 ignore, 5–10 research, >=12 priority),
 * backend authoritative (không tin score client), residual không overwrite initial.
 * Bọc transaction + rollback – không làm bẩn DB dev.
 */
class RiskOpportunityTest extends TestCase
{
    private function tx(callable $fn): void
    {
        DB::beginTransaction();
        try {
            $fn();
        } finally {
            DB::rollBack();
        }
    }

    private function authAs(string $username, string $password): array
    {
        $response = $this->postJson('/api/login', [
            'username' => $username,
            'password' => $password,
        ]);
        $response->assertOk();

        return [
            'Authorization' => 'Bearer '.$response->json('token'),
            'Accept' => 'application/json',
        ];
    }

    private function riskPayload(array $override = []): array
    {
        return array_merge([
            'code' => 'RISK-T1',
            'sourceType' => 'internal',
            'category' => 'human',
            'objective' => 'Test rủi ro đào tạo',
            'description' => 'Mô tả rủi ro dùng cho test.',
            'likelihood' => 5,
            'impact' => 3,
            'treatment' => 'Đào tạo định kỳ.',
            'expectedResult' => '100% hoàn tất đào tạo.',
            'ownerId' => 3,
            'departmentId' => 2,
            'reviewFrequency' => 'monthly',
            'nextReviewDate' => '2026-12-01',
        ], $override);
    }

    public function test_create_risk_computes_score_level_and_initial_snapshot(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');

            $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload())
                ->assertStatus(201)
                ->assertJsonPath('likelihood', 5)
                ->assertJsonPath('impact', 3)
                ->assertJsonPath('riskScore', 15)
                ->assertJsonPath('riskLevel', 'high')
                ->assertJsonPath('initialLikelihood', 5)
                ->assertJsonPath('initialImpact', 3)
                ->assertJsonPath('initialScore', 15)
                ->assertJsonPath('initialLevel', 'high')
                ->assertJsonPath('status', 'open');

            $risk = Risk::where('code', 'RISK-T1')->firstOrFail();
            $this->assertSame(15, (int) $risk->risk_score);
            $this->assertSame('high', $risk->risk_level);
            $this->assertSame('initial', RiskAssessment::where('risk_id', $risk->id)->first()->kind);
            $this->assertSame('create', ActivityLog::where('entity', 'risk')->where('entity_id', $risk->id)->first()->action);
        });
    }

    public function test_client_cannot_override_score(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');

            // Gửi kèm riskScore/riskLevel sai – backend KHÔNG lưu (AC-17).
            $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload([
                'code' => 'RISK-T2', 'riskScore' => 1, 'riskLevel' => 'low',
            ]))
                ->assertStatus(201)
                ->assertJsonPath('riskScore', 15)
                ->assertJsonPath('riskLevel', 'high');
        });
    }

    public function test_classification_thresholds_low_medium_high(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');
            $cases = [
                [2, 2, 4, 'low'],
                [3, 2, 6, 'medium'],
                [3, 3, 9, 'medium'],
                [4, 3, 12, 'high'],
                [1, 1, 1, 'low'],
            ];
            foreach ($cases as $i => [$l, $imp, $score, $level]) {
                $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload([
                    'code' => 'RISK-CLS-'.$i, 'likelihood' => $l, 'impact' => $imp,
                ]))
                    ->assertStatus(201)
                    ->assertJsonPath('riskScore', $score)
                    ->assertJsonPath('riskLevel', $level);
            }
        });
    }

    // ===================== VALIDATION 422 =====================

    public function test_invalid_likelihood_or_impact_422(): void
    {
        $headers = $this->authAs('leader', 'Leader123!');

        foreach ([0, 6] as $bad) {
            $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload(['code' => 'RISK-V'.$bad, 'likelihood' => $bad]))
                ->assertStatus(422);
        }
        $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload(['code' => 'RISK-VIMP', 'impact' => 9]))
            ->assertStatus(422);
        $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload(['code' => 'RISK-VCAT', 'category' => 'khong_ton_tai']))
            ->assertStatus(422);
    }

    public function test_unauthenticated_401(): void
    {
        $this->postJson('/api/risks', $this->riskPayload())->assertStatus(401);
        $this->getJson('/api/risks')->assertStatus(401);
        $this->getJson('/api/risk-dashboard')->assertStatus(401);
        $this->getJson('/api/opportunities')->assertStatus(401);
    }

    // ===================== RBAC =====================

    public function test_normal_user_can_view_but_not_create_403(): void
    {
        $headers = $this->authAs('user', 'User123!');

        $this->withHeaders($headers)->getJson('/api/risks')->assertOk();
        $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload(['code' => 'RISK-403']))
            ->assertStatus(403);
    }

    public function test_coordinator_cannot_evaluate_403(): void
    {
        $headers = $this->authAs('coordinator', 'Coord123!');
        $riskId = Risk::where('code', 'RISK-002')->first()->id;

        // iso_coordinator không có risk.evaluate → middleware 403.
        $this->withHeaders($headers)->postJson("/api/risks/{$riskId}/evaluate", ['likelihood' => 1, 'impact' => 1])
            ->assertStatus(403);
    }

    // ===================== UPDATE / CLOSE / SCOPE =====================

    public function test_member_cannot_close_risk_403(): void
    {
        $this->tx(function () {
            $riskId = Risk::where('code', 'RISK-002')->first()->id;

            // iso_member có risk.update nhưng không có risk.close → 403 (controller).
            $member = $this->authAs('member', 'Member123!');
            $this->withHeaders($member)->patchJson("/api/risks/{$riskId}", ['status' => 'closed'])
                ->assertStatus(403);
        });
    }

    public function test_leader_close_risk_and_log_status_change(): void
    {
        $this->tx(function () {
            $riskId = Risk::where('code', 'RISK-002')->first()->id;

            // iso_leader có risk.close → 200 + log status_change.
            $leader = $this->authAs('leader', 'Leader123!');
            $this->withHeaders($leader)->patchJson("/api/risks/{$riskId}", ['status' => 'closed'])
                ->assertOk()
                ->assertJsonPath('status', 'closed');

            $this->assertSame('status_change', ActivityLog::where('entity', 'risk')
                ->where('entity_id', $riskId)->where('action', 'status_change')->first()->action);
        });
    }

    public function test_update_does_not_change_assessment(): void
    {
        $this->tx(function () {
            $riskId = Risk::where('code', 'RISK-002')->first()->id;
            $headers = $this->authAs('leader', 'Leader123!');

            // Gửi kèm likelihood – KHÔNG được đổi điểm đánh giá qua update.
            $this->withHeaders($headers)->patchJson("/api/risks/{$riskId}", [
                'treatment' => 'Cập nhật biện pháp xử lý.',
                'likelihood' => 1, 'impact' => 1,
            ])
                ->assertOk()
                ->assertJsonPath('likelihood', 3)
                ->assertJsonPath('impact', 2)
                ->assertJsonPath('riskScore', 6);

            $this->assertSame('Cập nhật biện pháp xử lý.', Risk::find($riskId)->treatment);
        });
    }

    public function test_dept_manager_scope(): void
    {
        $this->tx(function () {
            $manager = $this->authAs('manager', 'Manager123!'); // dept 5

            // Chỉ thấy Risk trong phòng mình (RISK-003 thuộc dept 5).
            $resp = $this->withHeaders($manager)->getJson('/api/risks')->assertOk();
            $deptIds = array_unique(array_column($resp->json(), 'departmentId'));
            $this->assertSame([5], $deptIds);

            // Không đụng được Risk của phòng khác → 403.
            $otherId = Risk::where('code', 'RISK-002')->first()->id; // dept 3
            $this->withHeaders($manager)->patchJson("/api/risks/{$otherId}", ['treatment' => 'x'])
                ->assertStatus(403);

            // Rủi ro của phòng mình thì cập nhật được.
            $ownId = Risk::where('code', 'RISK-003')->first()->id;
            $this->withHeaders($manager)->patchJson("/api/risks/{$ownId}", ['status' => 'in_progress'])
                ->assertOk()
                ->assertJsonPath('status', 'in_progress');
        });
    }

    // ===================== RESIDUAL / HISTORY =====================

    public function test_evaluate_preserves_initial_and_appends_history(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');
            $created = $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload())->json();
            $id = $created['id'];

            // Đánh giá lại: 5×3=15 high → 2×2=4 low. Initial KHÔNG đổi (AC-08).
            $this->withHeaders($headers)->postJson("/api/risks/{$id}/evaluate", [
                'likelihood' => 2, 'impact' => 2, 'comment' => 'Đã đào tạo xong.',
            ])
                ->assertOk()
                ->assertJsonPath('likelihood', 2)
                ->assertJsonPath('impact', 2)
                ->assertJsonPath('riskScore', 4)
                ->assertJsonPath('riskLevel', 'low')
                ->assertJsonPath('initialLikelihood', 5)
                ->assertJsonPath('initialImpact', 3)
                ->assertJsonPath('initialScore', 15)
                ->assertJsonPath('initialLevel', 'high');

            // Lịch sử: initial + residual.
            $history = $this->withHeaders($headers)->getJson("/api/risks/{$id}/history")->assertOk()->json();
            $this->assertCount(2, $history);
            $this->assertSame(['initial', 'residual'], array_column($history, 'kind'));

            // Log evaluate ghi old→new score.
            $log = ActivityLog::where('entity', 'risk')->where('entity_id', $id)
                ->where('action', 'evaluate')->first();
            $this->assertSame('15', $log->old_status);
            $this->assertSame('4', $log->new_status);
        });
    }

    public function test_evaluate_invalid_422(): void
    {
        $headers = $this->authAs('leader', 'Leader123!');
        $riskId = Risk::where('code', 'RISK-002')->first()->id;

        $this->withHeaders($headers)->postJson("/api/risks/{$riskId}/evaluate", ['likelihood' => 0, 'impact' => 2])
            ->assertStatus(422);
        $this->withHeaders($headers)->postJson("/api/risks/{$riskId}/evaluate", ['likelihood' => 2])
            ->assertStatus(422);
    }

    // ===================== ACTION INTEGRATION =====================

    public function test_action_link_risk_auto_source_and_detail(): void
    {
        $this->tx(function () {
            $leader = $this->authAs('leader', 'Leader123!');
            $riskId = Risk::where('code', 'RISK-004')->first()->id;

            // 1 Risk → N Actions: tạo Action kèm relatedRiskId, source tự đồng bộ = risk.
            $this->withHeaders($leader)->postJson('/api/actions', [
                'code' => 'ACT-TLINK', 'title' => 'Theo dõi nghị định mới', 'source' => 'other',
                'relatedRiskId' => $riskId, 'dueDate' => '2026-12-15',
            ])
                ->assertStatus(201)
                ->assertJsonPath('source', 'risk')
                ->assertJsonPath('relatedRiskId', $riskId);

            // Risk detail phản ánh Action liên kết.
            $detail = $this->withHeaders($leader)->getJson("/api/risks/{$riskId}")->assertOk()->json();
            $this->assertContains('ACT-TLINK', array_column($detail['actions'], 'code'));
            $this->assertSame(1, $detail['actionCount']);

            // Log link_action ghi trên entity risk.
            $this->assertSame(1, ActivityLog::where('entity', 'risk')->where('entity_id', $riskId)
                ->where('action', 'link_action')->count());

            // Unlink → log unlink_action.
            $act = Action::where('code', 'ACT-TLINK')->first();
            $this->withHeaders($leader)->patchJson("/api/actions/{$act->id}", ['relatedRiskId' => null])
                ->assertOk()
                ->assertJsonPath('relatedRiskId', null);
            $this->assertSame(1, ActivityLog::where('entity', 'risk')->where('entity_id', $riskId)
                ->where('action', 'unlink_action')->count());
        });
    }

    public function test_risk_dashboard_aggregates(): void
    {
        $leader = $this->authAs('leader', 'Leader123!');
        $data = $this->withHeaders($leader)->getJson('/api/risk-dashboard')->assertOk()->json();

        $this->assertGreaterThanOrEqual(6, $data['riskTotal']);
        $this->assertGreaterThanOrEqual(5, $data['opportunityTotal']);
        $this->assertCount(25, $data['riskMatrix']);
        $this->assertSame(['open', 'inProgress', 'overdue', 'closed'], array_keys($data['actionSummary']));
        $this->assertSame(['high', 'medium', 'low'], array_column($data['riskByLevel'], 'status'));
        // RISK-001 review quá hạn (2026-09-30) → overdue đếm được.
        $this->assertGreaterThanOrEqual(1, $data['riskReviewOverdue']);
    }

    public function test_risk_dashboard_auditor_view_only_ok(): void
    {
        // Auditor chỉ có risk.view vẫn xem được dashboard.
        $this->withHeaders($this->authAs('auditor', 'Audit123!'))->getJson('/api/risk-dashboard')->assertOk();
    }

    public function test_member_cannot_delete_risk_403(): void
    {
        $this->tx(function () {
            $id = Risk::where('code', 'RISK-002')->first()->id;

            // iso_member không có risk.delete → 403.
            $this->withHeaders($this->authAs('member', 'Member123!'))->deleteJson("/api/risks/{$id}")
                ->assertStatus(403);
        });
    }

    public function test_leader_delete_risk_and_log(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');
            $id = $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload(['code' => 'RISK-DEL']))->json('id');

            $this->withHeaders($headers)->deleteJson("/api/risks/{$id}")->assertOk();
            $this->assertSame('delete', ActivityLog::where('entity', 'risk')->where('entity_id', $id)
                ->where('action', 'delete')->first()->action);
        });
    }

    // ===================== OPPORTUNITY =====================

    public function test_opportunity_score_and_classification(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');
            $base = [
                'sourceType' => 'internal', 'category' => 'process', 'objective' => 'Test cơ hội',
                'solution' => 'Giải pháp', 'ownerId' => 1, 'departmentId' => 1,
            ];
            $cases = [
                ['OPP-T1', 4, 3, 12, 'priority'],
                ['OPP-T2', 2, 2, 4, 'ignore'],
                ['OPP-T3', 3, 2, 6, 'research'],
                ['OPP-T4', 5, 5, 25, 'priority'],
            ];
            foreach ($cases as [$code, $f, $b, $score, $level]) {
                $this->withHeaders($headers)->postJson('/api/opportunities', array_merge($base, [
                    'code' => $code, 'feasibility' => $f, 'benefit' => $b,
                ]))
                    ->assertStatus(201)
                    ->assertJsonPath('opportunityScore', $score)
                    ->assertJsonPath('opportunityLevel', $level);
            }
        });
    }

    public function test_opportunity_validation_422(): void
    {
        $headers = $this->authAs('leader', 'Leader123!');
        $base = ['sourceType' => 'internal', 'objective' => 'x', 'feasibility' => 3, 'benefit' => 3];

        $this->withHeaders($headers)->postJson('/api/opportunities', array_merge($base, ['code' => 'OPP-V1', 'feasibility' => 0]))
            ->assertStatus(422);
        $this->withHeaders($headers)->postJson('/api/opportunities', array_merge($base, ['code' => 'OPP-V2', 'benefit' => 6]))
            ->assertStatus(422);
    }

    public function test_normal_user_opportunity_view_only_403(): void
    {
        // normal_user chỉ có opportunity.view → xem OK, tạo 403 (middleware).
        $user = $this->authAs('user', 'User123!');
        $this->withHeaders($user)->getJson('/api/opportunities')->assertOk();
        $this->withHeaders($user)->postJson('/api/opportunities', [
            'code' => 'OPP-V3', 'sourceType' => 'internal', 'objective' => 'x', 'feasibility' => 3, 'benefit' => 3,
        ])->assertStatus(403);
    }

    public function test_member_evaluate_opportunity_and_cannot_close(): void
    {
        $this->tx(function () {
            $oppId = Opportunity::where('code', 'OPP-002')->first()->id;
            $member = $this->authAs('member', 'Member123!');

            // iso_member có opportunity.evaluate.
            $this->withHeaders($member)->postJson("/api/opportunities/{$oppId}/evaluate", [
                'feasibility' => 5, 'benefit' => 5,
            ])
                ->assertOk()
                ->assertJsonPath('opportunityScore', 25)
                ->assertJsonPath('opportunityLevel', 'priority');

            // iso_member không có opportunity.close → 403.
            $this->withHeaders($member)->patchJson("/api/opportunities/{$oppId}", ['status' => 'closed'])
                ->assertStatus(403);
        });
    }

    public function test_leader_close_opportunity_and_action_link(): void
    {
        $this->tx(function () {
            $oppId = Opportunity::where('code', 'OPP-002')->first()->id;
            $leader = $this->authAs('leader', 'Leader123!');

            // iso_leader có opportunity.close.
            $this->withHeaders($leader)->patchJson("/api/opportunities/{$oppId}", ['status' => 'closed'])
                ->assertOk()
                ->assertJsonPath('status', 'closed');

            // Action liên kết Opportunity: source tự đồng bộ.
            $this->withHeaders($leader)->postJson('/api/actions', [
                'code' => 'ACT-TOPL', 'title' => 'Nâng cấp quy trình báo giá', 'source' => 'other',
                'relatedOpportunityId' => $oppId, 'dueDate' => '2026-12-01',
            ])
                ->assertStatus(201)
                ->assertJsonPath('source', 'opportunity');

            $detail = $this->withHeaders($leader)->getJson("/api/opportunities/{$oppId}")->assertOk()->json();
            $this->assertContains('ACT-TOPL', array_column($detail['actions'], 'code'));
        });
    }

    // ===================== CODE AUTO-GEN & 5-STATUS WORKFLOW =====================

    public function test_create_risk_without_code_autogenerates_sequential_code(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');

            $response = $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload(['code' => null]))
                ->assertStatus(201);

            $code = (string) $response->json('code');
            $this->assertMatchesRegularExpression('/^RISK-\d{3}$/', $code);
            $this->assertSame($code, Risk::where('code', $code)->value('code'));
        });
    }

    public function test_create_opportunity_without_code_autogenerates_sequential_code(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');

            $response = $this->withHeaders($headers)->postJson('/api/opportunities', [
                'sourceType' => 'internal',
                'objective' => 'Tự sinh mã OPP',
                'feasibility' => 4,
                'benefit' => 4,
            ])->assertStatus(201);

            $code = (string) $response->json('code');
            $this->assertMatchesRegularExpression('/^OPP-\d{3}$/', $code);
            $this->assertSame($code, Opportunity::where('code', $code)->value('code'));
        });
    }

    public function test_update_status_blocked_and_pending_verification_accepted(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');

            $this->withHeaders($headers)->postJson('/api/risks', $this->riskPayload(['code' => 'RISK-ST']))
                ->assertStatus(201);
            $id = Risk::where('code', 'RISK-ST')->firstOrFail()->id;

            $this->withHeaders($headers)->patchJson("/api/risks/{$id}", ['status' => 'blocked'])
                ->assertOk()
                ->assertJsonPath('status', 'blocked');
            $this->withHeaders($headers)->patchJson("/api/risks/{$id}", ['status' => 'pending_verification'])
                ->assertOk()
                ->assertJsonPath('status', 'pending_verification');
            $this->withHeaders($headers)->patchJson("/api/risks/{$id}", ['status' => 'khong_ton_tai'])
                ->assertStatus(422);
        });
    }
}
