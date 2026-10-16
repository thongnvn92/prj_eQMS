<?php

namespace Tests\Feature;

use App\Models\Action;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CR – Form "Cập nhật" Action cho sửa thêm: Vấn đề/Action (title), Nguồn (source),
 * Phụ trách (ownerId), Phòng (departmentId), Hạn (dueDate).
 * Bọc transaction + rollback — không làm bẩn DB dev.
 */
class ActionUpdateFieldsTest extends TestCase
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

    public function test_leader_updates_title_source_owner_department_due_date(): void
    {
        $this->tx(function () {
            // iso_leader có action.update. Action id=2 (open) cho phép sửa các cột thông tin.
            $headers = $this->authAs('leader', 'Leader123!');

            $this->withHeaders($headers)->patchJson('/api/actions/2', [
                'title' => 'Sửa quy trình bàn giao ca (cập nhật)',
                'source' => 'complaint',
                'ownerId' => 4,
                'departmentId' => 2,
                'dueDate' => '2026-12-31',
            ])
                ->assertOk()
                ->assertJsonPath('title', 'Sửa quy trình bàn giao ca (cập nhật)')
                ->assertJsonPath('source', 'complaint')
                ->assertJsonPath('ownerId', 4)
                ->assertJsonPath('departmentId', 2);

            $action = Action::find(2);
            $this->assertSame('complaint', $action->source);
            $this->assertSame(4, (int) $action->owner_id);
            $this->assertSame(2, (int) $action->department_id);
            $this->assertSame('2026-12-31', $action->due_date->format('Y-m-d'));
        });
    }

    public function test_update_with_invalid_source_422(): void
    {
        $headers = $this->authAs('leader', 'Leader123!');

        $this->withHeaders($headers)->patchJson('/api/actions/2', ['source' => 'khong_hop_le'])
            ->assertStatus(422);
    }

    public function test_update_with_unknown_owner_422(): void
    {
        $headers = $this->authAs('leader', 'Leader123!');

        $this->withHeaders($headers)->patchJson('/api/actions/2', ['ownerId' => 999999])
            ->assertStatus(422);
    }

    public function test_normal_user_cannot_update_others_action_403(): void
    {
        $headers = $this->authAs('user', 'User123!');

        // Action id=2 không thuộc normal_user (user id=8) → 403 resource-level.
        $this->withHeaders($headers)->patchJson('/api/actions/2', ['title' => 'Cố sửa của người khác'])
            ->assertStatus(403);
    }

    public function test_update_not_found_404(): void
    {
        $headers = $this->authAs('leader', 'Leader123!');

        $this->withHeaders($headers)->patchJson('/api/actions/999999', ['title' => 'Không tồn tại'])
            ->assertStatus(404);
    }
}
