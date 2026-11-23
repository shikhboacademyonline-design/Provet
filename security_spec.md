# Provet Enterprise ERP — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Verified Identity Required**: Every Firestore read/write requires `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Ownership & Master Gate**: Every subcollection document under `/erp_workspaces/{workspaceId}` (`members`, `accounts`, `records`) must reference an existing or atomically created parent workspace (`exists` / `existsAfter`), and access is restricted to the workspace owner, verified admin, or active member of that workspace.
3. **Immutable Identifiers & Timestamps**: `ownerId`, `workspaceId`, and `createdAt` (`== request.time`) are immutable after creation; `updatedAt` must equal `request.time` on every write.
4. **Strict Field Allowlists & Bounds**: Every document enforces `keys().hasAll(...)` and `keys().hasOnly(...)`, explicit type checks, bounded string lengths, and bounded `permissions` lists.
5. **Terminal State Protection**: Once an `ErpRecord` enters `'Closed'` or `'Completed'` status, non-admin updates are rejected.
6. **PII & Admin Isolation**: `/admins/{adminId}` and `/erp_workspaces/{workspaceId}/members/{memberId}` cannot be read or listed by unauthorized users; non-admins cannot self-assign `Admin` role or permissions.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Read/Write**: Call `getDoc` or `setDoc` on `/erp_workspaces/provet_main` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: User with `email: "shikhboacademyonline@gmail.com"` and `email_verified: false` attempts admin write -> `PERMISSION_DENIED`.
3. **Self-Privilege Escalation on `/admins`**: Non-admin authenticated user creates `/admins/{theirUid}` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Workspace**: Create `ErpWorkspace` containing extra ghost key `isSuperAdmin: true` -> `PERMISSION_DENIED`.
5. **Owner Spoofing**: Authenticated user `uidA` creates `ErpWorkspace` with `ownerId: "uidB"` -> `PERMISSION_DENIED`.
6. **Client Timestamp Forgery**: Create `ErpRecord` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
7. **Orphaned Subcollection Write**: Create `/erp_workspaces/nonexistent_ws/accounts/acc_1001` without parent existing or created in batch -> `PERMISSION_DENIED`.
8. **Invalid Path Variable (ID Poisoning)**: Attempt write to `/erp_workspaces/bad$id!with*chars` or >128 char ID -> `PERMISSION_DENIED`.
9. **Member Self-Role Escalation**: Staff member updates own `/members/{uid}` document changing `role` from `'Staff'` to `'Admin'` -> `PERMISSION_DENIED`.
10. **Blanket List Query Scraping**: Non-owner user queries `collection(db, 'erp_workspaces')` without ownership filter -> `PERMISSION_DENIED`.
11. **Terminal Record Tampering**: Non-admin attempts to update an `ErpRecord` whose existing `status` is `'Closed'` -> `PERMISSION_DENIED`.
12. **Unbounded Payload / Invalid Array Item**: Write `ErpMember` with `permissions: ['unknown_perm']` or >7 items, or `companyName` > 120 chars -> `PERMISSION_DENIED`.
