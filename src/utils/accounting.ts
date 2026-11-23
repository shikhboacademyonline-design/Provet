import type { AccountType, ERPDatabase } from '../types/erp';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(amount: number, symbol = '৳'): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `(${symbol}${formatted})` : `${symbol}${formatted}`;
}

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export function computeTrialBalance(db: ERPDatabase, fromDate: string, toDate: string) {
  const rows: TrialBalanceRow[] = db.accounts.map((acc) => {
    let opDr = acc.openingDebit;
    let opCr = acc.openingCredit;
    let perDr = 0;
    let perCr = 0;

    for (const je of db.journalEntries) {
      for (const line of je.lines) {
        if (line.accountId !== acc.id) continue;
        if (je.date < fromDate) {
          opDr += line.debit;
          opCr += line.credit;
        } else if (je.date >= fromDate && je.date <= toDate) {
          perDr += line.debit;
          perCr += line.credit;
        }
      }
    }

    const netOp = round2(opDr - opCr);
    const openingDebit = netOp > 0 ? netOp : 0;
    const openingCredit = netOp < 0 ? Math.abs(netOp) : 0;

    const netClose = round2(openingDebit - openingCredit + perDr - perCr);
    const closingDebit = netClose > 0 ? netClose : 0;
    const closingCredit = netClose < 0 ? Math.abs(netClose) : 0;

    return {
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      openingDebit: round2(openingDebit),
      openingCredit: round2(openingCredit),
      periodDebit: round2(perDr),
      periodCredit: round2(perCr),
      closingDebit: round2(closingDebit),
      closingCredit: round2(closingCredit),
    };
  });

  const nonZeroRows = rows.filter(
    (r) => r.openingDebit || r.openingCredit || r.periodDebit || r.periodCredit || r.closingDebit || r.closingCredit
  );

  const totals = nonZeroRows.reduce(
    (acc, r) => ({
      openingDebit: round2(acc.openingDebit + r.openingDebit),
      openingCredit: round2(acc.openingCredit + r.openingCredit),
      periodDebit: round2(acc.periodDebit + r.periodDebit),
      periodCredit: round2(acc.periodCredit + r.periodCredit),
      closingDebit: round2(acc.closingDebit + r.closingDebit),
      closingCredit: round2(acc.closingCredit + r.closingCredit),
    }),
    { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 }
  );

  return { rows: nonZeroRows, totals };
}

export function computeProfitAndLoss(db: ERPDatabase, fromDate: string, toDate: string) {
  const balances = new Map<string, number>();

  for (const acc of db.accounts) {
    let net = 0;
    for (const je of db.journalEntries) {
      if (je.date < fromDate || je.date > toDate) continue;
      for (const line of je.lines) {
        if (line.accountId !== acc.id) continue;
        if (acc.type === 'Revenue') {
          net += line.credit - line.debit;
        } else if (acc.type === 'Expense') {
          net += line.debit - line.credit;
        }
      }
    }
    balances.set(acc.id, round2(net));
  }

  const salesRevenue = balances.get('acc-4001') || 0;
  const salesReturns = -(balances.get('acc-4002') || 0); // Contra revenue recorded as debit
  const netSales = round2(salesRevenue - salesReturns);
  const otherIncome = balances.get('acc-4100') || 0;

  const cogs = balances.get('acc-5001') || 0;
  const grossProfit = round2(netSales - cogs);

  const operatingExpenses = db.accounts
    .filter((a) => a.type === 'Expense' && a.id !== 'acc-5001')
    .map((a) => ({ code: a.code, name: a.name, amount: balances.get(a.id) || 0 }))
    .filter((e) => e.amount !== 0);

  const totalOpEx = round2(operatingExpenses.reduce((s, e) => s + e.amount, 0));
  const netProfit = round2(grossProfit + otherIncome - totalOpEx);

  return {
    salesRevenue,
    salesReturns,
    netSales,
    otherIncome,
    cogs,
    grossProfit,
    operatingExpenses,
    totalOpEx,
    netProfit,
  };
}

export function computeBalanceSheet(db: ERPDatabase, toDate: string) {
  const { rows } = computeTrialBalance(db, '1900-01-01', toDate);
  const pnl = computeProfitAndLoss(db, '1900-01-01', toDate);

  const getBal = (accId: string) => {
    const r = rows.find((x) => x.accountId === accId);
    if (!r) return 0;
    return round2(r.closingDebit - r.closingCredit);
  };

  const nonCurrentAssets = db.accounts
    .filter((a) => a.type === 'Asset' && a.subType === 'Non-Current Asset')
    .map((a) => ({ code: a.code, name: a.name, amount: getBal(a.id) }))
    .filter((x) => x.amount !== 0);

  const currentAssets = db.accounts
    .filter((a) => a.type === 'Asset' && a.subType === 'Current Asset')
    .map((a) => ({ code: a.code, name: a.name, amount: getBal(a.id) }))
    .filter((x) => x.amount !== 0);

  const totalNonCurrentAssets = round2(nonCurrentAssets.reduce((s, a) => s + a.amount, 0));
  const totalCurrentAssets = round2(currentAssets.reduce((s, a) => s + a.amount, 0));
  const totalAssets = round2(totalNonCurrentAssets + totalCurrentAssets);

  const currentLiabilities = db.accounts
    .filter((a) => a.type === 'Liability')
    .map((a) => ({ code: a.code, name: a.name, amount: round2(-getBal(a.id)) }))
    .filter((x) => x.amount !== 0);

  const totalLiabilities = round2(currentLiabilities.reduce((s, l) => s + l.amount, 0));

  const capital = round2(-getBal('acc-3001'));
  const openingRetained = round2(-getBal('acc-3100'));
  const drawings = round2(getBal('acc-3200'));
  const currentPeriodProfit = pnl.netProfit;
  const closingRetainedEarnings = round2(openingRetained + currentPeriodProfit - drawings);
  const totalEquity = round2(capital + closingRetainedEarnings);
  const totalLiabilitiesAndEquity = round2(totalLiabilities + totalEquity);

  return {
    nonCurrentAssets,
    currentAssets,
    totalNonCurrentAssets,
    totalCurrentAssets,
    totalAssets,
    currentLiabilities,
    totalLiabilities,
    capital,
    openingRetained,
    currentPeriodProfit,
    drawings,
    closingRetainedEarnings,
    totalEquity,
    totalLiabilitiesAndEquity,
  };
}

export function computeRetainedEarnings(db: ERPDatabase, fromDate: string, toDate: string) {
  const priorPnl = computeProfitAndLoss(db, '1900-01-01', addOneDay(fromDate, -1));
  const periodPnl = computeProfitAndLoss(db, fromDate, toDate);

  const reAcc = db.accounts.find((a) => a.id === 'acc-3100');
  const drawAcc = db.accounts.find((a) => a.id === 'acc-3200');
  let baseOpeningRE = (reAcc?.openingCredit || 0) - (reAcc?.openingDebit || 0);
  let periodDrawings = 0;

  for (const je of db.journalEntries) {
    for (const line of je.lines) {
      if (line.accountId === 'acc-3100' && je.date < fromDate) {
        baseOpeningRE += line.credit - line.debit;
      }
      if (line.accountId === 'acc-3200') {
        if (je.date < fromDate) {
          baseOpeningRE -= line.debit - line.credit;
        } else if (je.date <= toDate) {
          periodDrawings += line.debit - line.credit;
        }
      }
    }
  }

  const openingRetainedEarnings = round2(baseOpeningRE + priorPnl.netProfit);
  const netProfitForPeriod = periodPnl.netProfit;
  const closingRetainedEarnings = round2(openingRetainedEarnings + netProfitForPeriod - periodDrawings);

  return {
    openingRetainedEarnings,
    netProfitForPeriod,
    periodDrawings: round2(periodDrawings),
    closingRetainedEarnings,
  };
}

export interface ReceiptPaymentLine {
  date: string;
  voucherNo: string;
  voucherType: string;
  particulars: string;
  mode: string;
  amount: number;
}

export interface ReceiptAndPaymentSummary {
  openingCash: number;
  openingBank: number;
  openingTotal: number;
  receipts: ReceiptPaymentLine[];
  totalReceipts: number;
  payments: ReceiptPaymentLine[];
  totalPayments: number;
  closingCash: number;
  closingBank: number;
  closingTotal: number;
}

export function computeReceiptAndPayment(
  db: ERPDatabase,
  fromDate: string,
  toDate: string
): ReceiptAndPaymentSummary {
  const cashAcc = db.accounts.find((a) => a.id === 'acc-1001');
  const bankAcc = db.accounts.find((a) => a.id === 'acc-1002');

  let openingCash = (cashAcc?.openingDebit || 0) - (cashAcc?.openingCredit || 0);
  let openingBank = (bankAcc?.openingDebit || 0) - (bankAcc?.openingCredit || 0);

  for (const je of db.journalEntries) {
    if (je.date >= fromDate) continue;
    for (const line of je.lines) {
      if (line.accountId === 'acc-1001') openingCash += line.debit - line.credit;
      if (line.accountId === 'acc-1002') openingBank += line.debit - line.credit;
    }
  }

  openingCash = round2(openingCash);
  openingBank = round2(openingBank);
  const openingTotal = round2(openingCash + openingBank);

  const receipts: ReceiptPaymentLine[] = [];
  const payments: ReceiptPaymentLine[] = [];

  let periodCashNet = 0;
  let periodBankNet = 0;

  const sortedEntries = [...db.journalEntries]
    .filter((je) => je.date >= fromDate && je.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.voucherNo.localeCompare(b.voucherNo));

  for (const je of sortedEntries) {
    let cashChange = 0;
    let bankChange = 0;
    const counterNames: string[] = [];

    for (const line of je.lines) {
      if (line.accountId === 'acc-1001') {
        cashChange += line.debit - line.credit;
      } else if (line.accountId === 'acc-1002') {
        bankChange += line.debit - line.credit;
      } else if (!counterNames.includes(line.accountName)) {
        counterNames.push(line.accountName);
      }
    }

    periodCashNet += cashChange;
    periodBankNet += bankChange;

    const netCashFlow = round2(cashChange + bankChange);
    if (Math.abs(netCashFlow) < 0.01) continue; // Internal Cash <-> Bank contra transfers net to zero in combined total

    const mode =
      Math.abs(cashChange) > 0.01 && Math.abs(bankChange) > 0.01
        ? 'Cash & Bank'
        : Math.abs(cashChange) > 0.01
        ? 'Cash'
        : 'Bank';

    const head = counterNames.join(', ') || je.voucherType;
    const partyPrefix = je.partyName ? `${je.partyName} — ` : '';
    const particulars = `${partyPrefix}${je.narration || head}`;

    if (netCashFlow > 0) {
      receipts.push({
        date: je.date,
        voucherNo: je.voucherNo,
        voucherType: je.voucherType,
        particulars,
        mode,
        amount: netCashFlow,
      });
    } else {
      payments.push({
        date: je.date,
        voucherNo: je.voucherNo,
        voucherType: je.voucherType,
        particulars,
        mode,
        amount: round2(Math.abs(netCashFlow)),
      });
    }
  }

  const totalReceipts = round2(receipts.reduce((s, r) => s + r.amount, 0));
  const totalPayments = round2(payments.reduce((s, p) => s + p.amount, 0));
  const closingCash = round2(openingCash + periodCashNet);
  const closingBank = round2(openingBank + periodBankNet);
  const closingTotal = round2(closingCash + closingBank);

  return {
    openingCash,
    openingBank,
    openingTotal,
    receipts,
    totalReceipts,
    payments,
    totalPayments,
    closingCash,
    closingBank,
    closingTotal,
  };
}

function addOneDay(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export interface StockSummaryRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  openingQty: number;
  openingValue: number;
  inwardQty: number;
  inwardValue: number;
  outwardQty: number;
  outwardValue: number;
  closingQty: number;
  weightedAvgRate: number;
  closingValue: number;
}

export function computeStockSummary(db: ERPDatabase, fromDate: string, toDate: string): StockSummaryRow[] {
  return db.products.map((prod) => {
    const movs = db.stockMovements.filter((m) => m.productId === prod.id);
    let openQty = 0;
    let openVal = 0;
    let inQty = 0;
    let inVal = 0;
    let outQty = 0;
    let outVal = 0;

    for (const m of movs) {
      if (m.date < fromDate) {
        openQty += m.inQty - m.outQty;
        openVal += m.inQty > 0 ? m.totalValue : -m.totalValue;
      } else if (m.date >= fromDate && m.date <= toDate) {
        inQty += m.inQty;
        inVal += m.inQty > 0 ? m.totalValue : 0;
        outQty += m.outQty;
        outVal += m.outQty > 0 ? m.totalValue : 0;
      }
    }

    const closingQty = round2(openQty + inQty - outQty);
    const totalAvailableQty = openQty + inQty;
    const totalAvailableVal = openVal + inVal;
    const weightedAvgRate =
      totalAvailableQty > 0
        ? round2(totalAvailableVal / totalAvailableQty)
        : prod.weightedAvgCost;
    const closingValue = round2(closingQty * weightedAvgRate);

    return {
      productId: prod.id,
      sku: prod.sku,
      name: prod.name,
      category: prod.category,
      location: prod.location,
      unit: prod.unit,
      openingQty: round2(openQty),
      openingValue: round2(openVal),
      inwardQty: round2(inQty),
      inwardValue: round2(inVal),
      outwardQty: round2(outQty),
      outwardValue: round2(outVal),
      closingQty,
      weightedAvgRate,
      closingValue,
    };
  });
}

export function computeSupplierBalances(db: ERPDatabase, fromDate: string, toDate: string) {
  return db.suppliers.map((sup) => {
    const periodPurchases = db.purchaseInvoices
      .filter((pi) => pi.supplierId === sup.id && pi.date >= fromDate && pi.date <= toDate)
      .reduce((s, pi) => s + (pi.paymentType === 'Credit' ? pi.netAmount : 0), 0);

    const periodReturns = db.purchaseReturns
      .filter((pr) => pr.supplierId === sup.id && pr.date >= fromDate && pr.date <= toDate)
      .reduce((s, pr) => s + pr.totalAmount, 0);

    const periodPayments = db.journalEntries
      .filter((je) => je.voucherType === 'Payment' && je.partyName === sup.name && je.date >= fromDate && je.date <= toDate)
      .reduce((s, je) => s + je.lines.filter((l) => l.accountId === 'acc-2001').reduce((ls, l) => ls + l.debit, 0), 0);

    const allCreditPurchases = db.purchaseInvoices
      .filter((pi) => pi.supplierId === sup.id && pi.date <= toDate && pi.paymentType === 'Credit')
      .reduce((s, pi) => s + pi.netAmount, 0);

    const allReturns = db.purchaseReturns
      .filter((pr) => pr.supplierId === sup.id && pr.date <= toDate)
      .reduce((s, pr) => s + pr.totalAmount, 0);

    const allPayments = db.journalEntries
      .filter((je) => je.voucherType === 'Payment' && je.partyName === sup.name && je.date <= toDate)
      .reduce((s, je) => s + je.lines.filter((l) => l.accountId === 'acc-2001').reduce((ls, l) => ls + l.debit, 0), 0);

    const closingPayable = round2(sup.openingBalance + allCreditPurchases - allReturns - allPayments);

    return {
      ...sup,
      periodPurchases: round2(periodPurchases),
      periodReturns: round2(periodReturns),
      periodPayments: round2(periodPayments),
      closingPayable,
    };
  });
}

export function computeCustomerBalances(db: ERPDatabase, fromDate: string, toDate: string) {
  return db.customers.map((cus) => {
    const periodCreditSales = db.salesChallans
      .filter((sc) => sc.customerId === cus.id && sc.date >= fromDate && sc.date <= toDate && sc.paymentTerms === 'Credit')
      .reduce((s, sc) => s + sc.netAmount, 0);

    const periodReturns = db.salesReturns
      .filter((sr) => sr.customerId === cus.id && sr.date >= fromDate && sr.date <= toDate)
      .reduce((s, sr) => s + sr.totalAmount, 0);

    const periodReceipts = db.journalEntries
      .filter((je) => je.voucherType === 'Receipt' && je.partyName === cus.name && je.date >= fromDate && je.date <= toDate)
      .reduce((s, je) => s + je.lines.filter((l) => l.accountId === 'acc-1100').reduce((ls, l) => ls + l.credit, 0), 0);

    const allCreditSales = db.salesChallans
      .filter((sc) => sc.customerId === cus.id && sc.date <= toDate && sc.paymentTerms === 'Credit')
      .reduce((s, sc) => s + sc.netAmount, 0);

    const allReturns = db.salesReturns
      .filter((sr) => sr.customerId === cus.id && sr.date <= toDate)
      .reduce((s, sr) => s + sr.totalAmount, 0);

    const allReceipts = db.journalEntries
      .filter((je) => je.voucherType === 'Receipt' && je.partyName === cus.name && je.date <= toDate)
      .reduce((s, je) => s + je.lines.filter((l) => l.accountId === 'acc-1100').reduce((ls, l) => ls + l.credit, 0), 0);

    const closingReceivable = round2(cus.openingBalance + allCreditSales - allReturns - allReceipts);

    return {
      ...cus,
      periodCreditSales: round2(periodCreditSales),
      periodReturns: round2(periodReturns),
      periodReceipts: round2(periodReceipts),
      closingReceivable,
    };
  });
}

export function numberToWords(amount: number, currencyUnit = 'Taka'): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertBelowThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ` ${convertBelowThousand(n % 100)}` : '');
  };

  const whole = Math.floor(Math.abs(amount));
  const paisa = Math.round((Math.abs(amount) - whole) * 100);

  if (whole === 0 && paisa === 0) return `Zero ${currencyUnit} Only`;

  const parts: string[] = [];
  let rem = whole;
  const crore = Math.floor(rem / 10000000);
  rem %= 10000000;
  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;

  if (crore > 0) parts.push(`${convertBelowThousand(crore)} Crore`);
  if (lakh > 0) parts.push(`${convertBelowThousand(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${convertBelowThousand(thousand)} Thousand`);
  if (rem > 0) parts.push(convertBelowThousand(rem));

  let result = parts.length > 0 ? `${parts.join(' ')} ${currencyUnit}` : '';
  if (paisa > 0) {
    result += `${result ? ' and ' : ''}${convertBelowThousand(paisa)} Paisa`;
  }
  return `${result} Only`;
}

