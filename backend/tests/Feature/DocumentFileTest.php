<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Task – Upload/tải file tài liệu theo mô hình revision (SVN):
 * - Upload tạo revision mới (không overwrite bản cũ).
 * - Xem/tải: mọi người có document.view; PDF inline, file khác attachment.
 * - Upload yêu cầu quyền document.create|update; normal_user bị 403.
 * Bọc transaction + rollback; fake disk cho file vật lý.
 */
class DocumentFileTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

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

    public function test_member_can_upload_and_revision_increments(): void
    {
        $this->tx(function () {
            // iso_deputy có document.create + document.update.
            $headers = $this->authAs('deputy', 'Deputy123!');

            $first = $this->withHeaders($headers)->post('/api/documents/2/files', [
                'files' => [UploadedFile::fake()->create('QT-02-v1.pdf', 100, 'application/pdf')],
                'changeNote' => 'Bản nháp đầu',
            ]);
            $first->assertCreated();
            $first->assertJsonPath('0.revision', 1);

            $second = $this->withHeaders($headers)->post('/api/documents/2/files', [
                'files' => [UploadedFile::fake()->create('QT-02-v2.pdf', 120, 'application/pdf')],
                'changeNote' => 'Bổ sung mục 3',
            ]);
            $second->assertCreated();
            $second->assertJsonPath('0.revision', 2);

            // Danh sách file trả đúng 2 revision của tài liệu.
            $list = $this->withHeaders($headers)->getJson('/api/documents/2/files');
            $list->assertOk();
            $this->assertCount(2, $list->json());
        });
    }

    public function test_multiple_files_upload_up_to_10_increments_each_revision(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $files = [];
            for ($i = 1; $i <= 5; $i++) {
                $files[] = UploadedFile::fake()->create("file-{$i}.pdf", 50, 'application/pdf');
            }

            $res = $this->withHeaders($headers)->post('/api/documents/2/files', [
                'files' => $files,
            ]);
            $res->assertCreated();
            $this->assertCount(5, $res->json());
            $this->assertSame([1, 2, 3, 4, 5], array_column($res->json(), 'revision'));
        });
    }

    public function test_upload_rejects_more_than_10_files_422(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $files = [];
            for ($i = 1; $i <= 11; $i++) {
                $files[] = UploadedFile::fake()->create("file-{$i}.pdf", 10, 'application/pdf');
            }

            $this->withHeaders($headers)->post('/api/documents/2/files', [
                'files' => $files,
            ])->assertStatus(422);
        });
    }

    public function test_list_files_requires_document_view_401_without_token(): void
    {
        $this->getJson('/api/documents/2/files')->assertStatus(401);
    }

    public function test_download_pdf_is_inline(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');
            $upload = $this->withHeaders($headers)->post('/api/documents/2/files', [
                'files' => [UploadedFile::fake()->create('manual.pdf', 200, 'application/pdf')],
            ]);
            $upload->assertCreated();
            $fileId = $upload->json('0.id');

            $dl = $this->withHeaders($headers)->get('/api/documents/files/'.$fileId.'/download');
            $dl->assertOk();
            $this->assertStringContainsString('inline', $dl->headers->get('Content-Disposition'));
        });
    }

    public function test_download_non_pdf_is_attachment(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');
            $upload = $this->withHeaders($headers)->post('/api/documents/2/files', [
                'files' => [UploadedFile::fake()->create('bang-ke.xlsx', 200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')],
            ]);
            $upload->assertCreated();
            $fileId = $upload->json('0.id');

            $dl = $this->withHeaders($headers)->get('/api/documents/files/'.$fileId.'/download');
            $dl->assertOk();
            $this->assertStringContainsString('attachment', $dl->headers->get('Content-Disposition'));
        });
    }

    public function test_normal_user_cannot_upload_403(): void
    {
        $this->tx(function () {
            // normal_user chỉ có document.view → upload bị middleware chặn.
            $headers = $this->authAs('user', 'User123!');

            $this->withHeaders($headers)->post('/api/documents/2/files', [
                'files' => [UploadedFile::fake()->create('x.pdf', 10, 'application/pdf')],
            ])->assertStatus(403);
        });
    }

    public function test_upload_rejects_disallowed_extension_422(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $this->withHeaders($headers)->post('/api/documents/2/files', [
                'files' => [UploadedFile::fake()->create('hack.exe', 10, 'application/octet-stream')],
            ])->assertStatus(422);
        });
    }
}
