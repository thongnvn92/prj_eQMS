<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    // Method API thực tế (RESTful của dự án) – tránh wildcard '*' ở production.
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    // Origin FE (Vite dev server). Đổi qua biến FRONTEND_URL trong .env;
    // production: set FRONTEND_URL=https://eqms.example.com (KHÔNG dùng wildcard origin).
    'allowed_origins' => [env('FRONTEND_URL', 'http://localhost:5173')],

    'allowed_origins_patterns' => [],

    // Header mà FE gửi: JSON body + Bearer token (không cần credentials/cookie).
    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Requested-With'],

    'exposed_headers' => [],

    // Cache preflight 1 giờ – giảm số OPTIONS request trong phiên làm việc.
    'max_age' => 3600,

    // FE dùng Bearer Token (header Authorization), KHÔNG cần cookie credentials.
    'supports_credentials' => false,

];
