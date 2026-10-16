<?php

namespace App\Providers;

use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Contract frontend (mock) trả mảng/object TRỰC TIẾP, KHÔNG bọc { data: ... }.
        // Vô hiệu wrapping mặc định của Laravel API Resources cho toàn bộ app để
        // mọi endpoint khớp đúng shape camelCase mà FE đang dùng.
        JsonResource::withoutWrapping();

        // API stateless (Bearer token): KHÔNG redirect khi chưa đăng nhập.
        // Mặc định middleware Authenticate sẽ gọi route('login') ngay lúc ném
        // AuthenticationException → RouteNotFoundException (500) vì app không có
        // route web 'login'. Trả null để exception giữ redirectTo = null, kết hợp
        // shouldRenderJsonWhen trong bootstrap/app.php → luôn JSON 401 cho api/*.
        Authenticate::redirectUsing(fn () => null);
    }
}
