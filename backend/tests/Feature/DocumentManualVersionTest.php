<?php

namespace Tests\Feature;

use App\Models\Document;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CR – Form "Sửa tài liệu": auto-version + version thủ công (PATCH /documents/{id}).
 * - autoVersion=true → hệ thống tự tăng V0.x.
 * - autoVersion=false → dùng version nhập tay (bắt buộc nhập; trùng version đã có → 409).
 * Bọc transaction + rollback — không làm bẩn DB dev.
 */
class DocumentManualVersionTest extends TestCase
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

    public function test_auto_version_auto_increments(): void
    {
        $this->tx(function () {
            // iso_deputy có document.update; doc id=2 (draft, V0.1).
            $headers = $this->authAs('deputy', 'Deputy123!');

            $this->withHeaders($headers)->patchJson('/api/documents/2', [
                'autoVersion' => true,
                'changeSummary' => 'Auto tăng version',
            ])
                ->assertOk()
                ->assertJsonPath('currentVersion', 'V0.2');

            $this->assertDatabaseHas('document_versions', [
                'document_id' => 2, 'version' => 'V0.2', 'is_current' => true,
            ]);
        });
    }

    public function test_manual_version_used_when_auto_version_off(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $this->withHeaders($headers)->patchJson('/api/documents/2', [
                'autoVersion' => false,
                'version' => 'V0.7',
                'changeSummary' => 'Nhập version thủ công',
            ])
                ->assertOk()
                ->assertJsonPath('currentVersion', 'V0.7');

            $doc = Document::find(2);
            $this->assertFalse((bool) $doc->auto_version);
            $this->assertDatabaseHas('document_versions', [
                'document_id' => 2, 'version' => 'V0.7', 'is_current' => true,
            ]);
        });
    }

    public function test_manual_version_required_when_auto_version_off_422(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            // Tắt auto nhưng không nhập version → 422.
            $this->withHeaders($headers)->patchJson('/api/documents/2', [
                'autoVersion' => false,
                'changeSummary' => 'Thiếu version',
            ])->assertStatus(422);
        });
    }

    public function test_duplicate_manual_version_409(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            // V0.1 đã tồn tại của doc2 → 409.
            $this->withHeaders($headers)->patchJson('/api/documents/2', [
                'autoVersion' => false,
                'version' => 'V0.1',
                'changeSummary' => 'Trùng version',
            ])->assertStatus(409);
        });
    }

    public function test_manual_version_only_without_content_change(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            // Chỉ gửi version (không đổi name/changeSummary) vẫn tạo version mới.
            $this->withHeaders($headers)->patchJson('/api/documents/2', [
                'autoVersion' => false,
                'version' => 'V0.9',
            ])
                ->assertOk()
                ->assertJsonPath('currentVersion', 'V0.9');
        });
    }
}
