<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Bảng ĐÁNH GIÁ RỦI RO (Risk Register) – QT-BISO.03-BM.02.
        // - likelihood/impact/score/level = giá trị HIỆN TẠI (latest assessment).
        // - initial_* = snapshot đánh giá ban đầu, KHÔNG BAO GIỜ bị overwrite.
        // - Score/level luôn do backend tính (L×I), không nhận từ client.
        Schema::create('risks', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('source_type', 30)->default('internal')->index(); // internal|external|interested_party
            $table->string('category', 50)->nullable()->index(); // nhóm nguồn rủi ro (key enum, xem RiskSupport::CATEGORIES)
            $table->string('objective', 250)->nullable(); // Mục tiêu / Vấn đề / Quá trình
            $table->text('description')->nullable();

            $table->unsignedTinyInteger('likelihood'); // 1..5
            $table->unsignedTinyInteger('impact'); // 1..5
            $table->unsignedTinyInteger('risk_score'); // = likelihood × impact (1..25)
            $table->string('risk_level', 10)->index(); // low|medium|high

            $table->unsignedTinyInteger('initial_likelihood');
            $table->unsignedTinyInteger('initial_impact');
            $table->unsignedTinyInteger('initial_score');
            $table->string('initial_level', 10);

            $table->text('treatment')->nullable(); // Biện pháp xử lý
            $table->text('expected_result')->nullable();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->date('start_date')->nullable();
            $table->date('due_date')->nullable();
            $table->string('review_frequency', 20)->nullable(); // daily|monthly|quarterly|yearly|batch|custom
            $table->date('next_review_date')->nullable()->index();
            $table->string('status', 30)->default('open')->index(); // open|in_progress|blocked|pending_verification|closed

            $table->foreignId('last_reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('last_reviewed_at')->nullable();
            $table->text('last_review_comment')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Lịch sử đánh giá: dòng đầu = initial, mỗi lần đánh giá lại = residual.
        Schema::create('risk_assessments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('risk_id')->constrained('risks')->cascadeOnDelete();
            $table->string('kind', 15); // initial|residual
            $table->unsignedTinyInteger('likelihood');
            $table->unsignedTinyInteger('impact');
            $table->unsignedTinyInteger('score');
            $table->string('level', 10);
            $table->foreignId('assessed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('comment')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        // Bảng QUẢN LÝ CƠ HỘI (Opportunity Register) – QT-BISO.03-BM.03.
        Schema::create('opportunities', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('source_type', 30)->default('internal')->index();
            $table->string('category', 50)->nullable()->index();
            $table->string('objective', 250)->nullable();
            $table->text('description')->nullable();

            $table->unsignedTinyInteger('feasibility'); // 1..5
            $table->unsignedTinyInteger('benefit'); // 1..5
            $table->unsignedTinyInteger('opportunity_score'); // = feasibility × benefit
            $table->string('opportunity_level', 20)->index(); // ignore|research|priority

            $table->text('solution')->nullable(); // Giải pháp
            $table->text('expected_result')->nullable();
            $table->text('actual_result')->nullable();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->date('start_date')->nullable();
            $table->date('due_date')->nullable();
            $table->string('review_frequency', 20)->nullable();
            $table->date('next_review_date')->nullable()->index();
            $table->string('status', 30)->default('open')->index();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Liên kết Actions ↔ Risk/Opportunity (reuse module Actions hiện có).
        // Note: KHÔNG chain ->index() sau constrained() – MySQL tự tạo index cho cột FK.
        Schema::table('actions', function (Blueprint $table) {
            $table->foreignId('related_risk_id')->nullable()->constrained('risks')->nullOnDelete();
            $table->foreignId('related_opportunity_id')->nullable()->constrained('opportunities')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('actions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('related_risk_id');
            $table->dropConstrainedForeignId('related_opportunity_id');
        });
        Schema::dropIfExists('opportunities');
        Schema::dropIfExists('risk_assessments');
        Schema::dropIfExists('risks');
    }
};
