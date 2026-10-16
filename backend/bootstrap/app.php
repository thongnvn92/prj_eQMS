<?php

use App\Http\Middleware\PermissionMiddleware;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'permission' => PermissionMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // API luôn trả JSON – không phụ thuộc header Accept của client.
        // (Nếu không có dòng này, request api/* thiếu Accept: application/json sẽ
        //  được framework xử lý như web → redirect route('login') → lỗi.)
        $exceptions->shouldRenderJsonWhen(
            fn ($request, Throwable $e) => $request->is('api/*')
        );

        // Chuẩn hóa JSON error cho API: luôn trả { status: 'error', message, errors? }.

        // 401 – chưa đăng nhập / token sai hoặc thiếu (auth:sanctum).
        $exceptions->render(function (AuthenticationException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Bạn cần đăng nhập để thực hiện thao tác này.',
                ], 401);
            }
        });

        // 403 – không đủ quyền (AuthorizationException / gate / policy).
        $exceptions->render(function (AuthorizationException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Bạn không có quyền thực hiện thao tác này.',
                ], 403);
            }
        });

        // 403 – route/ability chặn bằng AccessDeniedHttpException.
        $exceptions->render(function (AccessDeniedHttpException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Bạn không có quyền thực hiện thao tác này.',
                ], 403);
            }
        });

        // 422 – lỗi validation.
        $exceptions->render(function (ValidationException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Dữ liệu không hợp lệ.',
                    'errors' => $e->errors(),
                ], 422);
            }
        });

        // 404 – route không tồn tại hoặc model không tìm thấy.
        $exceptions->render(function (NotFoundHttpException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Không tìm thấy tài nguyên yêu cầu.',
                ], 404);
            }
        });

        $exceptions->render(function (ModelNotFoundException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Không tìm thấy tài nguyên yêu cầu.',
                ], 404);
            }
        });
    })->create();
