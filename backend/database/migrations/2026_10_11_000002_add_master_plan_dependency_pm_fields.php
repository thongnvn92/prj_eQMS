<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // -------------------- master_plan_tasks : PM columns --------------------
        Schema::table('master_plan_tasks', function (Blueprint $table) {
            if (! Schema::hasColumn('master_plan_tasks', 'is_milestone')) {
                $table->boolean('is_milestone')->default(false)->after('due_date');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'planned_start_date')) {
                $table->date('planned_start_date')->nullable()->after('is_milestone');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'planned_end_date')) {
                $table->date('planned_end_date')->nullable()->after('planned_start_date');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'actual_start_date')) {
                $table->date('actual_start_date')->nullable()->after('planned_end_date');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'actual_end_date')) {
                $table->date('actual_end_date')->nullable()->after('actual_start_date');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'duration')) {
                $table->unsignedInteger('duration')->nullable()->after('actual_end_date');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'constraint_type')) {
                $table->string('constraint_type', 50)->nullable()->after('duration');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'constraint_date')) {
                $table->date('constraint_date')->nullable()->after('constraint_type');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'baseline_start_date')) {
                $table->date('baseline_start_date')->nullable()->after('constraint_date');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'baseline_end_date')) {
                $table->date('baseline_end_date')->nullable()->after('baseline_start_date');
            }
            if (! Schema::hasColumn('master_plan_tasks', 'baseline_progress')) {
                $table->unsignedTinyInteger('baseline_progress')->nullable()->after('baseline_end_date');
            }
        });

        // ------------------------- master_plan_dependencies -----------------------
        Schema::create('master_plan_dependencies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('master_plan_id')->constrained('master_plans')->cascadeOnDelete();
            $table->foreignId('predecessor_task_id')->constrained('master_plan_tasks')->cascadeOnDelete();
            $table->foreignId('successor_task_id')->constrained('master_plan_tasks')->cascadeOnDelete();
            $table->string('dependency_type', 2)->default('FS')->comment('FS / SS / FF / SF');
            $table->unsignedInteger('lag_days')->default(0)->comment('số ngày trễ sau mốc predecessor');
            $table->unsignedInteger('sequence')->default(0)->comment('thứ tự appearance nội bộ');
            $table->timestamps();

            $table->unique(
                ['predecessor_task_id', 'successor_task_id', 'dependency_type'],
                'unique_master_plan_dependency'
            );
            $table->index('master_plan_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('master_plan_dependencies');

        Schema::table('master_plan_tasks', function (Blueprint $table) {
            if (Schema::hasColumn('master_plan_tasks', 'baseline_progress')) {
                $table->dropColumn('baseline_progress');
            }
            if (Schema::hasColumn('master_plan_tasks', 'baseline_end_date')) {
                $table->dropColumn('baseline_end_date');
            }
            if (Schema::hasColumn('master_plan_tasks', 'baseline_start_date')) {
                $table->dropColumn('baseline_start_date');
            }
            if (Schema::hasColumn('master_plan_tasks', 'constraint_date')) {
                $table->dropColumn('constraint_date');
            }
            if (Schema::hasColumn('master_plan_tasks', 'constraint_type')) {
                $table->dropColumn('constraint_type');
            }
            if (Schema::hasColumn('master_plan_tasks', 'duration')) {
                $table->dropColumn('duration');
            }
            if (Schema::hasColumn('master_plan_tasks', 'actual_end_date')) {
                $table->dropColumn('actual_end_date');
            }
            if (Schema::hasColumn('master_plan_tasks', 'actual_start_date')) {
                $table->dropColumn('actual_start_date');
            }
            if (Schema::hasColumn('master_plan_tasks', 'planned_end_date')) {
                $table->dropColumn('planned_end_date');
            }
            if (Schema::hasColumn('master_plan_tasks', 'planned_start_date')) {
                $table->dropColumn('planned_start_date');
            }
            if (Schema::hasColumn('master_plan_tasks', 'is_milestone')) {
                $table->dropColumn('is_milestone');
            }
        });
    }
};
