<?php

use App\Enums\DocumentStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Dictionary trạng thái tài liệu do admin (/admin) quản lý (CRUD).
     * - 9 trạng thái workflow chuẩn (is_system=true) được seed sẵn; admin chỉ sửa
     *   label/màu/thứ tự/active, KHÔNG xóa được (state machine phụ thuộc code).
     * - Trạng thái tùy chỉnh (is_system=false) admin tạo/xóa được; xóa bị chặn
     *   khi còn tài liệu đang dùng code đó.
     */
    public function up(): void
    {
        Schema::create('document_statuses', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('label', 100);
            $table->string('color', 20)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_system')->default(false);
            $table->timestamps();
        });

        // Seed trạng thái workflow chuẩn (idempotent – code đã có thì bỏ qua).
        foreach (DocumentStatus::pipeline() as $row) {
            $exists = DB::table('document_statuses')->where('code', $row['code'])->exists();
            if (! $exists) {
                DB::table('document_statuses')->insert(array_merge($row, [
                    'is_active' => true,
                    'is_system' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]));
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('document_statuses');
    }
};