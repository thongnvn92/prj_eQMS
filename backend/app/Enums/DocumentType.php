<?php

namespace App\Enums;

enum DocumentType: string
{
    case Policy = 'policy';
    case Manual = 'manual';
    case Regulation = 'regulation';
    case Procedure = 'procedure';
    case WorkInstruction = 'work_instruction';
    case Form = 'form';
    case Record = 'record';
    case Standard = 'standard';

    public function label(): string
    {
        return match ($this->value) {
            self::Policy->value => 'Chính sách',
            self::Manual->value => 'Sổ tay',
            self::Regulation->value => 'Quy chế',
            self::Procedure->value => 'Quy trình',
            self::WorkInstruction->value => 'Hướng dẫn công việc',
            self::Form->value => 'Biểu mẫu',
            self::Record->value => 'Bản ghi',
            self::Standard->value => 'Tiêu chuẩn',
        };
    }
}
