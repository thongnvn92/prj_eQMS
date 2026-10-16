<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use Throwable;

class ApiException extends \Exception
{
    public function __construct(
        public int $statusCode = 400,
        public array $errors = [],
        ?string $message = null,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message ?? 'Lỗi không xác định', 0, $previous);
    }

    public function toResponse(): JsonResponse
    {
        $payload = ['status' => 'error', 'message' => $this->message];
        if (! empty($this->errors)) {
            $payload['errors'] = $this->errors;
        }

        return response()->json($payload, $this->statusCode);
    }
}
