import fs from 'fs';
import path from 'path';
import type {
  ChartAccount,
  Customer,
  DamagedRecord,
  ERPDatabase,
  JournalEntry,
  JournalLine,
  Product,
  PurchaseInvoice,
  PurchaseReturn,
  SalesChallan,
  SalesReturn,
  Supplier,
} from '../src/types/erp.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'erp-db.json');

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function createInitialSeed(): ERPDatabase {
  const accounts: ChartAccount[] = [
    { id: 'acc-1001', code: '1001', name: 'Cash in Hand', type: 'Asset', subType: 'Current Asset', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-1002', code: '1002', name: 'Cash at Bank (Prime Bank)', type: 'Asset', subType: 'Current Asset', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-1100', code: '1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Current Asset', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-1200', code: '1200', name: 'Inventory Asset', type: 'Asset', subType: 'Current Asset', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-1500', code: '1500', name: 'Office & Warehouse Equipment', type: 'Asset', subType: 'Non-Current Asset', openingDebit: 0, openingCredit: 0 },

    { id: 'acc-2001', code: '2001', name: 'Accounts Payable', type: 'Liability', subType: 'Current Liability', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-2100', code: '2100', name: 'Accrued Expenses & Tax Payable', type: 'Liability', subType: 'Current Liability', openingDebit: 0, openingCredit: 0 },

    { id: 'acc-3001', code: '3001', name: "Owner's Capital", type: 'Equity', subType: 'Equity', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-3100', code: '3100', name: 'Retained Earnings', type: 'Equity', subType: 'Equity', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-3200', code: '3200', name: 'Drawings / Dividends', type: 'Equity', subType: 'Equity', openingDebit: 0, openingCredit: 0 },

    { id: 'acc-4001', code: '4001', name: 'Sales Revenue', type: 'Revenue', subType: 'Operating Revenue', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-4002', code: '4002', name: 'Sales Return & Allowances', type: 'Revenue', subType: 'Contra Revenue', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-4100', code: '4100', name: 'Other Income', type: 'Revenue', subType: 'Non-Operating Revenue', openingDebit: 0, openingCredit: 0 },

    { id: 'acc-5001', code: '5001', name: 'Cost of Goods Sold (COGS)', type: 'Expense', subType: 'Direct Expense', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-5100', code: '5100', name: 'Salaries & Wages Expense', type: 'Expense', subType: 'Operating Expense', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-5200', code: '5200', name: 'Warehouse & Office Rent', type: 'Expense', subType: 'Operating Expense', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-5300', code: '5300', name: 'Utilities & Logistics Expense', type: 'Expense', subType: 'Operating Expense', openingDebit: 0, openingCredit: 0 },
    { id: 'acc-5400', code: '5400', name: 'Inventory Damage & Write-Off', type: 'Expense', subType: 'Operating Expense', openingDebit: 0, openingCredit: 0 },
  ];

  const db: ERPDatabase = {
    company: {
      name: 'Provet',
      tagline: 'Animal Health & Nutrition Enterprise',
      address: 'House 18, Road 12, Banani, Dhaka-1213, Bangladesh',
      phone: '+880 2-55042100',
      email: 'accounts@provet.com.bd',
      currency: '৳',
    },
    accounts,
    journalEntries: [],
    suppliers: [],
    customers: [],
    products: [],
    stockMovements: [],
    stockRequisitions: [],
    stockTransfers: [],
    damagedRecords: [],
    purchaseRequisitions: [],
    purchaseQuotations: [],
    purchaseInvoices: [],
    purchaseReturns: [],
    salesQuotations: [],
    saleOrders: [],
    salesChallans: [],
    salesReturns: [],
    employees: [],
    attendance: [],
    leaves: [],
    payrollRuns: [],
  };

  return db;
}

export function loadDB(): ERPDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createInitialSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  return JSON.parse(raw) as ERPDatabase;
}

export function saveDB(db: ERPDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export function resetDB(): ERPDatabase {
  const seed = createInitialSeed();
  saveDB(seed);
  return seed;
}

function getAccount(db: ERPDatabase, id: string): ChartAccount {
  const acc = db.accounts.find((a) => a.id === id);
  if (!acc) throw new Error(`Account ${id} not found`);
  return acc;
}

export function nextCode(prefix: string, count: number): string {
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

export function applyVoucher(
  db: ERPDatabase,
  input: {
    voucherType: JournalEntry['voucherType'];
    date: string;
    reference?: string;
    partyName?: string;
    narration: string;
    lines: JournalLine[];
  }
): JournalEntry {
  const totalDebit = round2(input.lines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const totalCredit = round2(input.lines.reduce((s, l) => s + Number(l.credit || 0), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Unbalanced voucher: Debit (${totalDebit}) must equal Credit (${totalCredit})`);
  }
  if (totalDebit <= 0) {
    throw new Error('Voucher total must be greater than zero');
  }

  const prefixMap: Record<JournalEntry['voucherType'], string> = {
    Receipt: 'RV-2026',
    Payment: 'PV-2026',
    Journal: 'JV-2026',
    Contra: 'CV-2026',
    Sales: 'SV-2026',
    Purchase: 'PUV-2026',
    Return: 'RTV-2026',
    Damage: 'DMV-2026',
    Payroll: 'PAY-2026',
    Opening: 'OPV-2026',
  };

  const countSame = db.journalEntries.filter((j) => j.voucherType === input.voucherType).length;
  const entry: JournalEntry = {
    id: `je-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    voucherNo: nextCode(prefixMap[input.voucherType], countSame),
    voucherType: input.voucherType,
    date: input.date,
    reference: input.reference,
    partyName: input.partyName,
    narration: input.narration,
    lines: input.lines.map((l) => ({
      ...l,
      debit: round2(Number(l.debit || 0)),
      credit: round2(Number(l.credit || 0)),
    })),
    createdAt: new Date().toISOString(),
  };

  db.journalEntries.push(entry);
  return entry;
}

export function applyAddProduct(
  db: ERPDatabase,
  input: {
    name: string;
    sku?: string;
    supplierId: string;
    group: string;
    category: string;
    location: string;
    unit: string;
    stockQty: number;
    costPrice: number;
    salesPrice: number;
    reorderLevel: number;
  }
): Product {
  const supplier = db.suppliers.find((s) => s.id === input.supplierId);
  const qty = Number(input.stockQty || 0);
  const cost = Number(input.costPrice || 0);
  const product: Product = {
    id: `prd-${Date.now()}`,
    sku: input.sku?.trim() || `PV-${100 + db.products.length + 1}`,
    name: input.name.trim(),
    supplierId: supplier ? supplier.id : '',
    supplierName: supplier ? supplier.name : 'Direct Supplier',
    group: input.group.trim() || 'General',
    category: input.category.trim() || 'Standard',
    location: input.location.trim() || 'Dhaka Central Warehouse',
    unit: input.unit.trim() || 'Pcs',
    stockQty: qty,
    weightedAvgCost: cost,
    salesPrice: Number(input.salesPrice || 0),
    reorderLevel: Number(input.reorderLevel || 10),
    createdAt: new Date().toISOString().slice(0, 10),
  };

  db.products.push(product);

  if (qty > 0 && cost > 0) {
    const val = round2(qty * cost);
    const today = new Date().toISOString().slice(0, 10);
    db.stockMovements.push({
      id: `mov-${Date.now()}`,
      date: today,
      refNo: product.sku,
      type: 'Opening',
      productId: product.id,
      productName: product.name,
      location: product.location,
      inQty: qty,
      outQty: 0,
      unitCost: cost,
      totalValue: val,
      notes: 'Initial stock added from Stock Master',
    });

    const invAcc = getAccount(db, 'acc-1200');
    const capAcc = getAccount(db, 'acc-3001');
    applyVoucher(db, {
      voucherType: 'Journal',
      date: today,
      reference: product.sku,
      narration: `Opening stock capital contribution for ${product.name} (${qty} ${product.unit})`,
      lines: [
        { accountId: invAcc.id, accountCode: invAcc.code, accountName: invAcc.name, debit: val, credit: 0 },
        { accountId: capAcc.id, accountCode: capAcc.code, accountName: capAcc.name, debit: 0, credit: val },
      ],
    });
  }

  return product;
}

export function applyRestockProduct(
  db: ERPDatabase,
  input: {
    productId: string;
    addQty: number;
    costPrice: number;
    location?: string;
    notes?: string;
  }
): Product {
  const product = db.products.find((p) => p.id === input.productId);
  if (!product) throw new Error('Selected product not found.');
  const addQty = Number(input.addQty || 0);
  const costPrice = Number(input.costPrice || 0);
  if (addQty <= 0) throw new Error('Added quantity must be greater than zero.');
  if (costPrice < 0) throw new Error('Cost price cannot be negative.');

  const existingVal = round2(product.stockQty * product.weightedAvgCost);
  const addedVal = round2(addQty * costPrice);
  const newQty = product.stockQty + addQty;
  const newWeightedAvg = newQty > 0 ? round2((existingVal + addedVal) / newQty) : costPrice;

  product.stockQty = newQty;
  product.weightedAvgCost = newWeightedAvg;
  if (input.location?.trim()) {
    product.location = input.location.trim();
  }

  const today = new Date().toISOString().slice(0, 10);
  db.stockMovements.push({
    id: `mov-${Date.now()}`,
    date: today,
    refNo: `ADD-${product.sku}`,
    type: 'Opening',
    productId: product.id,
    productName: product.name,
    location: product.location,
    inQty: addQty,
    outQty: 0,
    unitCost: costPrice,
    totalValue: addedVal,
    notes: input.notes || 'Stock added to existing product via Add Stock',
  });

  if (addedVal > 0) {
    const invAcc = getAccount(db, 'acc-1200');
    const capAcc = getAccount(db, 'acc-3001');
    applyVoucher(db, {
      voucherType: 'Journal',
      date: today,
      reference: product.sku,
      narration: `Stock addition for ${product.name} (+${addQty} ${product.unit})`,
      lines: [
        { accountId: invAcc.id, accountCode: invAcc.code, accountName: invAcc.name, debit: addedVal, credit: 0 },
        { accountId: capAcc.id, accountCode: capAcc.code, accountName: capAcc.name, debit: 0, credit: addedVal },
      ],
    });
  }

  return product;
}

export function applyPurchaseInvoice(
  db: ERPDatabase,
  input: {
    invoiceNo?: string;
    date: string;
    supplierId: string;
    paymentType: 'Cash' | 'Bank' | 'Credit';
    items: PurchaseInvoice['items'];
    discountAmount: number;
    notes: string;
  }
): PurchaseInvoice {
  const supplier = db.suppliers.find((s) => s.id === input.supplierId);
  if (!supplier) throw new Error('Supplier not found');

  const invoiceNo = input.invoiceNo || nextCode('PI-2026', db.purchaseInvoices.length);
  const subTotal = round2(input.items.reduce((s, i) => s + Number(i.qty) * Number(i.unitCost) - Number(i.discount || 0), 0));
  const netAmount = round2(Math.max(0, subTotal - Number(input.discountAmount || 0)));

  const invoice: PurchaseInvoice = {
    id: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    invoiceNo,
    date: input.date,
    supplierId: supplier.id,
    supplierName: supplier.name,
    paymentType: input.paymentType,
    dueDate: input.paymentType === 'Credit' ? addDays(input.date, 30) : input.date,
    items: input.items.map((it) => ({
      ...it,
      total: round2(Number(it.qty) * Number(it.unitCost) - Number(it.discount || 0)),
    })),
    subTotal,
    discountAmount: round2(Number(input.discountAmount || 0)),
    netAmount,
    paidAmount: input.paymentType === 'Credit' ? 0 : netAmount,
    notes: input.notes,
  };

  // Weighted Average Cost update & stock movement
  const totalItemGross = invoice.items.reduce((s, i) => s + i.total, 0);
  const discountRatio = totalItemGross > 0 ? netAmount / totalItemGross : 1;

  for (const item of invoice.items) {
    const product = db.products.find((p) => p.id === item.productId);
    if (!product) continue;
    const effectiveCostTotal = round2(item.total * discountRatio);
    const effectiveUnitCost = item.qty > 0 ? round2(effectiveCostTotal / item.qty) : item.unitCost;

    const existingValue = round2(product.stockQty * product.weightedAvgCost);
    const newQty = product.stockQty + Number(item.qty);
    const newWeightedAvg = newQty > 0 ? round2((existingValue + effectiveCostTotal) / newQty) : effectiveUnitCost;

    product.stockQty = newQty;
    product.weightedAvgCost = newWeightedAvg;

    db.stockMovements.push({
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: invoice.date,
      refNo: invoice.invoiceNo,
      type: 'Purchase',
      productId: product.id,
      productName: product.name,
      location: product.location,
      inQty: Number(item.qty),
      outQty: 0,
      unitCost: effectiveUnitCost,
      totalValue: effectiveCostTotal,
      notes: `Purchased from ${supplier.name} (New Avg: ${newWeightedAvg})`,
    });
  }

  db.purchaseInvoices.push(invoice);

  const invAcc = getAccount(db, 'acc-1200');
  const creditAcc =
    input.paymentType === 'Cash'
      ? getAccount(db, 'acc-1001')
      : input.paymentType === 'Bank'
      ? getAccount(db, 'acc-1002')
      : getAccount(db, 'acc-2001');

  applyVoucher(db, {
    voucherType: 'Purchase',
    date: invoice.date,
    reference: invoice.invoiceNo,
    partyName: supplier.name,
    narration: `Purchase Invoice ${invoice.invoiceNo} from ${supplier.name} (${input.paymentType})`,
    lines: [
      { accountId: invAcc.id, accountCode: invAcc.code, accountName: invAcc.name, debit: netAmount, credit: 0 },
      { accountId: creditAcc.id, accountCode: creditAcc.code, accountName: creditAcc.name, debit: 0, credit: netAmount },
    ],
  });

  return invoice;
}

export function applyPurchaseReturn(
  db: ERPDatabase,
  input: {
    date: string;
    supplierId: string;
    invoiceRef?: string;
    items: PurchaseReturn['items'];
    reason: string;
  }
): PurchaseReturn {
  const supplier = db.suppliers.find((s) => s.id === input.supplierId);
  if (!supplier) throw new Error('Supplier not found');

  for (const item of input.items) {
    const product = db.products.find((p) => p.id === item.productId);
    if (!product) throw new Error(`Product ${item.productName} not found`);
    if (product.stockQty < item.qty) {
      throw new Error(`Insufficient stock to return ${product.name}. Available: ${product.stockQty}`);
    }
  }

  const returnNo = nextCode('PRT-2026', db.purchaseReturns.length);
  const totalAmount = round2(input.items.reduce((s, i) => s + Number(i.qty) * Number(i.unitCost), 0));

  for (const item of input.items) {
    const product = db.products.find((p) => p.id === item.productId)!;
    const itemVal = round2(Number(item.qty) * Number(item.unitCost));
    const currentVal = round2(product.stockQty * product.weightedAvgCost);
    const newQty = product.stockQty - Number(item.qty);
    product.stockQty = newQty;
    if (newQty > 0) {
      product.weightedAvgCost = round2(Math.max(0, (currentVal - itemVal) / newQty));
    }

    db.stockMovements.push({
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: input.date,
      refNo: returnNo,
      type: 'Purchase Return',
      productId: product.id,
      productName: product.name,
      location: product.location,
      inQty: 0,
      outQty: Number(item.qty),
      unitCost: Number(item.unitCost),
      totalValue: itemVal,
      notes: input.reason,
    });
  }

  const pr: PurchaseReturn = {
    id: `prt-${Date.now()}`,
    returnNo,
    date: input.date,
    supplierId: supplier.id,
    supplierName: supplier.name,
    invoiceRef: input.invoiceRef,
    items: input.items.map((i) => ({ ...i, total: round2(i.qty * i.unitCost) })),
    totalAmount,
    reason: input.reason,
  };
  db.purchaseReturns.push(pr);

  const apAcc = getAccount(db, 'acc-2001');
  const invAcc = getAccount(db, 'acc-1200');
  applyVoucher(db, {
    voucherType: 'Return',
    date: input.date,
    reference: returnNo,
    partyName: supplier.name,
    narration: `Purchase Return ${returnNo} to ${supplier.name}: ${input.reason}`,
    lines: [
      { accountId: apAcc.id, accountCode: apAcc.code, accountName: apAcc.name, debit: totalAmount, credit: 0 },
      { accountId: invAcc.id, accountCode: invAcc.code, accountName: invAcc.name, debit: 0, credit: totalAmount },
    ],
  });

  return pr;
}

export function applySalesChallan(
  db: ERPDatabase,
  input: {
    challanNo?: string;
    date: string;
    customerId: string;
    items: SalesChallan['items'];
    paymentTerms: 'Cash' | 'Credit';
    paymentMethod: SalesChallan['paymentMethod'];
    paymentPeriodDays: number;
    otherTerms?: string;
    notes: string;
  }
): SalesChallan {
  const customer = db.customers.find((c) => c.id === input.customerId);
  if (!customer) throw new Error('Customer not found');

  // Strict Stock Availability Check (including Bonus Qty!)
  for (const item of input.items) {
    const product = db.products.find((p) => p.id === item.productId);
    if (!product) throw new Error(`Product ${item.productName} not found`);
    const needed = Number(item.qty) + Number(item.bonusQty || 0);
    if (needed > product.stockQty) {
      const err: Error & { code?: string; available?: number; requested?: number; productName?: string } = new Error(
        `Insufficient stock for ${product.name}. Requested: ${needed} (incl. bonus), Available: ${product.stockQty}`
      );
      err.code = 'INSUFFICIENT_STOCK';
      err.available = product.stockQty;
      err.requested = needed;
      err.productName = product.name;
      throw err;
    }
  }

  const indexNum = db.salesChallans.length;
  const challanNo = input.challanNo || nextCode('SC-2026', indexNum);
  const invoiceNo = nextCode('SI-2026', indexNum);
  const deliveryChallanNo = nextCode('DC-2026', indexNum);

  let subTotal = 0;
  let totalDiscount = 0;
  let totalCogs = 0;

  const processedItems = input.items.map((item) => {
    const product = db.products.find((p) => p.id === item.productId)!;
    const qty = Number(item.qty);
    const bonusQty = Number(item.bonusQty || 0);
    const price = Number(item.salesPrice);
    const gross = round2(qty * price);
    const discAmt = item.discountAmount ? round2(Number(item.discountAmount)) : round2(gross * (Number(item.discountPercent || 0) / 100));
    const lineTotal = round2(Math.max(0, gross - discAmt));
    const unitWeightedCost = product.weightedAvgCost;
    const totalOutQty = qty + bonusQty;
    const costAtSale = round2(totalOutQty * unitWeightedCost);

    subTotal = round2(subTotal + gross);
    totalDiscount = round2(totalDiscount + discAmt);
    totalCogs = round2(totalCogs + costAtSale);

    // Deduct stock
    product.stockQty = product.stockQty - totalOutQty;

    db.stockMovements.push({
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: input.date,
      refNo: challanNo,
      type: 'Sale',
      productId: product.id,
      productName: product.name,
      location: product.location,
      inQty: 0,
      outQty: qty,
      unitCost: unitWeightedCost,
      totalValue: round2(qty * unitWeightedCost),
      notes: `Sales Challan ${challanNo} to ${customer.name}`,
    });

    if (bonusQty > 0) {
      db.stockMovements.push({
        id: `mov-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: input.date,
        refNo: challanNo,
        type: 'Bonus',
        productId: product.id,
        productName: product.name,
        location: product.location,
        inQty: 0,
        outQty: bonusQty,
        unitCost: unitWeightedCost,
        totalValue: round2(bonusQty * unitWeightedCost),
        notes: `Bonus product on ${challanNo}`,
      });
    }

    return {
      ...item,
      qty,
      bonusQty,
      salesPrice: price,
      discountAmount: discAmt,
      lineTotal,
      costAtSale,
    };
  });

  const netAmount = round2(Math.max(0, subTotal - totalDiscount));
  const periodDays = input.paymentTerms === 'Credit' ? Number(input.paymentPeriodDays || 30) : 0;
  const dueDate = addDays(input.date, periodDays);

  const challan: SalesChallan = {
    id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    challanNo,
    invoiceNo,
    deliveryChallanNo,
    date: input.date,
    customerId: customer.id,
    customerName: customer.name,
    customerAddress: customer.address,
    customerMobile: customer.mobile,
    customerEmail: customer.email,
    items: processedItems,
    subTotal,
    totalDiscount,
    netAmount,
    paymentTerms: input.paymentTerms,
    paymentMethod: input.paymentMethod,
    paymentPeriodDays: periodDays,
    dueDate,
    paidAmount: input.paymentTerms === 'Cash' ? netAmount : 0,
    otherTerms: input.otherTerms?.trim() || '',
    notes: input.notes,
  };

  db.salesChallans.push(challan);

  // Double-entry accounting impact hitting Profit & Loss and Balance Sheet:
  // 1) Dr Receivable or Cash/Bank, Cr Sales Revenue
  // 2) Dr COGS, Cr Inventory Asset
  const debitAcc =
    input.paymentTerms === 'Credit'
      ? getAccount(db, 'acc-1100')
      : input.paymentMethod === 'Cash'
      ? getAccount(db, 'acc-1001')
      : getAccount(db, 'acc-1002');
  const salesAcc = getAccount(db, 'acc-4001');
  const cogsAcc = getAccount(db, 'acc-5001');
  const invAcc = getAccount(db, 'acc-1200');

  applyVoucher(db, {
    voucherType: 'Sales',
    date: challan.date,
    reference: challan.challanNo,
    partyName: customer.name,
    narration: `Sales Challan ${challan.challanNo} / Invoice ${challan.invoiceNo} to ${customer.name} (${input.paymentTerms})`,
    lines: [
      { accountId: debitAcc.id, accountCode: debitAcc.code, accountName: debitAcc.name, debit: netAmount, credit: 0 },
      { accountId: salesAcc.id, accountCode: salesAcc.code, accountName: salesAcc.name, debit: 0, credit: netAmount },
      { accountId: cogsAcc.id, accountCode: cogsAcc.code, accountName: cogsAcc.name, debit: totalCogs, credit: 0 },
      { accountId: invAcc.id, accountCode: invAcc.code, accountName: invAcc.name, debit: 0, credit: totalCogs },
    ],
  });

  return challan;
}

export function applySalesReturn(
  db: ERPDatabase,
  input: {
    date: string;
    customerId: string;
    challanRef?: string;
    items: SalesReturn['items'];
    reason: string;
  }
): SalesReturn {
  const customer = db.customers.find((c) => c.id === input.customerId);
  if (!customer) throw new Error('Customer not found');

  const returnNo = nextCode('SRT-2026', db.salesReturns.length);
  let totalAmount = 0;
  let totalCostRestore = 0;

  const processed = input.items.map((item) => {
    const product = db.products.find((p) => p.id === item.productId);
    const qty = Number(item.qty);
    const lineTotal = round2(qty * Number(item.salesPrice));
    totalAmount = round2(totalAmount + lineTotal);

    if (product) {
      const unitCost = product.weightedAvgCost;
      const restoreVal = round2(qty * unitCost);
      totalCostRestore = round2(totalCostRestore + restoreVal);
      product.stockQty += qty;

      db.stockMovements.push({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: input.date,
        refNo: returnNo,
        type: 'Sales Return',
        productId: product.id,
        productName: product.name,
        location: product.location,
        inQty: qty,
        outQty: 0,
        unitCost,
        totalValue: restoreVal,
        notes: input.reason,
      });
    }
    return { ...item, lineTotal };
  });

  const sr: SalesReturn = {
    id: `srt-${Date.now()}`,
    returnNo,
    date: input.date,
    customerId: customer.id,
    customerName: customer.name,
    challanRef: input.challanRef,
    items: processed,
    totalAmount,
    reason: input.reason,
  };
  db.salesReturns.push(sr);

  const srAcc = getAccount(db, 'acc-4002');
  const arAcc = getAccount(db, 'acc-1100');
  const invAcc = getAccount(db, 'acc-1200');
  const cogsAcc = getAccount(db, 'acc-5001');

  const lines: JournalLine[] = [
    { accountId: srAcc.id, accountCode: srAcc.code, accountName: srAcc.name, debit: totalAmount, credit: 0 },
    { accountId: arAcc.id, accountCode: arAcc.code, accountName: arAcc.name, debit: 0, credit: totalAmount },
  ];
  if (totalCostRestore > 0) {
    lines.push(
      { accountId: invAcc.id, accountCode: invAcc.code, accountName: invAcc.name, debit: totalCostRestore, credit: 0 },
      { accountId: cogsAcc.id, accountCode: cogsAcc.code, accountName: cogsAcc.name, debit: 0, credit: totalCostRestore }
    );
  }

  applyVoucher(db, {
    voucherType: 'Return',
    date: input.date,
    reference: returnNo,
    partyName: customer.name,
    narration: `Sales Return ${returnNo} from ${customer.name}: ${input.reason}`,
    lines,
  });

  return sr;
}

export function applyDamagedProduct(
  db: ERPDatabase,
  input: {
    date: string;
    productId: string;
    location: string;
    qty: number;
    reason: string;
  }
): DamagedRecord {
  const product = db.products.find((p) => p.id === input.productId);
  if (!product) throw new Error('Product not found');
  const qty = Number(input.qty);
  if (qty <= 0) throw new Error('Damaged quantity must be positive');
  if (qty > product.stockQty) {
    throw new Error(`Damaged qty (${qty}) exceeds available stock (${product.stockQty})`);
  }

  const damageNo = nextCode('DMG-2026', db.damagedRecords.length);
  const unitCost = product.weightedAvgCost;
  const totalLoss = round2(qty * unitCost);

  product.stockQty -= qty;

  db.stockMovements.push({
    id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: input.date,
    refNo: damageNo,
    type: 'Damage',
    productId: product.id,
    productName: product.name,
    location: input.location || product.location,
    inQty: 0,
    outQty: qty,
    unitCost,
    totalValue: totalLoss,
    notes: input.reason,
  });

  const rec: DamagedRecord = {
    id: `dmg-${Date.now()}`,
    damageNo,
    date: input.date,
    productId: product.id,
    productName: product.name,
    location: input.location || product.location,
    qty,
    unitCost,
    totalLoss,
    reason: input.reason,
  };
  db.damagedRecords.push(rec);

  const dmgAcc = getAccount(db, 'acc-5400');
  const invAcc = getAccount(db, 'acc-1200');
  applyVoucher(db, {
    voucherType: 'Damage',
    date: input.date,
    reference: damageNo,
    narration: `Damaged Stock Write-off (${product.name}, ${qty} ${product.unit}): ${input.reason}`,
    lines: [
      { accountId: dmgAcc.id, accountCode: dmgAcc.code, accountName: dmgAcc.name, debit: totalLoss, credit: 0 },
      { accountId: invAcc.id, accountCode: invAcc.code, accountName: invAcc.name, debit: 0, credit: totalLoss },
    ],
  });

  return rec;
}
