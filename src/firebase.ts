import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { ERPDatabase } from './types/erp';

const app = initializeApp(firebaseConfig);
export const firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const firebaseAuth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const WORKSPACE_ID = 'provet_main';

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

void testConnection();

// Defensive blueprint bounds helpers matching firebase-blueprint.json
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

function sanitizeDataMap(obj: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const entries = Object.entries(obj).slice(0, 38);
  for (const [key, val] of entries) {
    const safeKey = sanitizeId(key, 48);
    if (typeof val === 'string') {
      out[safeKey] = val.slice(0, 300);
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      out[safeKey] = val;
    } else if (typeof val === 'boolean') {
      out[safeKey] = val;
    } else if (Array.isArray(val)) {
      out[safeKey] = val.length;
    } else if (val !== null && val !== undefined) {
      out[safeKey] = String(val).slice(0, 200);
    }
  }
  return out;
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

  type RecordToSync = {
    recordId: string;
    collectionType: string;
    refNo: string;
    title: string;
    date: string;
    amount: number;
    status: 'Active' | 'Draft' | 'Posted' | 'Approved' | 'Completed' | 'Closed';
    data: Record<string, string | number | boolean>;
  };

  const records: RecordToSync[] = [
    ...erpDb.suppliers.map((s) => ({
      recordId: sanitizeId(`sup_${s.id}`),
      collectionType: 'supplier',
      refNo: clampStr(s.code, 64),
      title: clampStr(s.name, 160, 'Supplier'),
      date: clampStr(s.createdAt, 20),
      amount: Number(s.openingBalance) || 0,
      status: 'Active' as const,
      data: sanitizeDataMap({
        mobile: s.mobile,
        telephone: s.telephone,
        email: s.email,
        address: s.address,
      }),
    })),
    ...erpDb.customers.map((c) => ({
      recordId: sanitizeId(`cust_${c.id}`),
      collectionType: 'customer',
      refNo: clampStr(c.code, 64),
      title: clampStr(c.name, 160, 'Customer'),
      date: clampStr(c.createdAt, 20),
      amount: Number(c.openingBalance) || 0,
      status: 'Active' as const,
      data: sanitizeDataMap({
        mobile: c.mobile,
        email: c.email,
        address: c.address,
        creditLimit: c.creditLimit,
      }),
    })),
    ...erpDb.products.map((p) => ({
      recordId: sanitizeId(`prod_${p.id}`),
      collectionType: 'product',
      refNo: clampStr(p.sku, 64),
      title: clampStr(p.name, 160, 'Product'),
      date: clampStr(p.createdAt, 20),
      amount: Number(p.stockQty) * Number(p.weightedAvgCost) || 0,
      status: 'Active' as const,
      data: sanitizeDataMap({
        supplierName: p.supplierName,
        group: p.group,
        category: p.category,
        location: p.location,
        unit: p.unit,
        stockQty: p.stockQty,
        weightedAvgCost: p.weightedAvgCost,
        salesPrice: p.salesPrice,
      }),
    })),
    ...erpDb.purchaseInvoices.map((pi) => ({
      recordId: sanitizeId(`pi_${pi.id}`),
      collectionType: 'purchaseInvoice',
      refNo: clampStr(pi.invoiceNo, 64),
      title: clampStr(pi.supplierName, 160, 'Purchase Invoice'),
      date: clampStr(pi.date, 20),
      amount: Number(pi.netAmount) || 0,
      status: 'Posted' as const,
      data: sanitizeDataMap({
        paymentType: pi.paymentType,
        paidAmount: pi.paidAmount,
        itemCount: pi.items.length,
      }),
    })),
    ...erpDb.salesChallans.map((sc) => ({
      recordId: sanitizeId(`sc_${sc.id}`),
      collectionType: 'salesChallan',
      refNo: clampStr(sc.invoiceNo, 64),
      title: clampStr(sc.customerName, 160, 'Sales Challan'),
      date: clampStr(sc.date, 20),
      amount: Number(sc.netAmount) || 0,
      status: 'Posted' as const,
      data: sanitizeDataMap({
        challanNo: sc.challanNo,
        paymentTerms: sc.paymentTerms,
        paidAmount: sc.paidAmount,
        itemCount: sc.items.length,
      }),
    })),
    ...erpDb.journalEntries.map((je) => ({
      recordId: sanitizeId(`je_${je.id}`),
      collectionType: 'journalEntry',
      refNo: clampStr(je.voucherNo, 64),
      title: clampStr(je.narration || je.voucherType, 160, 'Voucher'),
      date: clampStr(je.date, 20),
      amount: je.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0),
      status: 'Posted' as const,
      data: sanitizeDataMap({
        voucherType: je.voucherType,
        partyName: je.partyName || '',
        reference: je.reference || '',
        lineCount: je.lines.length,
      }),
    })),
    ...erpDb.employees.map((emp) => ({
      recordId: sanitizeId(`emp_${emp.id}`),
      collectionType: 'employee',
      refNo: clampStr(emp.empCode, 64),
      title: clampStr(emp.name, 160, 'Employee'),
      date: clampStr(emp.joinDate, 20),
      amount: Number(emp.basicSalary) || 0,
      status: emp.status === 'Active' ? ('Active' as const) : ('Closed' as const),
      data: sanitizeDataMap({
        department: emp.department,
        designation: emp.designation,
        phone: emp.phone,
      }),
    })),
    ...erpDb.payrollRuns.map((pr) => ({
      recordId: sanitizeId(`pr_${pr.id}`),
      collectionType: 'payrollRun',
      refNo: clampStr(pr.runNo, 64),
      title: clampStr(`Payroll ${pr.month}`, 160, 'Payroll Run'),
      date: clampStr(pr.date, 20),
      amount: Number(pr.totalNet) || 0,
      status: 'Posted' as const,
      data: sanitizeDataMap({
        month: pr.month,
        paymentMethod: pr.paymentMethod,
        totalGross: pr.totalGross,
        totalDeductions: pr.totalDeductions,
      }),
    })),
  ];

  // Atomic workspace + accounts + records write via batches (<= 400 writes per batch)
  const ops: Array<() => void> = [];
  const batch = writeBatch(firestoreDb);

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

  batch.set(wsRef, wsPayload);

  for (const acc of erpDb.accounts.slice(0, 100)) {
    const accId = sanitizeId(acc.id, 64);
    const accRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'accounts', accId);
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const rec of records.slice(0, 250)) {
    const recRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID, 'records', rec.recordId);
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  void ops;

  try {
    await batch.commit();
    return { syncedCount: erpDb.accounts.length + Math.min(records.length, 250) + 1 };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, wsPath);
  }
}
