<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CR-DOC-UI-002 – Xóa tài liệu (DELETE /api/documents/{id}):
 * - Quyền riêng document.delete: thiếu ⇒ 403 (middleware).
 * - published ⇒ 409 (không xóa record ISO đã ban hành); draft ⇒ 200 + biến mất khỏi list.
 * - 401 khi thiếu token; 404 khi id không tồn tại.
 * Bọc transaction + rollback (không làm bẩn dữ liệu dev).
 */
class DocumentDeleteTest extends TestCase
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

    public function test_delete_without_token_401(): void
    {
        $this->deleteJson('/api/documents/2')->assertStatus(401);
    }

    public function test_normal_user_cannot_delete_document_403(): void
    {
        // normal_user có document.view nhưng không có document.delete → 403.
        $headers = $this->authAs('user', 'User123!');

        $this->withHeaders($headers)->deleteJson('/api/documents/2')->assertStatus(403);
    }

    public function test_leader_deletes_draft_document_200_and_gone_from_list(): void
    {
        $this->tx(function () {
            // iso_leader có document.delete; doc id=2 (QT-HCNS.02) ở trạng thái draft.
            $headers = $this->authAs('leader', 'Leader123!');

            $this->withHeaders($headers)->deleteJson('/api/documents/2')
                ->assertOk()
                ->assertJsonPath('status', 'ok');

            $list = $this->withHeaders($headers)->getJson('/api/documents');
            $list->assertOk();
            $this->assertFalse(
                collect($list->json())->contains('code', 'QT-HCNS.02'),
                'Tài liệu đã xóa phải biến mất khỏi danh sách',
            );
        });
    }

    public function test_delete_published_document_409(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');

            // doc id=1 (QT-HCNS.01) đã published → 409, không được xóa.
            $this->withHeaders($headers)->deleteJson('/api/documents/1')
                ->assertStatus(409);
        });
    }

    public function test_delete_not_found_404(): void
    {
        $headers = $this->authAs('leader', 'Leader123!');

        $this->withHeaders($headers)->deleteJson('/api/documents/999999')->assertStatus(404);
    }

    public function test_iso_member_without_delete_permission_403(): void
    {
        // iso_coordinator có document.update nhưng KHÔNG document.delete → 403.
        $headers = $this->authAs('coordinator', 'Coord123!');

        $this->withHeaders($headers)->deleteJson('/api/documents/2')->assertStatus(403);
    }
}
