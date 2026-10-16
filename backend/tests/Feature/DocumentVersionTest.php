<?php

namespace Tests\Feature;

use App\Models\Document;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * QA Integration Gate – Documents New Version + Auto Version (CR-DOC-UI-001).
 * Tuyen: HTTP → middleware/RBAC → controller → DB → response.
 * Bock transaction + rollback – khong lam ban DB dev.
 */
class DocumentVersionTest extends TestCase
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

    public function test_published_with_permission_creates_new_version(): void
    {
        $this->tx(function () {
            // deputy: co document.create|document.update. Doc 8 = published V1.0.
            $headers = $this->authAs('deputy', 'Deputy123!');
            $beforeCount = Document::find(8)->versions()->count();

            $response = $this->withHeaders($headers)->postJson('/api/documents/8/new-version', [
                'changeSummary' => 'QA gate: tao phien ban moi',
            ]);

            $response->assertOk();
            // auto_version=true (mac dinh) → V1.0 → V2.0.
            $response->assertJsonPath('currentVersion', 'V2.0');
            $response->assertJsonPath('status', 'draft');
            $response->assertJsonPath('workflowStep', 1);

            $doc = Document::find(8);
            $this->assertSame('V2.0', $doc->current_version);
            $this->assertSame('draft', $doc->status);
            $this->assertSame($beforeCount + 1, $doc->versions()->count());
            $this->assertDatabaseHas('document_versions', [
                'document_id' => 8, 'version' => 'V2.0', 'is_current' => true,
            ]);
            $this->assertDatabaseHas('document_versions', [
                'document_id' => 8, 'version' => 'V1.0', 'is_current' => false,
            ]);
            $this->assertDatabaseHas('activity_logs', [
                'entity' => 'document', 'entity_id' => 8,
                'action' => 'new_version', 'old_status' => 'published', 'new_status' => 'draft',
            ]);

            // Reload (GET lai): du lieu van dung.
            $reload = $this->withHeaders($headers)->getJson('/api/documents');
            $reload->assertOk();
            $reloaded = collect($reload->json())->firstWhere('id', 8);
            $this->assertSame('V2.0', $reloaded['currentVersion']);
            $this->assertSame('draft', $reloaded['status']);
        });
    }

    public function test_non_published_rejected_409_and_db_unchanged(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            foreach ([2 => 'draft', 3 => 'reviewing', 4 => 'approval_pending'] as $id => $status) {
                $response = $this->withHeaders($headers)->postJson("/api/documents/{$id}/new-version", []);
                $response->assertStatus(409);
                $this->assertSame($status, Document::find($id)->status);
            }
        });
    }

    public function test_unauthorized_user_403_and_db_unchanged(): void
    {
        $this->tx(function () {
            // normal_user: khong co document.create|document.update.
            $headers = $this->authAs('user', 'User123!');
            $response = $this->withHeaders($headers)->postJson('/api/documents/8/new-version', []);
            $response->assertStatus(403);
            $this->assertSame('published', Document::find(8)->status);
            $this->assertSame('V1.0', Document::find(8)->current_version);
        });
    }

    public function test_manual_version_required_when_auto_version_off(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');
            Document::find(8)->update(['auto_version' => false]);

            $missing = $this->withHeaders($headers)->postJson('/api/documents/8/new-version', []);
            $missing->assertStatus(422);

            $manual = $this->withHeaders($headers)->postJson('/api/documents/8/new-version', [
                'version' => 'V1.1-custom', 'changeSummary' => 'Danh so thu cong',
            ]);
            $manual->assertOk();
            $manual->assertJsonPath('currentVersion', 'V1.1-custom');
        });
    }

    public function test_toggle_auto_version_persists_and_reloads(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $off = $this->withHeaders($headers)->patchJson('/api/documents/8/auto-version', ['autoVersion' => false]);
            $off->assertOk();
            $off->assertJsonPath('autoVersion', false);
            $this->assertFalse((bool) Document::find(8)->auto_version);

            $reload = $this->withHeaders($headers)->getJson('/api/documents');
            $this->assertFalse((bool) collect($reload->json())->firstWhere('id', 8)['autoVersion']);

            $on = $this->withHeaders($headers)->patchJson('/api/documents/8/auto-version', ['autoVersion' => true]);
            $on->assertOk();
            $on->assertJsonPath('autoVersion', true);
        });
    }

    public function test_toggle_auto_version_requires_update_permission(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('user', 'User123!');
            $this->withHeaders($headers)->patchJson('/api/documents/8/auto-version', ['autoVersion' => false])
                ->assertStatus(403);
        });
    }

    public function test_new_version_not_found_404(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');
            $this->withHeaders($headers)->postJson('/api/documents/999999/new-version', [])
                ->assertStatus(404);
        });
    }
}
