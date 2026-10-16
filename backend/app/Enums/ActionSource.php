<?php

namespace App\Enums;

enum ActionSource: string
{
    case AuditFinding = 'audit_finding';
    case Ncr = 'ncr';
    case Complaint = 'complaint';
    case Risk = 'risk';
    case Opportunity = 'opportunity';
    case Management = 'management';
    case InternalAudit = 'internal_audit';
    case Other = 'other';
}
