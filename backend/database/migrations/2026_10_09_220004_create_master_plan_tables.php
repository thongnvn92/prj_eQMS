<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('master_plans', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name', 200);
            $table->string('cycle_label', 50);
            $table->date('start_date');
            $table->date('end_date');
            $table->string('status', 30)->default('not_started')->index();
            $table->text('description')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('master_plan_phases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('master_plan_id')->constrained('master_plans')->cascadeOnDelete();
            $table->string('code', 20);
            $table->string('name', 200);
            $table->date('start_date');
            $table->date('end_date');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('master_plan_id');
        });

        Schema::create('master_plan_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('phase_id')->constrained('master_plan_phases')->cascadeOnDelete();
            $table->string('code', 30)->index();
            $table->string('name', 250);
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->string('priority', 20)->default('medium')->index();
            $table->string('status', 30)->default('not_started')->index();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->date('start_date');
            $table->date('due_date')->index();
            $table->text('result')->nullable();
            $table->text('note')->nullable();
            $table->string('year', 4)->nullable()->index();
            $table->string('quarter', 2)->nullable();
            $table->string('month', 7)->nullable();
            $table->foreignId('dependency_id')->nullable()->constrained('master_plan_tasks')->nullOnDelete();
            $table->string('risk_level', 20)->nullable();
            $table->timestamps();

            $table->index(['phase_id']);
            $table->index(['owner_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('master_plan_tasks');
        Schema::dropIfExists('master_plan_phases');
        Schema::dropIfExists('master_plans');
    }
};
