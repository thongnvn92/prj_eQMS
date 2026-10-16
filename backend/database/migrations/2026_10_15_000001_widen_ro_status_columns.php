<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Mở rộng cột status của Risks/Opportunities từ 15 → 30 ký tự
     * để chứa 'pending_verification' (20 ký tự) – CR-RISK-OPPORTUNITY-001.
     */
    public function up(): void
    {
        Schema::table('risks', function (Blueprint $table) {
            $table->string('status', 30)->default('open')->change();
        });
        Schema::table('opportunities', function (Blueprint $table) {
            $table->string('status', 30)->default('open')->change();
        });
    }

    public function down(): void
    {
        Schema::table('risks', function (Blueprint $table) {
            $table->string('status', 15)->default('open')->change();
        });
        Schema::table('opportunities', function (Blueprint $table) {
            $table->string('status', 15)->default('open')->change();
        });
    }
};