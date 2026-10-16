<?php

namespace App\Enums;

enum ApprovalAction: string
{
    case Submit = 'submit';
    case Review = 'review';
    case Approve = 'approve';
    case Reject = 'reject';
    case RequestChanges = 'request_changes';
    case Publish = 'publish';
}
