import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  AttendanceRecord,
  ChartAccount,
  Customer,
  DamagedRecord,
  ERPDatabase,
  ERPUser,
  Employee,
  JournalEntry,
  LeaveRequest,
  PayrollRun,
  PermissionKey,
  Product,
  PurchaseInvoice,
  PurchaseQuotation,
  PurchaseRequisition,
  PurchaseReturn,
  SaleOrder,
  SalesChallan,
  SalesQuotation,
  SalesReturn,
  StockMovement,
  StockRequisition,
  StockTransfer,
  Supplier,
} from './types/erp';
import { createInitialSeed, round2 } from './utils/erpEngine';

const app = initializeApp(firebaseConfig);
export const firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const firebaseAuth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const WORKSPACE_ID = 'provet_main';
export const BOOTSTRAPPED_ADMIN_EMAIL = 'shikhboacademyonline@gmail.com';
const ALL_PERMISSIONS: PermissionKey[] = ['dashboard', 'stock', 'purchase', 'sales', 'account', 'reports', 'hr'];

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo:
        firebaseAuth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<'online' | 'offline'> {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
    return 'online';
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return 'offline';
    }
    return 'online';
  }
}

// Defensive blueprint bounds helpers matching firebase-blueprint.json & firestore.rules
function clampStr(value: unknown, maxLen: number, fallback = ''): string {
  const s = String(value ?? fallback).trim();
  return s.slice(0, maxLen);
}

function sanitizeId(raw: string, maxLen = 128): string {
  const cleaned = String(raw || 'item')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, maxLen);
  return cleaned || 'item';
}

// Recursive lossless sanitizer for Firestore Maps & Lists (no undefined, bounded lengths, <= 40 top-level keys)
function sanitizeValue(val: unknown, depth = 0): unknown {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.slice(0, 1200);
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val === 'boolean') return val;
  if (depth >= 4) return String(val).slice(0, 300);

  if (Array.isArray(val)) {
    return val.slice(0, 200).map((item) => {
      if (item === undefined || item === null) return '';
      if (typeof item === 'object' && !Array.isArray(item)) {
        const inner: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(item as Record<string, unknown>).slice(0, 30)) {
          if (v !== undefined) {
            inner[sanitizeId(k, 48)] = sanitizeValue(v, depth + 1);
          }
        }
        return inner;
      }
      return sanitizeValue(item, depth + 1);
    });
  }

  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>).slice(0, 38)) {
      if (v !== undefined) {
        out[sanitizeId(k, 48)] = sanitizeValue(v, depth + 1);
      }
    }
    return out;
  }

  return String(val).slice(0, 300);
}

function sanitizeRecordData(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj).slice(0, 38)) {
    if (val === undefined) continue;
    out[sanitizeId(key, 48)] = sanitizeValue(val, 1);
  }
  return out;
}

type FirestoreRecordStatus = 'Active' | 'Draft' | 'Posted' | 'Approved' | 'Completed' | 'Closed';

interface RecordToSync {
  recordId: string;
  collectionType: string;
  refNo: string;
  title: string;
  date: string;
  amount: number;
  status: FirestoreRecordStatus;
  data: Record<string, unknown>;
}

// Track existing doc metadata in-memory so updates preserve createdAt identically & skip unchanged docs
const knownAccountCreatedAt = new Map<string, Timestamp>();
const knownRecordCreatedAt = new Map<string, Timestamp>();
const lastSyncedRecordSignatures = new Map<string, string>();
const lastSyncedAccountSignatures = new Map<string, string>();

function serializeForDiff(val: unknown): string {
  return JSON.stringify(val);
}

function buildRecordsFromDb(erpDb: ERPDatabase): RecordToSync[] {
  const mapLeaveStatus = (s: LeaveRequest['status']): FirestoreRecordStatus =>
    s === 'Approved' ? 'Approved' : s === 'Rejected' ? 'Closed' : 'Draft';

  const mapReqStatus = (s: string): FirestoreRecordStatus =>
    s === 'Approved' ? 'Approved' : s === 'Issued' || s === 'Ordered' ? 'Completed' : 'Draft';

  const mapOrderStatus = (s: SaleOrder['status']): FirestoreRecordStatus =>
    s === 'Completed' ? 'Completed' : s === 'Challan Created' ? 'Posted' : 'Active';

  const mapEmpStatus = (s: Employee['status']): FirestoreRecordStatus =>
    s === 'Active' ? 'Active' : s === 'On Leave' ? 'Draft' : 'Closed';

  return [
    ...erpDb.suppliers.map((s) => ({
      recordId: sanitizeId(`sup_${s.id}`),
      collectionType: 'supplier',
      refNo: clampStr(s.code, 64),
      title: clampStr(s.name, 160, 'Supplier'),
      date: clampStr(s.createdAt, 20),
      amount: Number(s.openingBalance) || 0,
      status: 'Active' as const,
      data: sanitizeRecordData(s),
    })),
    ...erpDb.customers.map((c) => ({
      recordId: sanitizeId(`cust_${c.id}`),
      collectionType: 'customer',
      refNo: clampStr(c.code, 64),
      title: clampStr(c.name, 160, 'Customer'),
      date: clampStr(c.createdAt, 20),
      amount: Number(c.openingBalance) || 0,
      status: 'Active' as const,
      data: sanitizeRecordData(c),
    })),
    ...erpDb.products.map((p) => ({
      recordId: sanitizeId(`prod_${p.id}`),
      collectionType: 'product',
      refNo: clampStr(p.sku, 64),
      title: clampStr(p.name, 160, 'Product'),
      date: clampStr(p.createdAt, 20),
      amount: round2(Number(p.stockQty) * Number(p.weightedAvgCost) || 0),
      status: 'Active' as const,
      data: sanitizeRecordData(p),
    })),
    ...erpDb.stockMovements.map((m) => ({
      recordId: sanitizeId(`mov_${m.id}`),
      collectionType: 'stockMovement',
      refNo: clampStr(m.refNo, 64),
      title: clampStr(m.productName || m.type, 160, 'Movement'),
      date: clampStr(m.date, 20),
      amount: Number(m.totalValue) || 0,
      status: 'Posted' as const,
      data: sanitizeRecordData(m),
    })),
    ...erpDb.stockRequisitions.map((r) => ({
      recordId: sanitizeId(`sreq_${r.id}`),
      collectionType: 'stockRequisition',
      refNo: clampStr(r.reqNo, 64),
      title: clampStr(r.department || r.requestedBy || r.reqNo, 160, 'Stock Requisition'),
      date: clampStr(r.date, 20),
      amount: r.items.length,
      status: mapReqStatus(r.status),
      data: sanitizeRecordData(r),
    })),
    ...erpDb.stockTransfers.map((t) => ({
      recordId: sanitizeId(`st_${t.id}`),
      collectionType: 'stockTransfer',
      refNo: clampStr(t.transferNo, 64),
      title: clampStr(t.productName || t.transferNo, 160, 'Stock Transfer'),
      date: clampStr(t.date, 20),
      amount: Number(t.qty) || 0,
      status: 'Completed' as const,
      data: sanitizeRecordData(t),
    })),
    ...erpDb.damagedRecords.map((d) => ({
      recordId: sanitizeId(`dmg_${d.id}`),
      collectionType: 'damagedRecord',
      refNo: clampStr(d.damageNo, 64),
      title: clampStr(d.productName || d.damageNo, 160, 'Damaged Product'),
      date: clampStr(d.date, 20),
      amount: Number(d.totalLoss) || 0,
      status: 'Posted' as const,
      data: sanitizeRecordData(d),
    })),
    ...erpDb.purchaseRequisitions.map((r) => ({
      recordId: sanitizeId(`pr_${r.id}`),
      collectionType: 'purchaseRequisition',
      refNo: clampStr(r.prNo, 64),
      title: clampStr(r.department || r.requestedBy || r.prNo, 160, 'Purchase Requisition'),
      date: clampStr(r.date, 20),
      amount: r.items.length,
      status: mapReqStatus(r.status),
      data: sanitizeRecordData(r),
    })),
    ...erpDb.purchaseQuotations.map((q) => ({
      recordId: sanitizeId(`pq_${q.id}`),
      collectionType: 'purchaseQuotation',
      refNo: clampStr(q.quotNo, 64),
      title: clampStr(q.supplierName || q.quotNo, 160, 'Purchase Quotation'),
      date: clampStr(q.date, 20),
      amount: Number(q.totalAmount) || 0,
      status: 'Active' as const,
      data: sanitizeRecordData(q),
    })),
    ...erpDb.purchaseInvoices.map((pi) => ({
      recordId: sanitizeId(`pi_${pi.id}`),
      collectionType: 'purchaseInvoice',
      refNo: clampStr(pi.invoiceNo, 64),
      title: clampStr(pi.supplierName || pi.invoiceNo, 160, 'Purchase Invoice'),
      date: clampStr(pi.date, 20),
      amount: Number(pi.netAmount) || 0,
      status: 'Posted' as const,
      data: sanitizeRecordData(pi),
    })),
    ...erpDb.purchaseReturns.map((pr) => ({
      recordId: sanitizeId(`prt_${pr.id}`),
      collectionType: 'purchaseReturn',
      refNo: clampStr(pr.returnNo, 64),
      title: clampStr(pr.supplierName || pr.returnNo, 160, 'Purchase Return'),
      date: clampStr(pr.date, 20),
      amount: Number(pr.totalAmount) || 0,
      status: 'Posted' as const,
      data: sanitizeRecordData(pr),
    })),
    ...erpDb.salesQuotations.map((sq) => ({
      recordId: sanitizeId(`sq_${sq.id}`),
      collectionType: 'salesQuotation',
      refNo: clampStr(sq.quotNo, 64),
      title: clampStr(sq.customerName || sq.quotNo, 160, 'Sales Quotation'),
      date: clampStr(sq.date, 20),
      amount: Number(sq.totalAmount) || 0,
      status: 'Active' as const,
      data: sanitizeRecordData(sq),
    })),
    ...erpDb.saleOrders.map((so) => ({
      recordId: sanitizeId(`so_${so.id}`),
      collectionType: 'saleOrder',
      refNo: clampStr(so.orderNo, 64),
      title: clampStr(so.customerName || so.orderNo, 160, 'Sale Order'),
      date: clampStr(so.date, 20),
      amount: Number(so.totalAmount) || 0,
      status: mapOrderStatus(so.status),
      data: sanitizeRecordData(so),
    })),
    ...erpDb.salesChallans.map((sc) => ({
      recordId: sanitizeId(`sc_${sc.id}`),
      collectionType: 'salesChallan',
      refNo: clampStr(sc.invoiceNo, 64),
      title: clampStr(sc.customerName || sc.challanNo, 160, 'Sales Challan'),
      date: clampStr(sc.date, 20),
      amount: Number(sc.netAmount) || 0,
      status: 'Posted' as const,
      data: sanitizeRecordData(sc),
    })),
    ...erpDb.salesReturns.map((sr) => ({
      recordId: sanitizeId(`srt_${sr.id}`),
      collectionType: 'salesReturn',
      refNo: clampStr(sr.returnNo, 64),
      title: clampStr(sr.customerName || sr.returnNo, 160, 'Sales Return'),
      date: clampStr(sr.date, 20),
      amount: Number(sr.totalAmount) || 0,
      status: 'Posted' as const,
      data: sanitizeRecordData(sr),
    })),
    ...erpDb.journalEntries.map((je) => ({
      recordId: sanitizeId(`je_${je.id}`),
      collectionType: 'journalEntry',
      refNo: clampStr(je.voucherNo, 64),
      title: clampStr(je.narration || je.voucherType, 160, 'Voucher'),
      date: clampStr(je.date, 20),
      amount: round2(je.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)),
      status: 'Posted' as const,
      data: sanitizeRecordData(je),
    })),
    ...erpDb.employees.map((emp) => ({
      recordId: sanitizeId(`emp_${emp.id}`),
      collectionType: 'employee',
      refNo: clampStr(emp.empCode, 64),
      title: clampStr(emp.name, 160, 'Employee'),
      date: clampStr(emp.joinDate, 20),
      amount: Number(emp.basicSalary) || 0,
      status: mapEmpStatus(emp.status),
      data: sanitizeRecordData(emp),
    })),
    ...erpDb.attendance.map((att) => ({
      recordId: sanitizeId(`att_${att.id}`),
      collectionType: 'attendance',
      refNo: clampStr(att.date, 64),
      title: clampStr(att.employeeName || att.date, 160, 'Attendance'),
      date: clampStr(att.date, 20),
      amount: att.status === 'Present' ? 1 : 0,
      status: 'Posted' as const,
      data: sanitizeRecordData(att),
    })),
    ...erpDb.leaves.map((lv) => ({
      recordId: sanitizeId(`lv_${lv.id}`),
      collectionType: 'leave',
      refNo: clampStr(lv.leaveType, 64),
      title: clampStr(lv.employeeName || lv.leaveType, 160, 'Leave Request'),
      date: clampStr(lv.fromDate, 20),
      amount: Number(lv.days) || 0,
      status: mapLeaveStatus(lv.status),
      data: sanitizeRecordData(lv),
    })),
    ...erpDb.payrollRuns.map((pr) => ({
      recordId: sanitizeId(`pr_${pr.id}`),
      collectionType: 'payrollRun',
      refNo: clampStr(pr.runNo, 64),
      title: clampStr(`Payroll ${pr.month}`, 160, 'Payroll Run'),
      date: clampStr(pr.date, 20),
      amount: Number(pr.totalNet) || 0,
      status: 'Posted' as const,
      data: sanitizeRecordData(pr),
    })),
  ];
}

export async function syncErpWorkspaceToFirestore(erpDb: ERPDatabase): Promise<{ syncedCount: number }> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error('Firebase Google Sign-In is required before syncing to Firestore.');
  }
  if (!user.emailVerified) {
    throw new Error('Verified email account required for Firestore sync.');
  }

  const wsPath = `erp_workspaces/${WORKSPACE_ID}`;
  const wsRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID);

  let existingCreatedAt: Timestamp | null = null;
  let existingOwnerId: string | null = null;
  try {
    const existingSnap = await getDoc(wsRef);
    if (existingSnap.exists()) {
      const wsData = existingSnap.data();
      existingCreatedAt = (wsData?.createdAt as Timestamp) || null;
      existingOwnerId = typeof wsData?.ownerId === 'string' ? wsData.ownerId : null;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, wsPath);
  }

  const ownerId = sanitizeId(existingOwnerId || user.uid, 128);
  const isBootstrappedAdmin = user.email === BOOTSTRAPPED_ADMIN_EMAIL;

  // Prime existing createdAt cache on first sync of session if empty
  if (existingOwnerId && knownAccountCreatedAt.size === 0 && knownRecordCreatedAt.size === 0) {
    try {
      const accountsCol = collection(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'accounts');
      const recordsCol = collection(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'records');
      const [accSnap, recSnap] = await Promise.all([
        getDocs(isBootstrappedAdmin ? accountsCol : query(accountsCol, where('ownerId', '==', ownerId))),
        getDocs(isBootstrappedAdmin ? recordsCol : query(recordsCol, where('ownerId', '==', ownerId))),
      ]);
      for (const d of accSnap.docs) {
        const ts = d.data()?.createdAt as Timestamp | undefined;
        if (ts) knownAccountCreatedAt.set(d.id, ts);
      }
      for (const d of recSnap.docs) {
        const ts = d.data()?.createdAt as Timestamp | undefined;
        if (ts) knownRecordCreatedAt.set(d.id, ts);
      }
    } catch {
      // Non-fatal: new docs will still create cleanly
    }
  }

  const records = buildRecordsFromDb(erpDb);
  const currentRecordIds = new Set(records.map((r) => r.recordId));

  type BatchOp = (batch: ReturnType<typeof writeBatch>) => void;
  const operations: BatchOp[] = [];

  const wsPayload = {
    workspaceId: WORKSPACE_ID,
    ownerId,
    companyName: clampStr(erpDb.company.name, 120, 'Provet'),
    tagline: clampStr(erpDb.company.tagline, 200),
    address: clampStr(erpDb.company.address, 300),
    phone: clampStr(erpDb.company.phone, 40),
    email: clampStr(erpDb.company.email, 160),
    currency: clampStr(erpDb.company.currency, 12, 'BDT'),
    recordCount: records.length,
    lastSyncedBy: clampStr(user.email || user.uid, 128),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  operations.push((batch) => batch.set(wsRef, wsPayload));

  for (const acc of erpDb.accounts) {
    const accId = sanitizeId(acc.id, 64);
    const sig = serializeForDiff(acc);
    if (lastSyncedAccountSignatures.get(accId) === sig && knownAccountCreatedAt.has(accId)) {
      continue;
    }
    const accRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'accounts', accId);
    const accCreatedAt = knownAccountCreatedAt.get(accId);
    operations.push((batch) =>
      batch.set(accRef, {
        accountId: accId,
        workspaceId: WORKSPACE_ID,
        ownerId,
        code: clampStr(acc.code, 24),
        name: clampStr(acc.name, 140),
        type: acc.type,
        subType: clampStr(acc.subType, 80),
        openingDebit: Math.max(0, Number(acc.openingDebit) || 0),
        openingCredit: Math.max(0, Number(acc.openingCredit) || 0),
        createdAt: accCreatedAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  }

  for (const rec of records) {
    const sig = serializeForDiff({
      refNo: rec.refNo,
      title: rec.title,
      date: rec.date,
      amount: rec.amount,
      status: rec.status,
      data: rec.data,
    });
    if (lastSyncedRecordSignatures.get(rec.recordId) === sig && knownRecordCreatedAt.has(rec.recordId)) {
      continue;
    }
    const recRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'records', rec.recordId);
    const recCreatedAt = knownRecordCreatedAt.get(rec.recordId);
    operations.push((batch) =>
      batch.set(recRef, {
        recordId: rec.recordId,
        workspaceId: WORKSPACE_ID,
        ownerId,
        collectionType: rec.collectionType,
        refNo: rec.refNo,
        title: rec.title,
        date: rec.date,
        amount: rec.amount,
        status: rec.status,
        data: rec.data,
        createdAt: recCreatedAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  }

  // Delete removed records (only if owner/admin)
  if (isBootstrappedAdmin || ownerId === user.uid) {
    for (const oldRecId of Array.from(knownRecordCreatedAt.keys())) {
      if (!currentRecordIds.has(oldRecId)) {
        const delRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'records', oldRecId);
        operations.push((batch) => batch.delete(delRef));
      }
    }
  }

  try {
    const CHUNK_SIZE = 350;
    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const chunk = operations.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestoreDb);
      for (const op of chunk) {
        op(batch);
      }
      await batch.commit();
    }

    // Update local signature caches after successful commit
    for (const acc of erpDb.accounts) {
      lastSyncedAccountSignatures.set(sanitizeId(acc.id, 64), serializeForDiff(acc));
    }
    for (const rec of records) {
      lastSyncedRecordSignatures.set(
        rec.recordId,
        serializeForDiff({
          refNo: rec.refNo,
          title: rec.title,
          date: rec.date,
          amount: rec.amount,
          status: rec.status,
          data: rec.data,
        })
      );
    }
    for (const oldRecId of Array.from(knownRecordCreatedAt.keys())) {
      if (!currentRecordIds.has(oldRecId)) {
        knownRecordCreatedAt.delete(oldRecId);
        lastSyncedRecordSignatures.delete(oldRecId);
      }
    }

    return { syncedCount: records.length + erpDb.accounts.length + 1 };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, wsPath);
  }
}

export async function resolveFirebaseErpUser(user: User): Promise<ERPUser> {
  if (!user.emailVerified || !user.email) {
    throw new Error('A verified Google email account is required.');
  }

  const isBootstrapped = user.email === BOOTSTRAPPED_ADMIN_EMAIL;
  if (isBootstrapped) {
    return {
      id: user.uid,
      userId: user.email,
      fullName: user.displayName || 'Provet Administrator',
      role: 'Admin',
      permissions: [...ALL_PERMISSIONS],
      active: true,
      createdAt: new Date().toISOString().slice(0, 10),
    };
  }

  try {
    const adminSnap = await getDoc(doc(firestoreDb, 'admins', user.uid));
    if (adminSnap.exists()) {
      return {
        id: user.uid,
        userId: user.email,
        fullName: user.displayName || 'Provet Administrator',
        role: 'Admin',
        permissions: [...ALL_PERMISSIONS],
        active: true,
        createdAt: new Date().toISOString().slice(0, 10),
      };
    }
  } catch {
    // Check workspace/member access next
  }

  const wsRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID);
  const wsSnap = await getDoc(wsRef);
  if (!wsSnap.exists() || wsSnap.data()?.ownerId === user.uid) {
    return {
      id: user.uid,
      userId: user.email,
      fullName: user.displayName || 'Workspace Owner',
      role: 'Admin',
      permissions: [...ALL_PERMISSIONS],
      active: true,
      createdAt: new Date().toISOString().slice(0, 10),
    };
  }

  const memberRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'members', user.uid);
  const memberSnap = await getDoc(memberRef);
  if (memberSnap.exists()) {
    const m = memberSnap.data();
    if (!m.active) {
      throw new Error(`Account ${user.email} is currently disabled in this ERP workspace.`);
    }
    return {
      id: user.uid,
      userId: String(m.email || user.email),
      fullName: String(m.displayName || user.displayName || user.email),
      role: m.role === 'Admin' ? 'Admin' : 'Staff',
      permissions: Array.isArray(m.permissions) ? (m.permissions as PermissionKey[]) : [],
      active: true,
      createdAt: new Date().toISOString().slice(0, 10),
    };
  }

  throw new Error(
    `Access pending for ${user.email} (Firebase UID: ${user.uid}). Ask your Provet Administrator to add your UID in User & Access Control.`
  );
}

export async function loadErpWorkspaceFromFirestore(user: User): Promise<{
  db: ERPDatabase;
  erpUser: ERPUser;
}> {
  const erpUser = await resolveFirebaseErpUser(user);
  const wsPath = `erp_workspaces/${WORKSPACE_ID}`;
  const wsRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID);

  try {
    const wsSnap = await getDoc(wsRef);
    if (!wsSnap.exists()) {
      const seed = createInitialSeed();
      await syncErpWorkspaceToFirestore(seed);
      return { db: seed, erpUser };
    }

    const wsData = wsSnap.data();
    const seed = createInitialSeed();
    const erpDb: ERPDatabase = {
      ...seed,
      company: {
        name: String(wsData.companyName || seed.company.name),
        tagline: String(wsData.tagline || seed.company.tagline),
        address: String(wsData.address || seed.company.address),
        phone: String(wsData.phone || seed.company.phone),
        email: String(wsData.email || seed.company.email),
        currency: String(wsData.currency || seed.company.currency),
      },
    };

    const isBootstrappedAdmin = user.email === BOOTSTRAPPED_ADMIN_EMAIL;
    const isOwner = wsData.ownerId === user.uid;
    const accountsCol = collection(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'accounts');
    const recordsCol = collection(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'records');

    const [accSnap, recSnap] = await Promise.all([
      getDocs(isBootstrappedAdmin || !isOwner ? accountsCol : query(accountsCol, where('ownerId', '==', user.uid))),
      getDocs(isBootstrappedAdmin || !isOwner ? recordsCol : query(recordsCol, where('ownerId', '==', user.uid))),
    ]);

    knownAccountCreatedAt.clear();
    knownRecordCreatedAt.clear();
    lastSyncedAccountSignatures.clear();
    lastSyncedRecordSignatures.clear();

    if (!accSnap.empty) {
      const loadedAccounts: ChartAccount[] = [];
      for (const docSnap of accSnap.docs) {
        const d = docSnap.data();
        if (d.createdAt) knownAccountCreatedAt.set(docSnap.id, d.createdAt as Timestamp);
        const acc: ChartAccount = {
          id: String(d.accountId || docSnap.id),
          code: String(d.code || ''),
          name: String(d.name || ''),
          type: (d.type as ChartAccount['type']) || 'Asset',
          subType: String(d.subType || ''),
          openingDebit: Number(d.openingDebit || 0),
          openingCredit: Number(d.openingCredit || 0),
        };
        loadedAccounts.push(acc);
        lastSyncedAccountSignatures.set(docSnap.id, serializeForDiff(acc));
      }
      loadedAccounts.sort((a, b) => a.code.localeCompare(b.code));
      erpDb.accounts = loadedAccounts;
    }

    for (const docSnap of recSnap.docs) {
      const docData = docSnap.data();
      if (docData.createdAt) knownRecordCreatedAt.set(docSnap.id, docData.createdAt as Timestamp);
      const payload = (docData.data || {}) as Record<string, unknown>;
      const type = String(docData.collectionType || '');

      lastSyncedRecordSignatures.set(
        docSnap.id,
        serializeForDiff({
          refNo: docData.refNo || '',
          title: docData.title || '',
          date: docData.date || '',
          amount: Number(docData.amount || 0),
          status: docData.status || 'Active',
          data: payload,
        })
      );

      switch (type) {
        case 'supplier':
          erpDb.suppliers.push(payload as unknown as Supplier);
          break;
        case 'customer':
          erpDb.customers.push(payload as unknown as Customer);
          break;
        case 'product':
          erpDb.products.push(payload as unknown as Product);
          break;
        case 'stockMovement':
          erpDb.stockMovements.push(payload as unknown as StockMovement);
          break;
        case 'stockRequisition':
          erpDb.stockRequisitions.push(payload as unknown as StockRequisition);
          break;
        case 'stockTransfer':
          erpDb.stockTransfers.push(payload as unknown as StockTransfer);
          break;
        case 'damagedRecord':
          erpDb.damagedRecords.push(payload as unknown as DamagedRecord);
          break;
        case 'purchaseRequisition':
          erpDb.purchaseRequisitions.push(payload as unknown as PurchaseRequisition);
          break;
        case 'purchaseQuotation':
          erpDb.purchaseQuotations.push(payload as unknown as PurchaseQuotation);
          break;
        case 'purchaseInvoice':
          erpDb.purchaseInvoices.push(payload as unknown as PurchaseInvoice);
          break;
        case 'purchaseReturn':
          erpDb.purchaseReturns.push(payload as unknown as PurchaseReturn);
          break;
        case 'salesQuotation':
          erpDb.salesQuotations.push(payload as unknown as SalesQuotation);
          break;
        case 'saleOrder':
          erpDb.saleOrders.push(payload as unknown as SaleOrder);
          break;
        case 'salesChallan':
          erpDb.salesChallans.push(payload as unknown as SalesChallan);
          break;
        case 'salesReturn':
          erpDb.salesReturns.push(payload as unknown as SalesReturn);
          break;
        case 'journalEntry':
          erpDb.journalEntries.push(payload as unknown as JournalEntry);
          break;
        case 'employee':
          erpDb.employees.push(payload as unknown as Employee);
          break;
        case 'attendance':
          erpDb.attendance.push(payload as unknown as AttendanceRecord);
          break;
        case 'leave':
          erpDb.leaves.push(payload as unknown as LeaveRequest);
          break;
        case 'payrollRun':
          erpDb.payrollRuns.push(payload as unknown as PayrollRun);
          break;
        default:
          break;
      }
    }

    return { db: erpDb, erpUser };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, wsPath);
  }
}

export interface CloudMemberUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'Admin' | 'Staff';
  permissions: PermissionKey[];
  active: boolean;
}

export async function listCloudMembers(): Promise<CloudMemberUser[]> {
  const user = firebaseAuth.currentUser;
  if (!user) return [];
  const wsSnap = await getDoc(doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID));
  const ownerId = wsSnap.exists() ? String(wsSnap.data()?.ownerId || user.uid) : user.uid;
  const isBootstrappedAdmin = user.email === BOOTSTRAPPED_ADMIN_EMAIL;
  const membersCol = collection(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'members');
  const snap = await getDocs(isBootstrappedAdmin ? membersCol : query(membersCol, where('ownerId', '==', ownerId)));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: String(data.uid || d.id),
      email: String(data.email || ''),
      displayName: String(data.displayName || ''),
      role: data.role === 'Admin' ? 'Admin' : 'Staff',
      permissions: Array.isArray(data.permissions) ? (data.permissions as PermissionKey[]) : [],
      active: Boolean(data.active),
    };
  });
}

export async function createCloudMember(input: {
  uid: string;
  email: string;
  displayName: string;
  role: 'Admin' | 'Staff';
  permissions: PermissionKey[];
}): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Firebase authentication required');
  const memberId = sanitizeId(input.uid, 128);
  const wsSnap = await getDoc(doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID));
  const ownerId = wsSnap.exists() ? String(wsSnap.data()?.ownerId || user.uid) : user.uid;
  const memberRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'members', memberId);

  await setDoc(memberRef, {
    uid: memberId,
    workspaceId: WORKSPACE_ID,
    ownerId,
    email: clampStr(input.email, 160),
    displayName: clampStr(input.displayName, 120, 'Team Member'),
    role: input.role,
    permissions: input.role === 'Admin' ? [...ALL_PERMISSIONS] : input.permissions.filter((p) => ALL_PERMISSIONS.includes(p)),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCloudMember(
  uid: string,
  patch: {
    displayName?: string;
    role?: 'Admin' | 'Staff';
    permissions?: PermissionKey[];
    active?: boolean;
  }
): Promise<void> {
  const memberId = sanitizeId(uid, 128);
  const memberRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'members', memberId);
  const snap = await getDoc(memberRef);
  if (!snap.exists()) throw new Error('Workspace member not found.');
  const cur = snap.data();
  const nextRole = patch.role ?? (cur.role === 'Admin' ? 'Admin' : 'Staff');
  const nextPerms =
    nextRole === 'Admin'
      ? [...ALL_PERMISSIONS]
      : (patch.permissions ?? (cur.permissions as PermissionKey[])).filter((p) => ALL_PERMISSIONS.includes(p));

  await updateDoc(memberRef, {
    displayName: patch.displayName !== undefined ? clampStr(patch.displayName, 120) : cur.displayName,
    role: nextRole,
    permissions: nextPerms,
    active: patch.active !== undefined ? patch.active : cur.active,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCloudMember(uid: string): Promise<void> {
  const memberId = sanitizeId(uid, 128);
  await deleteDoc(doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'members', memberId));
}
