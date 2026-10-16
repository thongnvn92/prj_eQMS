<?php

namespace App\Enums;

enum LogEntity: string
{
    case MasterPlanTask = 'master_plan_task';
    case Dependency = 'master_plan_dependency';
    case Document = 'document';
    case DocumentVersion = 'document_version';
    case Action = 'action';
    case Issue = 'issue';
    case Risk = 'risk';
    case Opportunity = 'opportunity';
    case User = 'user';
    case Role = 'role';
}
