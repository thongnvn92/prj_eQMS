<?php

use App\Http\Controllers\Api\ActionsController;
use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AiAnalysisController;
use App\Http\Controllers\Api\AiSettingsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DocumentsController;
use App\Http\Controllers\Api\LookupsController;
use App\Http\Controllers\Api\MasterPlanController;
use App\Http\Controllers\Api\OpportunitiesController;
use App\Http\Controllers\Api\RiskDashboardController;
use App\Http\Controllers\Api\RisksController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API routes – DMC eQMS (stateless, Laravel Sanctum Bearer Token)
|--------------------------------------------------------------------------
| - KHÔNG dùng session-based auth.
| - Client gửi header: Authorization: Bearer <token>.
| - Mọi endpoint cần đăng nhập đều nằm trong nhóm middleware('auth:sanctum').
*/

// Công khai: đăng nhập (trả { token, user }).
Route::post('/login', [AuthController::class, 'login']);

// Cần đăng nhập (Bearer Token).
Route::middleware('auth:sanctum')->group(function () {
    // Thông tin user hiện tại – trả trực tiếp SessionUser (không bọc { user }).
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/ai/analyses', [AiAnalysisController::class, 'index']);
    Route::post('/ai/analyses', [AiAnalysisController::class, 'store']);
    Route::get('/ai/settings', [AiSettingsController::class, 'show'])
        ->middleware('permission:dashboard.view');
    Route::post('/ai/analyze', [AiSettingsController::class, 'analyze'])
        ->middleware('permission:dashboard.view');
    Route::get('/admin/settings/ai', [AiSettingsController::class, 'show'])
        ->middleware('permission:role.manage');
    Route::put('/admin/settings/ai', [AiSettingsController::class, 'update'])
        ->middleware('permission:role.manage');
    Route::post('/admin/settings/ai/test', [AiSettingsController::class, 'test'])
        ->middleware('permission:role.manage');

    Route::get('/lookups', LookupsController::class);

    Route::get('/master-plan', MasterPlanController::class)
        ->middleware('permission:master_plan.view');
    Route::patch('/master-plan/tasks/{id}', [MasterPlanController::class, 'updateTask'])
        ->middleware('permission:master_plan.update')
        ->whereNumber('id');
    // CR Master Plan ISO: người phụ trách cập nhật tiến độ công việc của mình
    // (controller cho phép owner hoặc người có master_plan.update).
    Route::patch('/master-plan/tasks/{id}/progress', [MasterPlanController::class, 'updateTaskProgress'])
        ->middleware('permission:master_plan.view')
        ->whereNumber('id');
    // CRUD kế hoạch + công việc (sub-task, reorder).
    Route::middleware('permission:master_plan.view')->group(function () {
        Route::get('/master-plan/plans', [MasterPlanController::class, 'plans']);
        Route::post('/master-plan/plans', [MasterPlanController::class, 'storePlan'])
            ->middleware('permission:master_plan.create');
        Route::patch('/master-plan/plans/{id}', [MasterPlanController::class, 'updatePlan'])
            ->middleware('permission:master_plan.update')->whereNumber('id');
        Route::delete('/master-plan/plans/{id}', [MasterPlanController::class, 'destroyPlan'])
            ->middleware('permission:master_plan.delete')->whereNumber('id');
        Route::post('/master-plan/tasks', [MasterPlanController::class, 'storeTask'])
            ->middleware('permission:master_plan.create');
        Route::post('/master-plan/tasks/import', [MasterPlanController::class, 'importTasks'])
            ->middleware('permission:master_plan.create');
        Route::post('/master-plan/tasks/reorder', [MasterPlanController::class, 'reorder'])
            ->middleware('permission:master_plan.update');
        Route::delete('/master-plan/tasks/{id}', [MasterPlanController::class, 'destroyTask'])
            ->middleware('permission:master_plan.delete')->whereNumber('id');
    });

    Route::get('/dashboard', DashboardController::class)
        ->middleware('permission:dashboard.view');

    Route::middleware('permission:document.view')->group(function () {
        Route::get('/documents', [DocumentsController::class, 'index']);
        // Thêm/sửa metadata tài liệu (Ban ISO + document_owner). Chỉ sửa khi status=draft (409 nếu khác).
        Route::post('/documents', [DocumentsController::class, 'store'])
            ->middleware('permission:document.create');
        Route::post('/documents/import', [DocumentsController::class, 'importDocuments'])
            ->middleware('permission:document.create');
        Route::patch('/documents/{id}', [DocumentsController::class, 'update'])
            ->middleware('permission:document.update')
            ->whereNumber('id');
        // Xóa tài liệu (quyền riêng document.delete; chặn published → 409 trong controller).
        Route::delete('/documents/{id}', [DocumentsController::class, 'destroy'])
            ->middleware('permission:document.delete')
            ->whereNumber('id');
        Route::post('/documents/{id}/transition', [DocumentsController::class, 'transition'])
            ->middleware('permission:document.view|document.submit|document.review|document.approve|document.publish')
            ->whereNumber('id');

        // Nâng cấp version + bật/tắt tự động đánh version (cần quyền sửa/tạo tài liệu).
        Route::post('/documents/{id}/new-version', [DocumentsController::class, 'newVersion'])
            ->middleware('permission:document.create|document.update')->whereNumber('id');
        Route::patch('/documents/{id}/auto-version', [DocumentsController::class, 'toggleAutoVersion'])
            ->middleware('permission:document.update')->whereNumber('id');

        // Đính kèm file theo mô hình revision (SVN).
        // Xem/tải: mọi người có document.view. Upload: cần quyền tạo/sửa tài liệu.
        Route::get('/documents/{id}/files', [DocumentsController::class, 'files'])
            ->whereNumber('id');
        Route::post('/documents/{id}/files', [DocumentsController::class, 'uploadFile'])
            ->middleware('permission:document.create|document.update')
            ->whereNumber('id');
        Route::get('/documents/files/{documentFileId}/download', [DocumentsController::class, 'downloadFile'])
            ->whereNumber('documentFileId');
    });

    Route::middleware('permission:action.view')->group(function () {
        Route::get('/actions', [ActionsController::class, 'index']);
        Route::post('/actions', [ActionsController::class, 'store'])
            ->middleware('permission:action.create');
        Route::delete('/actions/{id}', [ActionsController::class, 'destroy'])
            ->middleware('permission:action.delete')->whereNumber('id');
        Route::patch('/actions/{id}', [ActionsController::class, 'update'])
            ->middleware('permission:action.update|action.verify')
            ->whereNumber('id');
    });

    // ---------- CR-RISK-OPPORTUNITY-001: Risk & Opportunity ----------
    Route::middleware('permission:risk.view')->group(function () {
        Route::get('/risks', [RisksController::class, 'index']);
        Route::post('/risks', [RisksController::class, 'store'])
            ->middleware('permission:risk.create');
        Route::get('/risks/{id}', [RisksController::class, 'show'])->whereNumber('id');
        Route::get('/risks/{id}/history', [RisksController::class, 'history'])->whereNumber('id');
        Route::patch('/risks/{id}', [RisksController::class, 'update'])
            ->middleware('permission:risk.update|risk.evaluate')
            ->whereNumber('id');
        Route::post('/risks/{id}/evaluate', [RisksController::class, 'evaluate'])
            ->middleware('permission:risk.evaluate')->whereNumber('id');
        Route::delete('/risks/{id}', [RisksController::class, 'destroy'])
            ->middleware('permission:risk.delete')->whereNumber('id');
    });

    Route::middleware('permission:opportunity.view')->group(function () {
        Route::get('/opportunities', [OpportunitiesController::class, 'index']);
        Route::post('/opportunities', [OpportunitiesController::class, 'store'])
            ->middleware('permission:opportunity.create');
        Route::get('/opportunities/{id}', [OpportunitiesController::class, 'show'])->whereNumber('id');
        Route::patch('/opportunities/{id}', [OpportunitiesController::class, 'update'])
            ->middleware('permission:opportunity.update|opportunity.evaluate')
            ->whereNumber('id');
        Route::post('/opportunities/{id}/evaluate', [OpportunitiesController::class, 'evaluate'])
            ->middleware('permission:opportunity.evaluate')->whereNumber('id');
        Route::delete('/opportunities/{id}', [OpportunitiesController::class, 'destroy'])
            ->middleware('permission:opportunity.delete')->whereNumber('id');
    });

    Route::get('/risk-dashboard', RiskDashboardController::class)
        ->middleware('permission:risk.view|opportunity.view');

    // ---------- CRUD dữ liệu quản trị (master data) ----------
    // Nhóm công việc (Giai đoạn) – quyền theo module master_plan.
    Route::get('/admin/phases', [AdminController::class, 'phases'])
        ->middleware('permission:master_plan.view');
    Route::post('/admin/phases', [AdminController::class, 'storePhase'])
        ->middleware('permission:master_plan.create');
    Route::patch('/admin/phases/{id}', [AdminController::class, 'updatePhase'])
        ->middleware('permission:master_plan.update')->whereNumber('id');
    Route::delete('/admin/phases/{id}', [AdminController::class, 'destroyPhase'])
        ->middleware('permission:master_plan.delete')->whereNumber('id');

    // Phòng ban.
    Route::get('/admin/departments', [AdminController::class, 'departments'])
        ->middleware('permission:department.view');
    Route::middleware('permission:department.manage')->group(function () {
        Route::post('/admin/departments', [AdminController::class, 'storeDepartment']);
        Route::patch('/admin/departments/{id}', [AdminController::class, 'updateDepartment'])->whereNumber('id');
        Route::delete('/admin/departments/{id}', [AdminController::class, 'destroyDepartment'])->whereNumber('id');
    });

    // Trạng thái tài liệu (dictionary do admin quản lý – 9 trạng thái workflow là system).
    Route::get('/admin/document-statuses', [AdminController::class, 'documentStatuses'])
        ->middleware('permission:document.view');
    Route::middleware('permission:document_status.manage')->group(function () {
        Route::post('/admin/document-statuses', [AdminController::class, 'storeDocumentStatus']);
        Route::patch('/admin/document-statuses/{id}', [AdminController::class, 'updateDocumentStatus'])->whereNumber('id');
        Route::delete('/admin/document-statuses/{id}', [AdminController::class, 'destroyDocumentStatus'])->whereNumber('id');
    });

    Route::middleware('permission:user.view')->group(function () {
        Route::get('/admin/users', [AdminController::class, 'users']);
        Route::get('/admin/roles', [AdminController::class, 'roles']);
        Route::post('/admin/reset-demo', [AdminController::class, 'resetDemo']);
        // CRUD Người dùng (user.create / user.update) + Vai trò & Phân quyền (role.manage).
        Route::post('/admin/users', [AdminController::class, 'storeUser'])
            ->middleware('permission:user.create');
        Route::middleware('permission:user.update')->group(function () {
            Route::patch('/admin/users/{id}', [AdminController::class, 'updateUser'])->whereNumber('id');
            Route::delete('/admin/users/{id}', [AdminController::class, 'destroyUser'])->whereNumber('id');
        });
        Route::middleware('permission:role.manage')->group(function () {
            Route::post('/admin/roles', [AdminController::class, 'storeRole']);
            Route::patch('/admin/roles/{id}', [AdminController::class, 'updateRole'])->whereNumber('id');
            Route::delete('/admin/roles/{id}', [AdminController::class, 'destroyRole'])->whereNumber('id');
        });
    });
});
