<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('issues', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('title', 250);
            $table->text('description')->nullable();
            $table->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->string('severity', 20)->default('medium');
            $table->string('status', 30)->default('open')->index();
            $table->timestamps();
        });

        Schema::create('actions', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('title', 250);
            $table->text('description')->nullable();
            $table->string('source', 30)->default('other')->index();
            $table->foreignId('issue_id')->nullable()->constrained('issues')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('issue_description')->nullable();
            $table->foreignId('related_document_id')->nullable()->constrained('documents')->nullOnDelete();
            $table->foreignId('related_task_id')->nullable()->constrained('master_plan_tasks')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('due_date')->index();
            $table->string('status', 30)->default('open');
            $table->unsignedTinyInteger('progress')->default(0);
            $table->text('result')->nullable();
            $table->text('evidence')->nullable();
            $table->timestamps();
        });

        Schema::create('action_evidences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('action_id')->constrained('actions')->cascadeOnDelete();
            $table->foreignId('file_id')->nullable()->constrained('files')->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamps();
        });

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 50);
            $table->string('entity', 50)->index();
            $table->unsignedBigInteger('entity_id')->index();
            $table->string('old_status', 30)->nullable();
            $table->string('new_status', 30)->nullable();
            $table->text('properties')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['entity', 'entity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('action_evidences');
        Schema::dropIfExists('actions');
        Schema::dropIfExists('issues');
    }
};
