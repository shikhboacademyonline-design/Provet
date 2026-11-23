import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Box,
  FileSpreadsheet,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { ERPDatabase, PermissionKey } from '../../types/erp';
import {
  computeBalanceSheet,
  computeCustomerBalances,
  computeProfitAndLoss,
  computeSupplierBalances,
  formatCurrency,
  round2,
} from '../../utils/accounting';
import type { ReportType } from '../DateFilterModal';

export type NavSection =
  | 'dashboard'
  | 'stock'
  | 'purchase'
  | 'sales'
  | 'account'
  | 'reports'
  | 'hr';

interface DashboardViewProps {
  db: ERPDatabase;
  canAccess?: (perm: PermissionKey) => boolean;
  onNavigate: (section: NavSection) => void;
  onOpenReport: (type: ReportType, title: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  db,
  canAccess = () => true,
  onNavigate,
  onOpenReport,
}) => {
  const cur = db.company.currency;
  const bs = computeBalanceSheet(db, '2026-12-31');
  const pnl = computeProfitAndLoss(db, '2026-01-01', '2026-12-31');
  const receivables = round2(computeCustomerBalances(db, '2026-01-01', '2026-12-31').reduce((s, c) => s + c.closingReceivable, 0));
  const payables = round2(computeSupplierBalances(db, '2026-01-01', '2026-12-31').reduce((s, p) => s + p.closingPayable, 0));

  const cashAndBank = bs.currentAssets
    .filter((a) => a.code === '1001' || a.code === '1002')
    .reduce((s, a) => s + a.amount, 0);

  const inventoryVal = round2(
    db.products.reduce((s, p) => s + p.stockQty * p.weightedAvgCost, 0)
  );

  const recentVouchers = [...db.journalEntries].reverse().slice(0, 6);

  const todayStr = new Date().toISOString().slice(0, 10);
  const presentToday = db.attendance.filter((a) => a.date === todayStr).filter((a) => a.status === 'Present' || a.status === 'Late').length;

  // Monthly breakdown for chart
  const chartBars = [
    { label: 'Sales', value: pnl.netSales, color: '#07432B' },
    { label: 'COGS', value: pnl.cogs, color: '#6BB13E' },
    { label: 'Gross Profit', value: Math.max(0, pnl.grossProfit), color: '#1E7134' },
    { label: 'OpEx', value: pnl.totalOpEx, color: '#D97706' },
    { label: 'Net Profit', value: Math.max(0, pnl.netProfit), color: '#07432B' },
  ];
  const maxBar = Math.max(1, ...chartBars.map((b) => b.value));

  return (
    <div className="space-y-6">
      {/* Executive Welcome Row */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#DDE7E0] pb-5">
        <div>
          <p className="text-xs font-medium text-[#1E7134]">Provet Enterprise Resource Planning</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0D2319]">
            Financial & Operational Command Center
          </h1>
          <p className="mt-1 text-xs text-[#4B6356]">
            Live double-entry ledger, weighted-average inventory valuation, sales challan dispatch, and HR payroll.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canAccess('sales') && (
            <button
              onClick={() => onNavigate('sales')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1E7134] whitespace-nowrap"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> New Sales Challan
            </button>
          )}
          {canAccess('purchase') && (
            <button
              onClick={() => onNavigate('purchase')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE7E0] bg-white px-3.5 py-2 text-xs font-medium text-[#0D2319] hover:bg-[#EAF4EE] whitespace-nowrap"
            >
              <Receipt className="h-3.5 w-3.5 text-[#07432B]" /> Purchase Invoice
            </button>
          )}
          {(canAccess('account') || canAccess('reports')) && (
            <button
              onClick={() => onOpenReport('balance-sheet', 'Balance Sheet')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE7E0] bg-white px-3.5 py-2 text-xs font-medium text-[#0D2319] hover:bg-[#EAF4EE] whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-[#1E7134]" /> Balance Sheet
            </button>
          )}
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <div className="flex items-center justify-between text-xs text-[#4B6356]">
            <span>Cash & Bank Balance</span>
            <ArrowUpRight className="h-4 w-4 text-[#1E7134]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#07432B] tabular-nums">
            {formatCurrency(cashAndBank, cur)}
          </p>
          <p className="mt-1 text-xs text-[#4B6356]">Cash in Hand + Prime Bank</p>
        </div>

        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <div className="flex items-center justify-between text-xs text-[#4B6356]">
            <span>Inventory (Weighted Avg)</span>
            <Box className="h-4 w-4 text-[#1E7134]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#0D2319] tabular-nums">
            {formatCurrency(inventoryVal, cur)}
          </p>
          <p className="mt-1 text-xs text-[#4B6356]">{db.products.length} Active SKUs in stock</p>
        </div>

        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <div className="flex items-center justify-between text-xs text-[#4B6356]">
            <span>Accounts Receivable</span>
            <TrendingUp className="h-4 w-4 text-[#1E7134]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#0D2319] tabular-nums">
            {formatCurrency(receivables, cur)}
          </p>
          <p className="mt-1 text-xs text-[#4B6356]">{db.customers.length} Active Customers</p>
        </div>

        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <div className="flex items-center justify-between text-xs text-[#4B6356]">
            <span>Accounts Payable</span>
            <ArrowDownRight className="h-4 w-4 text-[#D97706]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#0D2319] tabular-nums">
            {formatCurrency(payables, cur)}
          </p>
          <p className="mt-1 text-xs text-[#4B6356]">{db.suppliers.length} Registered Suppliers</p>
        </div>
      </div>

      {/* Main Split: P&L Performance + Module Access */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#DDE7E0] pb-4">
            <div>
              <h2 className="text-base font-semibold text-[#0D2319]">Q4 Financial Performance (P&L)</h2>
              <p className="text-xs text-[#4B6356]">Accrual Income Statement breakdown</p>
            </div>
            {(canAccess('account') || canAccess('reports')) && (
              <button
                onClick={() => onOpenReport('profit-loss', 'Profit & Loss Account')}
                className="text-xs font-medium text-[#07432B] hover:underline"
              >
                Open Full P&L Statement
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4 border-b border-[#DDE7E0] pb-5">
            <div>
              <p className="text-xs text-[#4B6356]">Net Sales Revenue</p>
              <p className="mt-1 font-mono text-lg font-bold text-[#0D2319] tabular-nums">
                {formatCurrency(pnl.netSales, cur)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#4B6356]">Gross Profit</p>
              <p className="mt-1 font-mono text-lg font-bold text-[#1E7134] tabular-nums">
                {formatCurrency(pnl.grossProfit, cur)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#4B6356]">Net Profit / (Loss)</p>
              <p className={`mt-1 font-mono text-lg font-bold tabular-nums ${pnl.netProfit >= 0 ? 'text-[#07432B]' : 'text-[#DC2626]'}`}>
                {formatCurrency(pnl.netProfit, cur)}
              </p>
            </div>
          </div>

          {/* Crisp Visual Bar Comparison */}
          <div className="mt-6 space-y-3">
            {chartBars.map((bar) => (
              <div key={bar.label} className="grid grid-cols-12 items-center gap-3 text-xs">
                <span className="col-span-3 font-medium text-[#0D2319]">{bar.label}</span>
                <div className="col-span-6 h-3 overflow-hidden rounded-full bg-[#EAF4EE]">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(4, Math.min(100, (bar.value / maxBar) * 100))}%`,
                      backgroundColor: bar.color,
                    }}
                  />
                </div>
                <span className="col-span-3 text-right font-mono font-medium text-[#0D2319] tabular-nums">
                  {formatCurrency(bar.value, cur)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Module Shortcuts & HR Pulse */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
            <h2 className="text-base font-semibold text-[#0D2319]">ERP Modules</h2>
            <p className="mt-0.5 text-xs text-[#4B6356]">Direct workspace access across Accounts & HR</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {[
                { id: 'stock' as const, title: 'Stock Module', desc: '5 Ops · 3 Reports' },
                { id: 'purchase' as const, title: 'Purchase Module', desc: 'Suppliers · Invoices' },
                { id: 'sales' as const, title: 'Sales Module', desc: 'Challans · Pricing' },
                { id: 'account' as const, title: 'Account Module', desc: 'Vouchers · Statements' },
                { id: 'reports' as const, title: 'Reports Hub', desc: '18 Exportable Reports' },
                { id: 'hr' as const, title: 'HR & Payroll', desc: `${db.employees.length} Staff · ${presentToday} Present` },
              ]
                .filter((m) => canAccess(m.id))
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onNavigate(m.id)}
                    className="rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] p-3 text-left transition-colors hover:border-[#07432B] hover:bg-[#EAF4EE]"
                  >
                    <p className="text-xs font-semibold text-[#07432B]">{m.title}</p>
                    <p className="mt-0.5 text-[11px] text-[#4B6356]">{m.desc}</p>
                  </button>
                ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#07432B]" />
                <h3 className="text-sm font-semibold text-[#0D2319]">HR & Workforce Snapshot</h3>
              </div>
              {canAccess('hr') && (
                <button onClick={() => onNavigate('hr')} className="text-xs font-medium text-[#07432B] hover:underline">
                  Manage HR
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-[#F7FAF8] p-3">
                <span className="text-[#4B6356]">Total Staff</span>
                <p className="mt-1 font-mono text-base font-bold text-[#0D2319]">{db.employees.length}</p>
              </div>
              <div className="rounded-lg bg-[#F7FAF8] p-3">
                <span className="text-[#4B6356]">Present Today</span>
                <p className="mt-1 font-mono text-base font-bold text-[#1E7134]">{presentToday}</p>
              </div>
              <div className="rounded-lg bg-[#F7FAF8] p-3">
                <span className="text-[#4B6356]">Pending Leaves</span>
                <p className="mt-1 font-mono text-base font-bold text-[#D97706]">
                  {db.leaves.filter((l) => l.status === 'Pending').length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Ledger Vouchers & Stock Watchlist */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#DDE7E0] pb-3">
            <h2 className="text-sm font-semibold text-[#0D2319]">Recent Double-Entry Vouchers</h2>
            {canAccess('account') && (
              <button onClick={() => onNavigate('account')} className="text-xs font-medium text-[#07432B] hover:underline">
                View All Vouchers
              </button>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                  <th className="py-2 pr-3 font-medium">Voucher</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Narration</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {recentVouchers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-[#4B6356]">
                      No double-entry vouchers recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentVouchers.map((je) => {
                    const total = je.lines.reduce((s, l) => s + l.debit, 0);
                    return (
                      <tr key={je.id} className="hover:bg-[#F7FAF8]">
                        <td className="py-2.5 pr-3 font-mono font-medium text-[#07432B]">{je.voucherNo}</td>
                        <td className="py-2.5 pr-3 text-[#4B6356] tabular-nums">{je.date}</td>
                        <td className="py-2.5 pr-3 font-medium text-[#0D2319]">{je.voucherType}</td>
                        <td className="max-w-[260px] truncate py-2.5 pr-3 text-[#4B6356]">{je.narration}</td>
                        <td className="py-2.5 text-right font-mono font-semibold text-[#0D2319] tabular-nums">
                          {formatCurrency(total, cur)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#DDE7E0] pb-3">
            <h2 className="text-sm font-semibold text-[#0D2319]">Inventory Valuation Watchlist</h2>
            {canAccess('stock') && (
              <button onClick={() => onNavigate('stock')} className="text-xs font-medium text-[#07432B] hover:underline">
                Open Stock
              </button>
            )}
          </div>
          <div className="mt-3 space-y-2.5">
            {db.products.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#4B6356]">No products in stock yet.</p>
            ) : (
              db.products.slice(0, 5).map((p) => {
                const isLow = p.stockQty <= p.reorderLevel;
                return (
                  <div key={p.id} className="flex items-center justify-between border-b border-[#DDE7E0]/60 pb-2 text-xs last:border-0">
                    <div>
                      <p className="font-medium text-[#0D2319]">{p.name}</p>
                      <p className="text-[11px] text-[#4B6356]">
                        {p.location} · Avg {formatCurrency(p.weightedAvgCost, cur)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono font-semibold tabular-nums ${isLow ? 'text-[#DC2626]' : 'text-[#07432B]'}`}>
                        {p.stockQty} {p.unit}
                      </p>
                      <p className="text-[11px] text-[#4B6356]">
                        {isLow ? 'Reorder Soon' : 'Healthy Stock'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
