import React from 'react';
import { FileBarChart } from 'lucide-react';
import type { ReportType } from '../DateFilterModal';

interface ReportsModuleProps {
  onOpenReport: (type: ReportType, title: string) => void;
}

const REPORT_GROUPS: {
  group: string;
  description: string;
  items: { id: ReportType; title: string; subtitle: string }[];
}[] = [
  {
    group: 'Financial Statements (Standard Accounting Format)',
    description: 'Double-entry verified statements derived directly from the General Ledger',
    items: [
      { id: 'trial-balance', title: 'Trial Balance', subtitle: 'Opening, Period Activity & Closing Debit/Credit Equilibrium' },
      { id: 'profit-loss', title: 'Profit and Loss Account', subtitle: 'Sales, COGS (Weighted Avg), Gross Profit & Net Profit' },
      { id: 'balance-sheet', title: 'Balance Sheet', subtitle: 'Assets = Liabilities + Equity Statement of Financial Position' },
      { id: 'retained-earnings', title: 'Retained Earnings', subtitle: 'Opening Surplus + Net Profit - Drawings Reconciliation' },
      { id: 'receipt-payment', title: 'Receipt And Payment', subtitle: 'Opening & Closing Cash/Bank with itemized cash inflows and outflows' },
    ],
  },
  {
    group: 'Stock & Inventory Reports',
    description: 'Weighted Average valuation, inward/outward stock movements, and write-off loss tracking',
    items: [
      { id: 'stock-summary', title: 'Stock Summary (Weighted Average)', subtitle: 'Moving weighted average rate & closing valuation per SKU' },
      { id: 'stock-record', title: 'Stock Record', subtitle: 'Chronological stock inward, sales, bonus, and transfer ledger' },
      { id: 'damaged-record', title: 'Damaged Product Record', subtitle: 'Inventory write-offs and P&L damage loss summary' },
    ],
  },
  {
    group: 'Purchase & Payable Reports',
    description: 'Supplier directory activity, payable aging, purchase register, and supplier returns',
    items: [
      { id: 'supplier-list', title: 'Supplier List Report', subtitle: 'Period purchases, payments & closing payable per supplier' },
      { id: 'payable', title: 'Accounts Payable Statement', subtitle: 'Outstanding supplier liabilities & balances' },
      { id: 'purchase-register', title: 'Purchase Register', subtitle: 'All purchase invoices filtered by date duration' },
      { id: 'purchase-return', title: 'Purchase Return Report', subtitle: 'Goods returned to suppliers within period' },
    ],
  },
  {
    group: 'Sales & Receivable Reports',
    description: 'Customer receivables, sales challan register, sales returns, and credit payment schedules',
    items: [
      { id: 'receivable', title: 'Accounts Receivable Statement', subtitle: 'Customer-wise credit sales, collections & net receivable' },
      { id: 'sales-register', title: 'Sales Register', subtitle: 'Challans, invoices, discounts & bonus quantities' },
      { id: 'sales-return', title: 'Sales Return Report', subtitle: 'Customer returns & restored inventory value' },
      { id: 'payment-schedule', title: 'Payment Schedule', subtitle: 'Credit sales payment periods & upcoming due dates' },
    ],
  },
  {
    group: 'Human Resources & Payroll Reports',
    description: 'Workforce roster, attendance register, and monthly salary disbursement records',
    items: [
      { id: 'hr-employees', title: 'Employee Roster & Salary Sheet', subtitle: 'Complete employee directory and compensation structure' },
      { id: 'hr-attendance', title: 'Attendance Register', subtitle: 'Date-filtered attendance status, check-in & check-out logs' },
      { id: 'hr-payroll', title: 'Payroll Disbursement Summary', subtitle: 'Monthly payroll runs and General Ledger voucher links' },
    ],
  },
];

export const ReportsModule: React.FC<ReportsModuleProps> = ({ onOpenReport }) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-[#DDE7E0] pb-4">
        <p className="text-xs font-medium text-[#1E7134]">Accounts Module / Reports</p>
        <h1 className="text-2xl font-bold text-[#0D2319]">Enterprise Reporting Center</h1>
        <p className="mt-1 text-xs text-[#4B6356]">
          Select any report below to specify a Date Duration filter, preview formatted output, Print, or export to PDF & Excel.
        </p>
      </div>

      <div className="space-y-6">
        {REPORT_GROUPS.map((grp) => (
          <div key={grp.group} className="rounded-xl border border-[#DDE7E0] bg-white p-6">
            <div className="mb-4 border-b border-[#DDE7E0] pb-3">
              <h2 className="text-base font-semibold text-[#07432B]">{grp.group}</h2>
              <p className="text-xs text-[#4B6356]">{grp.description}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {grp.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onOpenReport(item.id, item.title)}
                  className="flex flex-col justify-between rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] p-4 text-left transition-colors hover:border-[#07432B] hover:bg-[#EAF4EE]"
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <FileBarChart className="h-4 w-4 text-[#1E7134]" />
                      <span className="text-[11px] font-medium text-[#07432B]">Print · PDF · Excel</span>
                    </div>
                    <h3 className="text-xs font-semibold text-[#0D2319]">{item.title}</h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#4B6356]">{item.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
