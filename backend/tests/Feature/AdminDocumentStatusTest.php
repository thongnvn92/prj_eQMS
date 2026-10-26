<?php

namespace Tests\Feature;

use App\Models\DocumentStatusItem;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CRUD dữ liệu quản trị (/admin) – Trạng thái tài liệu (dictionary):
 * GET/POST/PATCH/DELETE /admin/document-statuses (document.view / document_status.manage).
 * 9 trạng thái workflow là system: chỉ sửa nhãn/màu/thứ tự, không xóa được.
 */
class AdminDocumentStatusTest extends TestCase
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

    public function test_document_statuses_include_system_pipeline_rows(): void
    {
        $headers = $this->authAs('admin', 'Admin123!');
        $list = $this->withHeaders($headers)->getJson('/api/admin/document-statuses')->assertOk();

        $codes = collect($list->json())->pluck('code');
        foreach (['planned', 'draft', 'review_pending', 'reviewing', 'approval_pending', 'approved', 'published'] as $code) {
            $this->assertTrue($codes->contains($code), "thiếu trạng thái {$code}");
        }
    }

    public function test_admin_can_crud_custom_document_status(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');
            $code = 'tx_'.substr(uniqid(), -6);

            $created = $this->withHeaders($headers)->postJson('/api/admin/document-statuses', [
                'code' => $code,
                'label' => 'Trạng thái kiểm thử',
                'color' => '#123456',
                'sortOrder' => 150,
            ])->assertStatus(201);
            $id = $created->json('id');

            $this->withHeaders($headers)->patchJson("/api/admin/document-statuses/{$id}", [
                'label' => 'Trạng thái kiểm thử (sửa)',
                'isActive' => false,
            ])->assertOk()->assertJsonPath('label', 'Trạng thái kiểm thử (sửa)');

            $this->withHeaders($headers)->deleteJson("/api/admin/document-statuses/{$id}")->assertOk();
            $this->assertSame(0, DocumentStatusItem::where('id', $id)->count());
        });
    }

    public function test_system_document_status_cannot_be_deleted_409(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');
            $id = (int) DocumentStatusItem::where('code', 'draft')->value('id');

            $this->withHeaders($headers)->deleteJson("/api/admin/document-statuses/{$id}")->assertStatus(409);
        });
    }

    public function test_system_document_status_label_is_editable(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');
            $id = (int) DocumentStatusItem::where('code', 'draft')->value('id');

            $this->withHeaders($headers)->patchJson("/api/admin/document-statuses/{$id}", [
                'label' => 'Đổi nhãn được',
            ])->assertOk()->assertJsonPath('label', 'Đổi nhãn được');
        });
    }

    public function test_document_status_crud_requires_document_status_manage(): void
    {
        $this->tx(function () {
            // leader thiếu document_status.manage → POST 403 (GET document.view thì ok).
            $headers = $this->authAs('leader', 'Leader123!');
            $this->withHeaders($headers)->getJson('/api/admin/document-statuses')->assertOk();
            $this->withHeaders($headers)->postJson('/api/admin/document-statuses', [
                'code' => 'nope_status', 'label' => 'Không có quyền',
            ])->assertStatus(403);
        });
    }
}