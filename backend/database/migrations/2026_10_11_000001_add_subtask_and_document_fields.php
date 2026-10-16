<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Sub-task phân cấp (tối đa 5 cấp) + thứ tự kéo-thả trong cùng node cha.
        Schema::table('master_plan_tasks', function (Blueprint $table) {
            if (! Schema::hasColumn('master_plan_tasks', 'parent_id')) {
                $table->foreignId('parent_id')->nullable()->after('phase_id')
                    ->constrained('master_plan_tasks')->cascadeOnDelete();
            }
            if (! Schema::hasColumn('master_plan_tasks', 'sort_order')) {
                $table->unsignedInteger('sort_order')->default(0)->after('parent_id');
                $table->index(['parent_id', 'sort_order']);
            }
        });

        // Document: ngày cập nhật trạng thái + cờ tự động đánh version.
        Schema::table('documents', function (Blueprint $table) {
            if (! Schema::hasColumn('documents', 'status_updated_at')) {
                $table->timestamp('status_updated_at')->nullable()->after('status');
            }
            if (! Schema::hasColumn('documents', 'auto_version')) {
                $table->boolean('auto_version')->default(true)->after('status_updated_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('master_plan_tasks', function (Blueprint $table) {
            if (Schema::hasColumn('master_plan_tasks', 'parent_id')) {
                $table->dropForeign(['parent_id']);
                $table->dropColumn('parent_id');
            }
            if (Schema::hasColumn('master_plan_tasks', 'sort_order')) {
                $table->dropColumn('sort_order');
            }
        });

        Schema::table('documents', function (Blueprint $table) {
            if (Schema::hasColumn('documents', 'status_updated_at')) {
                $table->dropColumn('status_updated_at');
            }
            if (Schema::hasColumn('documents', 'auto_version')) {
                $table->dropColumn('auto_version');
            }
        });
    }
};
