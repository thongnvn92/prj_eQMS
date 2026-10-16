<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Bỏ name mặc định của Laravel, dùng full_name theo domain eQMS
            if (Schema::hasColumn('users', 'name')) {
                $table->renameColumn('name', 'full_name');
            }
            $table->string('username', 50)->unique()->after('id');
            $table->string('full_name', 150)->change();
            $table->string('email', 150)->nullable()->change();
            $table->foreignId('department_id')->nullable()->after('full_name')
                ->constrained('departments')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login_at')->nullable();
            $table->softDeletes();

            $table->index('department_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('department_id');
            $table->dropIndex(['department_id']);
            $table->dropSoftDeletes();
            $table->dropColumn(['username', 'is_active', 'last_login_at']);
            $table->renameColumn('full_name', 'name');
            $table->string('email', 150)->nullable(false)->change();
        });
    }
};
