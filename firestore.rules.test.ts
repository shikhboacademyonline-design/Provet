/**
 * Phase 0 Dirty Dozen Security Rule Verification Harness
 * Validates payload constraints and security invariants against firebase-blueprint.json
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  reason: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated workspace read',
    collectionPath: '/erp_workspaces/provet_main',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    reason: 'Master Gate rejects request.auth == null',
  },
  {
    id: 2,
    name: 'Unverified email admin spoof',
    collectionPath: '/admins/spoof_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'Requires request.auth.token.email_verified == true',
  },
  {
    id: 3,
    name: 'Non-admin self-promotion in admins collection',
    collectionPath: '/admins/attacker_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'Only bootstrapped admin or existing admin may add admins',
  },
  {
    id: 4,
    name: 'Shadow field injection on ErpWorkspace',
    collectionPath: '/erp_workspaces/provet_main',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'keys().hasOnly() blocks extra ghost fields',
  },
  {
    id: 5,
    name: 'Owner UID spoofing on create',
    collectionPath: '/erp_workspaces/provet_main',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'incoming().ownerId must equal request.auth.uid',
  },
  {
    id: 6,
    name: 'Client-forged createdAt timestamp',
    collectionPath: '/erp_workspaces/provet_main/records/rec_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'createdAt and updatedAt must strictly equal request.time',
  },
  {
    id: 7,
    name: 'Orphaned account creation without parent workspace',
    collectionPath: '/erp_workspaces/missing_ws/accounts/acc_1001',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'Master Gate requires parent workspace via getAfter/existsAfter',
  },
  {
    id: 8,
    name: 'Invalid document ID characters (ID poisoning)',
    collectionPath: '/erp_workspaces/invalid$ws!id',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'isValidId() enforces ^[a-zA-Z0-9_\\-]+$ and size <= 128',
  },
  {
    id: 9,
    name: 'Staff self-escalation to Admin role in members',
    collectionPath: '/erp_workspaces/provet_main/members/staff_uid',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    reason: 'Only workspace owner/admin may modify role or permissions',
  },
  {
    id: 10,
    name: 'Unauthorized blanket list query across workspaces',
    collectionPath: '/erp_workspaces',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    reason: 'allow list requires resource.data.ownerId == request.auth.uid || isBootstrappedAdmin()',
  },
  {
    id: 11,
    name: 'Non-admin update on terminal Closed record',
    collectionPath: '/erp_workspaces/provet_main/records/rec_closed',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    reason: 'Terminal status Closed/Completed is locked against non-admin updates',
  },
  {
    id: 12,
    name: 'Invalid permission allowlist item or oversized string',
    collectionPath: '/erp_workspaces/provet_main/members/staff_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'permissions list bounded <= 7 and checked with hasOnly()',
  },
];
