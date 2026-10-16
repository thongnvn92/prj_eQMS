<?php

namespace App\Support;

use Carbon\Carbon;

class Helpers
{
    /**
     * Đếm task theo status từ collection.
     */
    public static function groupByStatus($items, string $statusField)
    {
        $result = [];
        foreach ($items as $item) {
            $status = $item->{$statusField};
            $result[$status][] = $item;
        }

        return $result;
    }

    /**
     * Đếm theo status, trả mảng [{status,count}] (thứ tự giữ nguyên enum).
     *
     * @param  iterable<int, mixed>  $items
     * @return array<int, array{status:string,count:int}>
     */
    public static function countByStatus($items, string $statusField): array
    {
        $counts = [];
        foreach ($items as $item) {
            $status = $item->{$statusField};
            $counts[$status] = ($counts[$status] ?? 0) + 1;
        }
        $out = [];
        foreach ($counts as $status => $count) {
            $out[] = ['status' => $status, 'count' => $count];
        }

        return $out;
    }

    /**
     * Đếm theo status nhưng trả ĐỦ mọi giá trị trong $order (kể cả count=0),
     * giữ đúng thứ tự khai báo. Khớp contract chart của frontend (FE luôn
     * duyệt toàn bộ trạng thái để vẽ legend/cột, kể cả nhóm 0).
     *
     * @param  iterable<int, mixed>  $items
     * @param  array<int, string>  $order
     * @return array<int, array{status:string,count:int}>
     */
    public static function countByStatuses($items, string $statusField, array $order): array
    {
        $counts = array_fill_keys($order, 0);
        foreach ($items as $item) {
            $status = $item->{$statusField};
            if (array_key_exists($status, $counts)) {
                $counts[$status]++;
            } else {
                $counts[$status] = ($counts[$status] ?? 0) + 1;
            }
        }
        $out = [];
        foreach ($counts as $status => $count) {
            $out[] = ['status' => $status, 'count' => $count];
        }

        return $out;
    }

    public static function avgProgress($items): float
    {
        if ($items->isEmpty()) {
            return 0;
        }

        return round($items->avg('progress'));
    }

    public static function completionRate($items): int
    {
        if ($items->isEmpty()) {
            return 0;
        }

        return (int) round(($items->where('status', 'completed')->count() / $items->count()) * 100);
    }

    public static function overdue($items, string $dateField, string $statusField = 'status'): array
    {
        $today = now()->format('Y-m-d');

        return $items->filter(function ($item) use ($dateField, $statusField, $today) {
            $due = $item->{$dateField};
            // Chuẩn hóa về 'Y-m-d' trước khi so sánh (tránh so Carbon với string).
            $dueStr = $due ? Carbon::parse($due)->format('Y-m-d') : null;

            return $dueStr !== null
                && $dueStr < $today
                && $item->{$statusField} !== 'completed'
                && $item->{$statusField} !== 'cancelled';
        })->values()->all();
    }

    public static function overdueByStatus($items, string $dateField, string $statusField, string $status)
    {
        $today = now()->format('Y-m-d');

        return $items->filter(function ($item) use ($dateField, $statusField, $status, $today) {
            $due = $item->{$dateField};
            $dueStr = $due ? Carbon::parse($due)->format('Y-m-d') : null;

            return $dueStr !== null
                && $dueStr < $today
                && $item->{$statusField} === $status;
        })->values();
    }
}
