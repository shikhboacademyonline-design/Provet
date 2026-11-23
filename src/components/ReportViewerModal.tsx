import React from 'react';
import { Calendar, FileSpreadsheet, FileText, Printer, X } from 'lucide-react';
import type { ERPDatabase } from '../types/erp';
import type { ReportType } from './DateFilterModal';
import {
  computeBalanceSheet,
  computeCustomerBalances,
  computeProfitAndLoss,
  computeReceiptAndPayment,
  computeRetainedEarnings,
  computeStockSummary,
  computeSupplierBalances,
  computeTrialBalance,
  formatCurrency,
  formatNumber,
  round2,
} from '../utils/accounting';
import {
  exportReportToExcel,
  exportReportToPDF,
  printCurrentReport,
  type ExportPayload,
} from '../utils/exportReport';
import type { Lang } from '../i18n/translations';
import { labels } from '../i18n/translations';

interface ReportViewerModalProps {
  db: ERPDatabase;
  report: { type: ReportType; title: string; fromDate: string; toDate: string } | null;
  lang: Lang;
  onClose: () => void;
  onChangeDuration: (type: ReportType, title: string) => void;
}

export const ReportViewerModal: React.FC<ReportViewerModalProps> = ({
  db,
  report,
  lang,
  onClose,
  onChangeDuration,
}) => {
  if (!report) return null;

  const t = labels[lang];
  const cur = db.company.currency;
  const { type, title, fromDate, toDate } = report;
  const dateRange = `${fromDate} to ${toDate}`;

  const buildPayload = (): ExportPayload => {
    switch (type) {
      case 'stock-summary': {
        const rows = computeStockSummary(db, fromDate, toDate);
        const totCloseQty = round2(rows.reduce((s, r) => s + r.closingQty, 0));
        const totCloseVal = round2(rows.reduce((s, r) => s + r.closingValue, 0));
        return {
          title: 'Stock Summary Report (Weighted Average Method)',
          subtitle: 'Valuation computed using moving Weighted Average Cost across opening and inward receipts',
          dateRange,
          filename: `Provet_Stock_Summary_${fromDate}_${toDate}`,
          columns: [
            { header: 'SKU' },
            { header: 'Product Name' },
            { header: 'Location' },
            { header: 'Opening Qty', align: 'right' },
            { header: 'Inward Qty', align: 'right' },
            { header: 'Outward Qty', align: 'right' },
            { header: 'Closing Qty', align: 'right' },
            { header: 'Weighted Avg Rate', align: 'right' },
            { header: 'Closing Value', align: 'right' },
          ],
          rows: rows.map((r) => [
            r.sku,
            `${r.name} (${r.unit})`,
            r.location,
            r.openingQty,
            r.inwardQty,
            r.outwardQty,
            r.closingQty,
            formatCurrency(r.weightedAvgRate, cur),
            formatCurrency(r.closingValue, cur),
          ]),
          footerRows: [
            [
              'TOTAL INVENTORY',
              '',
              '',
              '',
              '',
              '',
              totCloseQty,
              '-',
              formatCurrency(totCloseVal, cur),
            ],
          ],
        };
      }

      case 'stock-record': {
        const movs = db.stockMovements.filter((m) => m.date >= fromDate && m.date <= toDate);
        return {
          title: 'Stock Movement Record Ledger',
          subtitle: 'Chronological inward & outward inventory transactions',
          dateRange,
          filename: `Provet_Stock_Record_${fromDate}_${toDate}`,
          columns: [
            { header: 'Date' },
            { header: 'Ref No' },
            { header: 'Type' },
            { header: 'Product' },
            { header: 'Location' },
            { header: 'In Qty', align: 'right' },
            { header: 'Out Qty', align: 'right' },
            { header: 'Unit Cost', align: 'right' },
            { header: 'Total Value', align: 'right' },
          ],
          rows: movs.map((m) => [
            m.date,
            m.refNo,
            m.type,
            m.productName,
            m.location,
            m.inQty || '-',
            m.outQty || '-',
            formatCurrency(m.unitCost, cur),
            formatCurrency(m.totalValue, cur),
          ]),
          footerRows: [
            [
              'TOTAL',
              `${movs.length} Entries`,
              '',
              '',
              '',
              movs.reduce((s, m) => s + m.inQty, 0),
              movs.reduce((s, m) => s + m.outQty, 0),
              '',
              formatCurrency(round2(movs.reduce((s, m) => s + m.totalValue, 0)), cur),
            ],
          ],
        };
      }

      case 'damaged-record': {
        const recs = db.damagedRecords.filter((d) => d.date >= fromDate && d.date <= toDate);
        const totLoss = round2(recs.reduce((s, r) => s + r.totalLoss, 0));
        return {
          title: 'Damaged Product & Write-Off Record',
          subtitle: 'Inventory write-offs valued at Weighted Average Cost',
          dateRange,
          filename: `Provet_Damaged_Products_${fromDate}_${toDate}`,
          columns: [
            { header: 'Damage No' },
            { header: 'Date' },
            { header: 'Product Name' },
            { header: 'Location' },
            { header: 'Qty', align: 'right' },
            { header: 'Avg Cost', align: 'right' },
            { header: 'Loss Value', align: 'right' },
            { header: 'Reason' },
          ],
          rows: recs.map((r) => [
            r.damageNo,
            r.date,
            r.productName,
            r.location,
            r.qty,
            formatCurrency(r.unitCost, cur),
            formatCurrency(r.totalLoss, cur),
            r.reason,
          ]),
          footerRows: [
            [
              'TOTAL',
              '',
              `${recs.length} Incidents`,
              '',
              recs.reduce((s, r) => s + r.qty, 0),
              '',
              formatCurrency(totLoss, cur),
              '',
            ],
          ],
        };
      }

      case 'supplier-list': {
        const sups = computeSupplierBalances(db, fromDate, toDate);
        return {
          title: 'Supplier Directory & Period Activity Report',
          subtitle: 'Supplier contacts, period purchases, returns, payments, and closing payables',
          dateRange,
          filename: `Provet_Supplier_List_${fromDate}_${toDate}`,
          columns: [
            { header: 'Code' },
            { header: 'Supplier Name' },
            { header: 'Mobile' },
            { header: 'Email' },
            { header: 'Period Credit Purch.', align: 'right' },
            { header: 'Payments', align: 'right' },
            { header: 'Closing Payable', align: 'right' },
          ],
          rows: sups.map((s) => [
            s.code,
            s.name,
            s.mobile,
            s.email,
            formatCurrency(s.periodPurchases, cur),
            formatCurrency(s.periodPayments, cur),
            formatCurrency(s.closingPayable, cur),
          ]),
          footerRows: [
            [
              'TOTAL',
              `${sups.length} Suppliers`,
              '',
              '',
              formatCurrency(round2(sups.reduce((a, b) => a + b.periodPurchases, 0)), cur),
              formatCurrency(round2(sups.reduce((a, b) => a + b.periodPayments, 0)), cur),
              formatCurrency(round2(sups.reduce((a, b) => a + b.closingPayable, 0)), cur),
            ],
          ],
        };
      }

      case 'payable': {
        const sups = computeSupplierBalances(db, fromDate, toDate);
        const total = round2(sups.reduce((s, x) => s + x.closingPayable, 0));
        return {
          title: 'Accounts Payable Statement',
          subtitle: 'Outstanding supplier liabilities as of period end',
          dateRange,
          filename: `Provet_Accounts_Payable_${fromDate}_${toDate}`,
          columns: [
            { header: 'Code' },
            { header: 'Supplier Name' },
            { header: 'Opening Balance', align: 'right' },
            { header: 'Credit Purchases', align: 'right' },
            { header: 'Returns', align: 'right' },
            { header: 'Payments Made', align: 'right' },
            { header: 'Net Payable', align: 'right' },
          ],
          rows: sups.map((s) => [
            s.code,
            s.name,
            formatCurrency(s.openingBalance, cur),
            formatCurrency(s.periodPurchases, cur),
            formatCurrency(s.periodReturns, cur),
            formatCurrency(s.periodPayments, cur),
            formatCurrency(s.closingPayable, cur),
          ]),
          footerRows: [
            ['TOTAL ACCOUNTS PAYABLE', '', '', '', '', '', formatCurrency(total, cur)],
          ],
        };
      }

      case 'purchase-register': {
        const invs = db.purchaseInvoices.filter((p) => p.date >= fromDate && p.date <= toDate);
        const total = round2(invs.reduce((s, i) => s + i.netAmount, 0));
        return {
          title: 'Purchase Register',
          subtitle: 'All finalized purchase invoices within selected duration',
          dateRange,
          filename: `Provet_Purchase_Register_${fromDate}_${toDate}`,
          columns: [
            { header: 'Invoice No' },
            { header: 'Date' },
            { header: 'Supplier' },
            { header: 'Payment Type' },
            { header: 'Items', align: 'right' },
            { header: 'Sub Total', align: 'right' },
            { header: 'Discount', align: 'right' },
            { header: 'Net Amount', align: 'right' },
          ],
          rows: invs.map((i) => [
            i.invoiceNo,
            i.date,
            i.supplierName,
            i.paymentType,
            i.items.reduce((s, x) => s + x.qty, 0),
            formatCurrency(i.subTotal, cur),
            formatCurrency(i.discountAmount, cur),
            formatCurrency(i.netAmount, cur),
          ]),
          footerRows: [
            ['TOTAL PURCHASES', '', `${invs.length} Invoices`, '', '', '', '', formatCurrency(total, cur)],
          ],
        };
      }

      case 'purchase-return': {
        const rets = db.purchaseReturns.filter((r) => r.date >= fromDate && r.date <= toDate);
        const total = round2(rets.reduce((s, r) => s + r.totalAmount, 0));
        return {
          title: 'Purchase Return Register',
          subtitle: 'Goods returned to suppliers within selected duration',
          dateRange,
          filename: `Provet_Purchase_Returns_${fromDate}_${toDate}`,
          columns: [
            { header: 'Return No' },
            { header: 'Date' },
            { header: 'Supplier' },
            { header: 'Invoice Ref' },
            { header: 'Reason' },
            { header: 'Total Amount', align: 'right' },
          ],
          rows: rets.map((r) => [
            r.returnNo,
            r.date,
            r.supplierName,
            r.invoiceRef || '-',
            r.reason,
            formatCurrency(r.totalAmount, cur),
          ]),
          footerRows: [['TOTAL RETURNS', '', '', '', '', formatCurrency(total, cur)]],
        };
      }

      case 'receivable': {
        const custs = computeCustomerBalances(db, fromDate, toDate);
        const total = round2(custs.reduce((s, c) => s + c.closingReceivable, 0));
        return {
          title: 'Accounts Receivable Statement',
          subtitle: 'Customer-wise outstanding receivables and collections',
          dateRange,
          filename: `Provet_Accounts_Receivable_${fromDate}_${toDate}`,
          columns: [
            { header: 'Code' },
            { header: 'Customer Name' },
            { header: 'Opening Balance', align: 'right' },
            { header: 'Credit Sales', align: 'right' },
            { header: 'Sales Returns', align: 'right' },
            { header: 'Collections', align: 'right' },
            { header: 'Net Receivable', align: 'right' },
          ],
          rows: custs.map((c) => [
            c.code,
            c.name,
            formatCurrency(c.openingBalance, cur),
            formatCurrency(c.periodCreditSales, cur),
            formatCurrency(c.periodReturns, cur),
            formatCurrency(c.periodReceipts, cur),
            formatCurrency(c.closingReceivable, cur),
          ]),
          footerRows: [['TOTAL RECEIVABLE', '', '', '', '', '', formatCurrency(total, cur)]],
        };
      }

      case 'sales-register': {
        const sales = db.salesChallans.filter((s) => s.date >= fromDate && s.date <= toDate);
        const totalNet = round2(sales.reduce((s, x) => s + x.netAmount, 0));
        return {
          title: 'Sales Register (Challans & Invoices)',
          subtitle: 'All dispatched sales challans, discounts, bonus quantities, and net invoice values',
          dateRange,
          filename: `Provet_Sales_Register_${fromDate}_${toDate}`,
          columns: [
            { header: 'Challan / Inv' },
            { header: 'Date' },
            { header: 'Customer' },
            { header: 'Terms' },
            { header: 'Qty (+Bonus)', align: 'right' },
            { header: 'Gross', align: 'right' },
            { header: 'Discount', align: 'right' },
            { header: 'Net Sales', align: 'right' },
          ],
          rows: sales.map((s) => {
            const qty = s.items.reduce((a, b) => a + b.qty, 0);
            const bonus = s.items.reduce((a, b) => a + (b.bonusQty || 0), 0);
            return [
              `${s.challanNo} / ${s.invoiceNo}`,
              s.date,
              s.customerName,
              `${s.paymentTerms} (${s.paymentMethod})`,
              bonus > 0 ? `${qty} (+${bonus})` : `${qty}`,
              formatCurrency(s.subTotal, cur),
              formatCurrency(s.totalDiscount, cur),
              formatCurrency(s.netAmount, cur),
            ];
          }),
          footerRows: [
            ['TOTAL SALES', '', `${sales.length} Challans`, '', '', '', '', formatCurrency(totalNet, cur)],
          ],
        };
      }

      case 'sales-return': {
        const rets = db.salesReturns.filter((r) => r.date >= fromDate && r.date <= toDate);
        const total = round2(rets.reduce((s, r) => s + r.totalAmount, 0));
        return {
          title: 'Sales Return Register',
          subtitle: 'Customer returns restored to stock and credited to receivable',
          dateRange,
          filename: `Provet_Sales_Returns_${fromDate}_${toDate}`,
          columns: [
            { header: 'Return No' },
            { header: 'Date' },
            { header: 'Customer' },
            { header: 'Challan Ref' },
            { header: 'Reason' },
            { header: 'Total Amount', align: 'right' },
          ],
          rows: rets.map((r) => [
            r.returnNo,
            r.date,
            r.customerName,
            r.challanRef || '-',
            r.reason,
            formatCurrency(r.totalAmount, cur),
          ]),
          footerRows: [['TOTAL SALES RETURNS', '', '', '', '', formatCurrency(total, cur)]],
        };
      }

      case 'payment-schedule': {
        const creditSales = db.salesChallans.filter(
          (s) => s.paymentTerms === 'Credit' && s.date >= fromDate && s.date <= toDate
        );
        const total = round2(creditSales.reduce((s, x) => s + x.netAmount, 0));
        return {
          title: 'Credit Sales Payment Schedule',
          subtitle: 'Due dates and payment periods for credit sales invoices',
          dateRange,
          filename: `Provet_Payment_Schedule_${fromDate}_${toDate}`,
          columns: [
            { header: 'Invoice / Challan' },
            { header: 'Sale Date' },
            { header: 'Customer' },
            { header: 'Method' },
            { header: 'Period (Days)', align: 'right' },
            { header: 'Due Date' },
            { header: 'Invoice Amount', align: 'right' },
          ],
          rows: creditSales.map((s) => [
            `${s.invoiceNo} (${s.challanNo})`,
            s.date,
            s.customerName,
            s.paymentMethod,
            `${s.paymentPeriodDays} Days`,
            s.dueDate,
            formatCurrency(s.netAmount, cur),
          ]),
          footerRows: [['TOTAL SCHEDULED RECEIVABLES', '', '', '', '', '', formatCurrency(total, cur)]],
        };
      }

      case 'trial-balance': {
        const { rows, totals } = computeTrialBalance(db, fromDate, toDate);
        return {
          title: 'Trial Balance',
          subtitle: 'Standard Double-Entry Trial Balance (Opening, Period Activity, Closing Balances)',
          dateRange,
          filename: `Provet_Trial_Balance_${fromDate}_${toDate}`,
          columns: [
            { header: 'Code' },
            { header: 'Account Title' },
            { header: 'Class' },
            { header: 'Op. Debit', align: 'right' },
            { header: 'Op. Credit', align: 'right' },
            { header: 'Period Debit', align: 'right' },
            { header: 'Period Credit', align: 'right' },
            { header: 'Closing Debit', align: 'right' },
            { header: 'Closing Credit', align: 'right' },
          ],
          rows: rows.map((r) => [
            r.code,
            r.name,
            r.type,
            r.openingDebit ? formatNumber(r.openingDebit) : '-',
            r.openingCredit ? formatNumber(r.openingCredit) : '-',
            r.periodDebit ? formatNumber(r.periodDebit) : '-',
            r.periodCredit ? formatNumber(r.periodCredit) : '-',
            r.closingDebit ? formatNumber(r.closingDebit) : '-',
            r.closingCredit ? formatNumber(r.closingCredit) : '-',
          ]),
          footerRows: [
            [
              'TOTAL',
              'Balanced Verification',
              '',
              formatCurrency(totals.openingDebit, cur),
              formatCurrency(totals.openingCredit, cur),
              formatCurrency(totals.periodDebit, cur),
              formatCurrency(totals.periodCredit, cur),
              formatCurrency(totals.closingDebit, cur),
              formatCurrency(totals.closingCredit, cur),
            ],
          ],
        };
      }

      case 'profit-loss': {
        const pnl = computeProfitAndLoss(db, fromDate, toDate);
        const rows: (string | number)[][] = [
          ['REVENUE', '', ''],
          ['4001', 'Sales Revenue', formatCurrency(pnl.salesRevenue, cur)],
          ['4002', 'Less: Sales Returns & Allowances', formatCurrency(-pnl.salesReturns, cur)],
          ['', 'Net Sales Revenue', formatCurrency(pnl.netSales, cur)],
          ['COST OF GOODS SOLD', '', ''],
          ['5001', 'Cost of Goods Sold (Weighted Avg)', formatCurrency(pnl.cogs, cur)],
          ['', 'GROSS PROFIT', formatCurrency(pnl.grossProfit, cur)],
          ['4100', 'Other Operating Income', formatCurrency(pnl.otherIncome, cur)],
          ['OPERATING EXPENSES', '', ''],
          ...pnl.operatingExpenses.map((e) => [e.code, e.name, formatCurrency(e.amount, cur)]),
          ['', 'Total Operating Expenses', formatCurrency(pnl.totalOpEx, cur)],
        ];
        return {
          title: 'Statement of Profit & Loss (Income Statement)',
          subtitle: 'Prepared on accrual basis with Weighted Average Cost of Goods Sold',
          dateRange,
          filename: `Provet_Profit_And_Loss_${fromDate}_${toDate}`,
          columns: [
            { header: 'Code / Section' },
            { header: 'Particulars' },
            { header: `Amount (${cur})`, align: 'right' },
          ],
          rows,
          footerRows: [['', 'NET PROFIT / (LOSS) TRANSFERRED TO RETAINED EARNINGS', formatCurrency(pnl.netProfit, cur)]],
        };
      }

      case 'balance-sheet': {
        const bs = computeBalanceSheet(db, toDate);
        const rows: (string | number)[][] = [
          ['ASSETS', '', ''],
          ...bs.nonCurrentAssets.map((a) => [a.code, `${a.name} (Non-Current)`, formatCurrency(a.amount, cur)]),
          ...bs.currentAssets.map((a) => [a.code, `${a.name} (Current)`, formatCurrency(a.amount, cur)]),
          ['', 'TOTAL ASSETS', formatCurrency(bs.totalAssets, cur)],
          ['LIABILITIES', '', ''],
          ...bs.currentLiabilities.map((l) => [l.code, `${l.name} (Current Liability)`, formatCurrency(l.amount, cur)]),
          ['', 'Total Liabilities', formatCurrency(bs.totalLiabilities, cur)],
          ['EQUITY', '', ''],
          ['3001', "Owner's Capital", formatCurrency(bs.capital, cur)],
          ['3100', 'Retained Earnings (incl. Current Net Profit)', formatCurrency(bs.closingRetainedEarnings, cur)],
          ['', 'Total Equity', formatCurrency(bs.totalEquity, cur)],
        ];
        return {
          title: 'Statement of Financial Position (Balance Sheet)',
          subtitle: `As of ${toDate} — Accounting Equation: Assets = Liabilities + Equity`,
          dateRange: `As of ${toDate}`,
          filename: `Provet_Balance_Sheet_${toDate}`,
          columns: [
            { header: 'Code / Group' },
            { header: 'Account Head' },
            { header: `Amount (${cur})`, align: 'right' },
          ],
          rows,
          footerRows: [['', 'TOTAL LIABILITIES & EQUITY', formatCurrency(bs.totalLiabilitiesAndEquity, cur)]],
        };
      }

      case 'retained-earnings': {
        const re = computeRetainedEarnings(db, fromDate, toDate);
        return {
          title: 'Statement of Retained Earnings',
          subtitle: 'Reconciliation of opening surplus, current period profit, and distributions',
          dateRange,
          filename: `Provet_Retained_Earnings_${fromDate}_${toDate}`,
          columns: [
            { header: 'Particulars' },
            { header: `Amount (${cur})`, align: 'right' },
          ],
          rows: [
            ['Opening Retained Earnings (Brought Forward)', formatCurrency(re.openingRetainedEarnings, cur)],
            ['Add: Net Profit / (Loss) for the Period', formatCurrency(re.netProfitForPeriod, cur)],
            ['Less: Drawings / Dividends Distributed', formatCurrency(-re.periodDrawings, cur)],
          ],
          footerRows: [['Closing Retained Earnings (Carried to Balance Sheet)', formatCurrency(re.closingRetainedEarnings, cur)]],
        };
      }

      case 'receipt-payment': {
        const rp = computeReceiptAndPayment(db, fromDate, toDate);
        const rows: (string | number)[][] = [
          ['OPENING CASH & BANK', '', '', '', ''],
          ['', '', 'Opening Cash in Hand (1001)', 'Cash', formatCurrency(rp.openingCash, cur)],
          ['', '', 'Opening Cash at Bank (1002)', 'Bank', formatCurrency(rp.openingBank, cur)],
          ['', '', 'Total Opening Cash & Bank Balance', '', formatCurrency(rp.openingTotal, cur)],
          ['RECEIPTS (INFLOWS)', '', '', '', ''],
          ...(rp.receipts.length > 0
            ? rp.receipts.map((r) => [r.date, r.voucherNo, r.particulars, r.mode, formatCurrency(r.amount, cur)])
            : [['', '-', 'No cash or bank receipts recorded in this period', '-', formatCurrency(0, cur)]]),
          ['', '', 'Total Receipts During Period', '', formatCurrency(rp.totalReceipts, cur)],
          ['PAYMENTS (OUTFLOWS)', '', '', '', ''],
          ...(rp.payments.length > 0
            ? rp.payments.map((p) => [p.date, p.voucherNo, p.particulars, p.mode, formatCurrency(p.amount, cur)])
            : [['', '-', 'No cash or bank payments recorded in this period', '-', formatCurrency(0, cur)]]),
          ['', '', 'Total Payments During Period', '', formatCurrency(rp.totalPayments, cur)],
          ['CLOSING CASH & BANK', '', '', '', ''],
          ['', '', 'Closing Cash in Hand (1001)', 'Cash', formatCurrency(rp.closingCash, cur)],
          ['', '', 'Closing Cash at Bank (1002)', 'Bank', formatCurrency(rp.closingBank, cur)],
        ];
        return {
          title: 'Receipt And Payment Statement',
          subtitle: 'Summary of Opening Cash & Bank, Receipts (Inflows), Payments (Outflows), and Closing Cash & Bank',
          dateRange,
          filename: `Provet_Receipt_And_Payment_${fromDate}_${toDate}`,
          columns: [
            { header: 'Date' },
            { header: 'Voucher No' },
            { header: 'Particulars' },
            { header: 'Mode' },
            { header: `Amount (${cur})`, align: 'right' },
          ],
          rows,
          footerRows: [['CLOSING CASH & BANK BALANCE', '', '', '', formatCurrency(rp.closingTotal, cur)]],
        };
      }

      case 'hr-employees': {
        const emps = db.employees;
        const totGross = emps.reduce(
          (s, e) => s + e.basicSalary + e.houseRent + e.medicalAllowance + e.transportAllowance,
          0
        );
        return {
          title: 'Employee Roster & Compensation Structure',
          subtitle: 'Active workforce directory and monthly salary breakdown',
          dateRange,
          filename: `Provet_Employee_Roster_${toDate}`,
          columns: [
            { header: 'Emp ID' },
            { header: 'Name' },
            { header: 'Designation' },
            { header: 'Department' },
            { header: 'Join Date' },
            { header: 'Basic', align: 'right' },
            { header: 'Allowances', align: 'right' },
            { header: 'Gross Salary', align: 'right' },
          ],
          rows: emps.map((e) => {
            const allow = e.houseRent + e.medicalAllowance + e.transportAllowance;
            return [
              e.empCode,
              e.name,
              e.designation,
              e.department,
              e.joinDate,
              formatCurrency(e.basicSalary, cur),
              formatCurrency(allow, cur),
              formatCurrency(e.basicSalary + allow, cur),
            ];
          }),
          footerRows: [['TOTAL', `${emps.length} Employees`, '', '', '', '', '', formatCurrency(totGross, cur)]],
        };
      }

      case 'hr-attendance': {
        const att = db.attendance.filter((a) => a.date >= fromDate && a.date <= toDate);
        return {
          title: 'Employee Attendance Register',
          subtitle: 'Daily check-in, check-out, and attendance status log',
          dateRange,
          filename: `Provet_Attendance_Register_${fromDate}_${toDate}`,
          columns: [
            { header: 'Date' },
            { header: 'Employee' },
            { header: 'Department' },
            { header: 'Status' },
            { header: 'Check In' },
            { header: 'Check Out' },
          ],
          rows: att.map((a) => [a.date, a.employeeName, a.department, a.status, a.checkIn || '-', a.checkOut || '-']),
          footerRows: [['TOTAL LOGS', `${att.length} Records`, '', '', '', '']],
        };
      }

      case 'hr-payroll': {
        const runs = db.payrollRuns.filter((r) => r.date >= fromDate && r.date <= toDate);
        const totNet = round2(runs.reduce((s, r) => s + r.totalNet, 0));
        return {
          title: 'Payroll Disbursement Summary',
          subtitle: 'Processed monthly salary runs and general ledger posting status',
          dateRange,
          filename: `Provet_Payroll_Summary_${fromDate}_${toDate}`,
          columns: [
            { header: 'Run No' },
            { header: 'Month' },
            { header: 'Pay Date' },
            { header: 'Method' },
            { header: 'Headcount', align: 'right' },
            { header: 'Gross Pay', align: 'right' },
            { header: 'Deductions', align: 'right' },
            { header: 'Net Paid', align: 'right' },
            { header: 'Ledger Voucher' },
          ],
          rows: runs.map((r) => [
            r.runNo,
            r.month,
            r.date,
            r.paymentMethod,
            r.entries.length,
            formatCurrency(r.totalGross, cur),
            formatCurrency(r.totalDeductions, cur),
            formatCurrency(r.totalNet, cur),
            r.voucherNo || 'Not Posted',
          ]),
          footerRows: [['TOTAL PAYROLL', `${runs.length} Runs`, '', '', '', '', '', formatCurrency(totNet, cur), '']],
        };
      }
    }
  };

  const payload = buildPayload();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px] print:static print:block print:bg-white print:p-0">
      <div className="print-area flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#DDE7E0] bg-white shadow-2xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        {/* Toolbar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE7E0] bg-[#F7FAF8] px-6 py-3.5">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/images__32__e2bc1202.jpeg"
              alt="Provet"
              className="h-8 w-auto rounded object-contain"
              referrerPolicy="no-referrer"
            />
            <div>
              <h3 className="text-sm font-semibold text-[#0D2319]">{title}</h3>
              <div className="flex items-center gap-2 text-xs text-[#4B6356]">
                <span>{payload.dateRange}</span>
                <span aria-hidden="true">·</span>
                <button
                  onClick={() => onChangeDuration(type, title)}
                  className="inline-flex items-center gap-1 font-medium text-[#07432B] hover:underline"
                >
                  <Calendar className="h-3 w-3" /> Change Duration
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={printCurrentReport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE7E0] bg-white px-3 py-1.5 text-xs font-medium text-[#0D2319] hover:bg-[#EAF4EE]"
            >
              <Printer className="h-3.5 w-3.5 text-[#07432B]" />
              {t.print}
            </button>
            <button
              onClick={() => exportReportToPDF(payload)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE7E0] bg-white px-3 py-1.5 text-xs font-medium text-[#0D2319] hover:bg-[#EAF4EE]"
            >
              <FileText className="h-3.5 w-3.5 text-[#DC2626]" />
              {t.downloadPdf}
            </button>
            <button
              onClick={() => exportReportToExcel(payload)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1E7134]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {t.downloadExcel}
            </button>
            <button
              onClick={onClose}
              className="ml-1 rounded-lg p-1.5 text-[#4B6356] hover:bg-[#DDE7E0]/50 hover:text-[#0D2319]"
              aria-label="Close Report"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Formal Report Sheet */}
        <div className="flex-1 overflow-y-auto p-8 print:overflow-visible print:p-0">
          <div className="mb-6 flex items-start justify-between border-b-2 border-[#07432B] pb-4">
            <div className="flex items-center gap-4">
              <img
                src="/assets/aistudio/images__32__e2bc1202.jpeg"
                alt="Provet Logo"
                className="h-12 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[#07432B]">{db.company.name}</h1>
                <p className="text-xs text-[#4B6356]">{db.company.address}</p>
                <p className="text-xs text-[#4B6356]">{db.company.phone} · {db.company.email}</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-base font-bold text-[#0D2319]">{payload.title}</h2>
              <p className="text-xs text-[#4B6356]">Period: {payload.dateRange}</p>
              <p className="text-xs text-[#4B6356]">Generated: {new Date().toISOString().slice(0, 10)}</p>
            </div>
          </div>

          <p className="mb-4 text-xs text-[#4B6356]">{payload.subtitle}</p>

          {payload.rows.length === 0 ? (
            <div className="rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] py-12 text-center">
              <p className="text-sm font-medium text-[#0D2319]">No records found in selected date duration</p>
              <p className="mt-1 text-xs text-[#4B6356]">Try expanding the From Date / To Date range above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#DDE7E0] print:overflow-visible">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#07432B] text-white">
                    {payload.columns.map((col, idx) => (
                      <th
                        key={idx}
                        className={`px-3.5 py-2.5 font-semibold whitespace-nowrap ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                        }`}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE7E0]">
                  {payload.rows.map((row, rIdx) => {
                    const isSectionHeader =
                      typeof row[0] === 'string' &&
                      [
                        'REVENUE',
                        'COST OF GOODS SOLD',
                        'OPERATING EXPENSES',
                        'ASSETS',
                        'LIABILITIES',
                        'EQUITY',
                        'OPENING CASH & BANK',
                        'RECEIPTS (INFLOWS)',
                        'PAYMENTS (OUTFLOWS)',
                        'CLOSING CASH & BANK',
                      ].includes(row[0]);
                    const labelCol = typeof row[1] === 'string' && row[1] ? row[1] : typeof row[2] === 'string' ? row[2] : '';
                    const isSubtotal =
                      labelCol.startsWith('GROSS PROFIT') ||
                      labelCol.startsWith('TOTAL ') ||
                      labelCol.startsWith('Total ') ||
                      labelCol.startsWith('Net Sales');

                    return (
                      <tr
                        key={rIdx}
                        className={
                          isSectionHeader
                            ? 'bg-[#EAF4EE]/60 font-bold text-[#07432B]'
                            : isSubtotal
                            ? 'bg-[#F7FAF8] font-semibold text-[#0D2319]'
                            : 'hover:bg-[#F7FAF8]'
                        }
                      >
                        {row.map((cell, cIdx) => {
                          const align = payload.columns[cIdx]?.align;
                          return (
                            <td
                              key={cIdx}
                              className={`px-3.5 py-2.5 ${
                                align === 'right' ? 'text-right font-mono tabular-nums whitespace-nowrap' : ''
                              }`}
                            >
                              {cell}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {payload.footerRows && payload.footerRows.length > 0 && (
                  <tfoot>
                    {payload.footerRows.map((frow, fIdx) => {
                      const renderedCells: React.ReactNode[] = [];
                      let idx = 0;
                      while (idx < payload.columns.length) {
                        const cell = frow[idx];
                        const text = String(cell ?? '').trim();
                        const align = payload.columns[idx]?.align;
                        let span = 1;
                        if (text !== '' && align !== 'right') {
                          while (
                            idx + span < payload.columns.length &&
                            String(frow[idx + span] ?? '').trim() === ''
                          ) {
                            span++;
                          }
                        } else if (text === '') {
                          while (
                            idx + span < payload.columns.length &&
                            String(frow[idx + span] ?? '').trim() === ''
                          ) {
                            span++;
                          }
                        }
                        renderedCells.push(
                          <td
                            key={idx}
                            colSpan={span > 1 ? span : undefined}
                            className={`px-3.5 py-3 ${
                              align === 'right'
                                ? 'text-right font-mono tabular-nums whitespace-nowrap accounting-double-underline'
                                : ''
                            }`}
                          >
                            {cell}
                          </td>
                        );
                        idx += span;
                      }
                      return (
                        <tr key={fIdx} className="border-t-2 border-[#07432B] bg-[#EAF4EE] font-bold text-[#07432B]">
                          {renderedCells}
                        </tr>
                      );
                    })}
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Accounting Verification Footer for Statements */}
          {type === 'trial-balance' && (() => {
            const { totals } = computeTrialBalance(db, fromDate, toDate);
            const balanced = Math.abs(totals.closingDebit - totals.closingCredit) < 0.01;
            return (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-4 py-2.5 text-xs">
                <span className="font-medium text-[#0D2319]">
                  Accounting Equilibrium Check (Total Closing Debit = Total Closing Credit)
                </span>
                <span className={`font-semibold ${balanced ? 'text-[#1E7134]' : 'text-[#DC2626]'}`}>
                  {balanced ? 'BALANCED (Difference: 0.00)' : 'OUT OF BALANCE'}
                </span>
              </div>
            );
          })()}

          {type === 'balance-sheet' && (() => {
            const bs = computeBalanceSheet(db, toDate);
            const balanced = Math.abs(bs.totalAssets - bs.totalLiabilitiesAndEquity) < 0.01;
            return (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-4 py-2.5 text-xs">
                <span className="font-medium text-[#0D2319]">
                  Balance Sheet Identity (Assets = Liabilities + Equity)
                </span>
                <span className={`font-semibold ${balanced ? 'text-[#1E7134]' : 'text-[#DC2626]'}`}>
                  {balanced
                    ? `BALANCED (${formatCurrency(bs.totalAssets, cur)} = ${formatCurrency(bs.totalLiabilitiesAndEquity, cur)})`
                    : 'OUT OF BALANCE'}
                </span>
              </div>
            );
          })()}

          {type === 'receipt-payment' && (() => {
            const rp = computeReceiptAndPayment(db, fromDate, toDate);
            const expectedClosing = round2(rp.openingTotal + rp.totalReceipts - rp.totalPayments);
            const balanced = Math.abs(expectedClosing - rp.closingTotal) < 0.01;
            return (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-4 py-2.5 text-xs">
                <span className="font-medium text-[#0D2319]">
                  Cash & Bank Reconciliation (Opening + Receipts - Payments = Closing)
                </span>
                <span className={`font-semibold ${balanced ? 'text-[#1E7134]' : 'text-[#DC2626]'}`}>
                  {balanced
                    ? `RECONCILED (${formatCurrency(rp.closingTotal, cur)})`
                    : 'MISMATCH'}
                </span>
              </div>
            );
          })()}

          <div className="mt-10 grid grid-cols-3 gap-8 pt-6 text-center text-xs text-[#4B6356]">
            <div className="border-t border-[#DDE7E0] pt-2">Prepared By (Accounts)</div>
            <div className="border-t border-[#DDE7E0] pt-2">Checked By (Finance Manager)</div>
            <div className="border-t border-[#DDE7E0] pt-2">Approved By (Managing Director)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
