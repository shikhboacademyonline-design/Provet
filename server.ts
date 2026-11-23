import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  authenticateUser,
  claimInitialAdmin,
  createERPUser,
  isAdminSetupRequired,
  issueSessionToken,
  listPublicUsers,
  updateERPUser,
  verifySessionToken,
} from './server/auth.ts';
import {
  applyAddProduct,
  applyDamagedProduct,
  applyPurchaseInvoice,
  applyPurchaseReturn,
  applyRestockProduct,
  applySalesChallan,
  applySalesReturn,
  applyVoucher,
  loadDB,
  nextCode,
  resetDB,
  saveDB,
} from './server/db.ts';
import type { ERPUser, PermissionKey } from './src/types/erp.ts';

const PORT = Number(process.env.PORT) || 3000;

type AuthedRequest = express.Request & { user?: ERPUser };

function extractBearer(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const user = verifySessionToken(token);
  if (!user) return res.status(401).json({ error: 'Session expired or invalid' });
  req.user = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Administrator privileges required' });
  }
  next();
}

function requirePermission(perm: PermissionKey) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'Admin' || req.user.permissions.includes(perm)) {
      return next();
    }
    return res.status(403).json({ error: `Access denied: requires "${perm}" permission` });
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // --- AUTHENTICATION & BOOTSTRAP ---
  app.get('/api/auth/status', (_req, res) => {
    res.json({ setupRequired: isAdminSetupRequired() });
  });

  app.post('/api/auth/setup-admin', (req, res) => {
    try {
      const { userId, fullName, password } = req.body;
      const user = claimInitialAdmin({ userId, fullName, password });
      const token = issueSessionToken(user);
      res.status(201).json({ token, user });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { userId, password } = req.body;
    const user = authenticateUser(String(userId || ''), String(password || ''));
    if (!user) {
      return res.status(401).json({ error: 'Invalid User ID or Password, or account is inactive.' });
    }
    const token = issueSessionToken(user);
    res.json({ token, user });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  // --- ADMIN USER & ACCESS MANAGEMENT ---
  app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
    res.json({ users: listPublicUsers() });
  });

  app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    try {
      const user = createERPUser(req.body);
      res.status(201).json({ user, users: listPublicUsers() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const user = updateERPUser(req.params.id, req.body);
      res.json({ user, users: listPublicUsers() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- ERP STATE (Protected) ---
  app.get('/api/erp/state', requireAuth, (_req, res) => {
    try {
      const db = loadDB();
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/reset', requireAuth, requireAdmin, (_req, res) => {
    try {
      const db = resetDB();
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- STOCK MODULE ---
  app.post('/api/erp/products', requireAuth, requirePermission('stock'), (req, res) => {
    try {
      const db = loadDB();
      const product = applyAddProduct(db, req.body);
      saveDB(db);
      res.status(201).json({ product, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/products/restock', requireAuth, requirePermission('stock'), (req, res) => {
    try {
      const db = loadDB();
      const product = applyRestockProduct(db, req.body);
      saveDB(db);
      res.status(200).json({ product, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put('/api/erp/products/:id/price', requireAuth, requirePermission('sales'), (req, res) => {
    try {
      const db = loadDB();
      const prod = db.products.find((p) => p.id === req.params.id);
      if (!prod) return res.status(404).json({ error: 'Product not found' });
      prod.salesPrice = Number(req.body.salesPrice);
      saveDB(db);
      res.json({ product: prod, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/stock-requisitions', requireAuth, requirePermission('stock'), (req, res) => {
    try {
      const db = loadDB();
      const rec = {
        id: `sreq-${Date.now()}`,
        reqNo: nextCode('SR-2026', db.stockRequisitions.length),
        ...req.body,
      };
      db.stockRequisitions.push(rec);
      saveDB(db);
      res.status(201).json({ record: rec, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/stock-transfers', requireAuth, requirePermission('stock'), (req, res) => {
    try {
      const db = loadDB();
      const { date, productId, fromLocation, toLocation, qty, notes } = req.body;
      const product = db.products.find((p) => p.id === productId);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      const transferQty = Number(qty);
      if (transferQty <= 0 || transferQty > product.stockQty) {
        return res.status(400).json({ error: `Invalid transfer qty. Available: ${product.stockQty}` });
      }
      const transferNo = nextCode('ST-2026', db.stockTransfers.length);
      const transfer = {
        id: `st-${Date.now()}`,
        transferNo,
        date,
        productId: product.id,
        productName: product.name,
        fromLocation: fromLocation || product.location,
        toLocation,
        qty: transferQty,
        notes: notes || '',
      };
      product.location = toLocation;
      db.stockTransfers.push(transfer);
      db.stockMovements.push(
        {
          id: `mov-to-${Date.now()}`,
          date,
          refNo: transferNo,
          type: 'Transfer Out',
          productId: product.id,
          productName: product.name,
          location: transfer.fromLocation,
          inQty: 0,
          outQty: transferQty,
          unitCost: product.weightedAvgCost,
          totalValue: Math.round(transferQty * product.weightedAvgCost * 100) / 100,
          notes: `Transferred to ${toLocation}`,
        },
        {
          id: `mov-ti-${Date.now() + 1}`,
          date,
          refNo: transferNo,
          type: 'Transfer In',
          productId: product.id,
          productName: product.name,
          location: toLocation,
          inQty: transferQty,
          outQty: 0,
          unitCost: product.weightedAvgCost,
          totalValue: Math.round(transferQty * product.weightedAvgCost * 100) / 100,
          notes: `Received from ${transfer.fromLocation}`,
        }
      );
      saveDB(db);
      res.status(201).json({ transfer, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/damaged-products', requireAuth, requirePermission('stock'), (req, res) => {
    try {
      const db = loadDB();
      const record = applyDamagedProduct(db, req.body);
      saveDB(db);
      res.status(201).json({ record, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- PURCHASE MODULE ---
  app.post('/api/erp/suppliers', requireAuth, requirePermission('purchase'), (req, res) => {
    try {
      const db = loadDB();
      const supplier = {
        id: `sup-${Date.now()}`,
        code: nextCode('SUP', db.suppliers.length),
        name: req.body.name,
        address: req.body.address || '',
        mobile: req.body.mobile || '',
        telephone: req.body.telephone || '',
        email: req.body.email || '',
        openingBalance: Number(req.body.openingBalance || 0),
        createdAt: new Date().toISOString().slice(0, 10),
      };
      db.suppliers.push(supplier);
      saveDB(db);
      res.status(201).json({ supplier, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/purchase-requisitions', requireAuth, requirePermission('purchase'), (req, res) => {
    try {
      const db = loadDB();
      const pr = {
        id: `pr-${Date.now()}`,
        prNo: nextCode('PR-2026', db.purchaseRequisitions.length),
        ...req.body,
      };
      db.purchaseRequisitions.push(pr);
      saveDB(db);
      res.status(201).json({ pr, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/purchase-quotations', requireAuth, requirePermission('purchase'), (req, res) => {
    try {
      const db = loadDB();
      const supplier = db.suppliers.find((s) => s.id === req.body.supplierId);
      const pq = {
        id: `pq-${Date.now()}`,
        quotNo: nextCode('PQ-2026', db.purchaseQuotations.length),
        supplierName: supplier?.name || req.body.supplierName || '',
        ...req.body,
      };
      db.purchaseQuotations.push(pq);
      saveDB(db);
      res.status(201).json({ pq, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/purchase-invoices', requireAuth, (req: AuthedRequest, res) => {
    // Allow either 'purchase' or 'stock' permission (since Stock Purchase uses this route)
    if (
      req.user?.role !== 'Admin' &&
      !req.user?.permissions.includes('purchase') &&
      !req.user?.permissions.includes('stock')
    ) {
      return res.status(403).json({ error: 'Access denied: requires purchase or stock permission' });
    }
    try {
      const db = loadDB();
      const invoice = applyPurchaseInvoice(db, req.body);
      saveDB(db);
      res.status(201).json({ invoice, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/purchase-returns', requireAuth, requirePermission('purchase'), (req, res) => {
    try {
      const db = loadDB();
      const ret = applyPurchaseReturn(db, req.body);
      saveDB(db);
      res.status(201).json({ ret, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- SALES MODULE ---
  app.post('/api/erp/customers', requireAuth, requirePermission('sales'), (req, res) => {
    try {
      const db = loadDB();
      const customer = {
        id: `cus-${Date.now()}`,
        code: nextCode('CUS', db.customers.length),
        name: req.body.name,
        address: req.body.address || '',
        mobile: req.body.mobile || '',
        telephone: req.body.telephone || '',
        email: req.body.email || '',
        creditLimit: Number(req.body.creditLimit || 200000),
        openingBalance: Number(req.body.openingBalance || 0),
        createdAt: new Date().toISOString().slice(0, 10),
      };
      db.customers.push(customer);
      saveDB(db);
      res.status(201).json({ customer, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/sales-quotations', requireAuth, requirePermission('sales'), (req, res) => {
    try {
      const db = loadDB();
      const sq = {
        id: `sq-${Date.now()}`,
        quotNo: nextCode('SQ-2026', db.salesQuotations.length),
        ...req.body,
      };
      db.salesQuotations.push(sq);
      saveDB(db);
      res.status(201).json({ sq, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/sale-orders', requireAuth, requirePermission('sales'), (req, res) => {
    try {
      const db = loadDB();
      const so = {
        id: `so-${Date.now()}`,
        orderNo: nextCode('SO-2026', db.saleOrders.length),
        status: 'Confirmed',
        ...req.body,
      };
      db.saleOrders.push(so);
      saveDB(db);
      res.status(201).json({ so, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/sales-challans', requireAuth, requirePermission('sales'), (req, res) => {
    try {
      const db = loadDB();
      const challan = applySalesChallan(db, req.body);
      if (req.body.saleOrderId) {
        const so = db.saleOrders.find((o) => o.id === req.body.saleOrderId);
        if (so) so.status = 'Challan Created';
      }
      saveDB(db);
      res.status(201).json({ challan, db });
    } catch (err) {
      const e = err as Error & { code?: string; available?: number; requested?: number; productName?: string };
      if (e.code === 'INSUFFICIENT_STOCK') {
        return res.status(409).json({
          code: 'INSUFFICIENT_STOCK',
          error: e.message,
          available: e.available,
          requested: e.requested,
          productName: e.productName,
        });
      }
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/erp/sales-returns', requireAuth, requirePermission('sales'), (req, res) => {
    try {
      const db = loadDB();
      const ret = applySalesReturn(db, req.body);
      saveDB(db);
      res.status(201).json({ ret, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- ACCOUNTS / VOUCHERS ---
  app.post('/api/erp/vouchers', requireAuth, requirePermission('account'), (req, res) => {
    try {
      const db = loadDB();
      const entry = applyVoucher(db, req.body);
      saveDB(db);
      res.status(201).json({ entry, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- HR MODULE ---
  app.post('/api/erp/employees', requireAuth, requirePermission('hr'), (req, res) => {
    try {
      const db = loadDB();
      const emp = {
        id: `emp-${Date.now()}`,
        empCode: nextCode('EMP', db.employees.length),
        status: 'Active' as const,
        ...req.body,
        basicSalary: Number(req.body.basicSalary || 0),
        houseRent: Number(req.body.houseRent || 0),
        medicalAllowance: Number(req.body.medicalAllowance || 0),
        transportAllowance: Number(req.body.transportAllowance || 0),
      };
      db.employees.push(emp);
      saveDB(db);
      res.status(201).json({ employee: emp, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/attendance', requireAuth, requirePermission('hr'), (req, res) => {
    try {
      const db = loadDB();
      const { date, records } = req.body as {
        date: string;
        records: { employeeId: string; status: 'Present' | 'Late' | 'Absent' | 'Leave'; checkIn?: string; checkOut?: string }[];
      };
      db.attendance = db.attendance.filter((a) => a.date !== date);
      for (const r of records) {
        const emp = db.employees.find((e) => e.id === r.employeeId);
        if (!emp) continue;
        db.attendance.push({
          id: `att-${date}-${emp.id}`,
          date,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          status: r.status,
          checkIn: r.checkIn || (r.status === 'Absent' || r.status === 'Leave' ? '-' : '09:00'),
          checkOut: r.checkOut || (r.status === 'Absent' || r.status === 'Leave' ? '-' : '17:30'),
        });
      }
      saveDB(db);
      res.status(201).json({ db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/leaves', requireAuth, requirePermission('hr'), (req, res) => {
    try {
      const db = loadDB();
      const emp = db.employees.find((e) => e.id === req.body.empId);
      const leave = {
        id: `lv-${Date.now()}`,
        employeeName: emp?.name || '',
        department: emp?.department || '',
        status: 'Pending' as const,
        ...req.body,
        days: Number(req.body.days || 1),
      };
      db.leaves.push(leave);
      saveDB(db);
      res.status(201).json({ leave, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/erp/leaves/:id', requireAuth, requirePermission('hr'), (req, res) => {
    try {
      const db = loadDB();
      const lv = db.leaves.find((l) => l.id === req.params.id);
      if (!lv) return res.status(404).json({ error: 'Leave not found' });
      lv.status = req.body.status;
      saveDB(db);
      res.json({ leave: lv, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/payroll', requireAuth, requirePermission('hr'), (req, res) => {
    try {
      const db = loadDB();
      const { month, date, paymentMethod, entries, postToAccounts } = req.body;
      const totalGross = entries.reduce((s: number, e: { basicSalary: number; allowances: number; overtime: number }) => s + e.basicSalary + e.allowances + e.overtime, 0);
      const totalDeductions = entries.reduce((s: number, e: { deductions: number }) => s + e.deductions, 0);
      const totalNet = entries.reduce((s: number, e: { netSalary: number }) => s + e.netSalary, 0);
      const runNo = nextCode('PRUN-2026', db.payrollRuns.length);

      let voucherNo: string | undefined;
      if (postToAccounts && totalNet > 0) {
        const salAcc = db.accounts.find((a) => a.id === 'acc-5100')!;
        const payAcc = db.accounts.find((a) => a.id === (paymentMethod === 'Cash' ? 'acc-1001' : 'acc-1002'))!;
        const je = applyVoucher(db, {
          voucherType: 'Payroll',
          date,
          reference: runNo,
          narration: `Staff Payroll Disbursement for ${month} (${entries.length} employees)`,
          lines: [
            { accountId: salAcc.id, accountCode: salAcc.code, accountName: salAcc.name, debit: totalNet, credit: 0 },
            { accountId: payAcc.id, accountCode: payAcc.code, accountName: payAcc.name, debit: 0, credit: totalNet },
          ],
        });
        voucherNo = je.voucherNo;
      }

      const run = {
        id: `pay-${Date.now()}`,
        runNo,
        month,
        date,
        paymentMethod,
        entries,
        totalGross,
        totalDeductions,
        totalNet,
        postedToAccounts: Boolean(postToAccounts),
        voucherNo,
      };
      db.payrollRuns.push(run);
      saveDB(db);
      res.status(201).json({ run, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/erp/payroll/:id/post', requireAuth, requirePermission('hr'), (req, res) => {
    try {
      const db = loadDB();
      const run = db.payrollRuns.find((r) => r.id === req.params.id);
      if (!run) return res.status(404).json({ error: 'Payroll run not found' });
      if (run.postedToAccounts) return res.json({ run, db });

      const salAcc = db.accounts.find((a) => a.id === 'acc-5100')!;
      const payAcc = db.accounts.find((a) => a.id === (run.paymentMethod === 'Cash' ? 'acc-1001' : 'acc-1002'))!;
      const je = applyVoucher(db, {
        voucherType: 'Payroll',
        date: run.date,
        reference: run.runNo,
        narration: `Staff Payroll Disbursement for ${run.month} (${run.entries.length} employees)`,
        lines: [
          { accountId: salAcc.id, accountCode: salAcc.code, accountName: salAcc.name, debit: run.totalNet, credit: 0 },
          { accountId: payAcc.id, accountCode: payAcc.code, accountName: payAcc.name, debit: 0, credit: run.totalNet },
        ],
      });
      run.postedToAccounts = true;
      run.voucherNo = je.voucherNo;
      saveDB(db);
      res.json({ run, db });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Ensure unknown /api/* routes always return JSON instead of SPA HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Vite middleware or production static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Provet ERP server listening on http://localhost:${PORT}`);
  });
}

startServer();
