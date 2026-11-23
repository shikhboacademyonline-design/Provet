import React, { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import type { Lang } from '../i18n/translations';
import { labels } from '../i18n/translations';

export type ReportType =
  | 'stock-summary'
  | 'stock-record'
  | 'damaged-record'
  | 'supplier-list'
  | 'payable'
  | 'purchase-register'
  | 'purchase-return'
  | 'receivable'
  | 'sales-register'
  | 'sales-return'
  | 'payment-schedule'
  | 'trial-balance'
  | 'profit-loss'
  | 'balance-sheet'
  | 'retained-earnings'
  | 'receipt-payment'
  | 'hr-employees'
  | 'hr-attendance'
  | 'hr-payroll';

interface DateFilterModalProps {
  reportType: ReportType | null;
  reportTitle: string;
  lang: Lang;
  onClose: () => void;
  onConfirm: (reportType: ReportType, fromDate: string, toDate: string) => void;
}

export const DateFilterModal: React.FC<DateFilterModalProps> = ({
  reportType,
  reportTitle,
  lang,
  onClose,
  onConfirm,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStartStr = `${todayStr.slice(0, 7)}-01`;
  const [fromDate, setFromDate] = useState(monthStartStr);
  const [toDate, setToDate] = useState(todayStr);
  const t = labels[lang];

  if (!reportType) return null;

  const applyPreset = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-[#DDE7E0] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#DDE7E0] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EAF4EE] text-[#07432B]">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#0D2319]">{t.dateDurationTitle}</h3>
              <p className="text-xs text-[#4B6356]">{reportTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#4B6356] hover:bg-[#EAF4EE] hover:text-[#07432B]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(reportType, fromDate, toDate);
          }}
          className="space-y-5 p-6"
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset('2026-11-01', '2026-11-30')}
              className="rounded-md border border-[#DDE7E0] bg-[#F7FAF8] px-2.5 py-1 text-xs font-medium text-[#07432B] hover:bg-[#EAF4EE]"
            >
              Nov 2026
            </button>
            <button
              type="button"
              onClick={() => applyPreset('2026-10-01', '2026-10-31')}
              className="rounded-md border border-[#DDE7E0] bg-[#F7FAF8] px-2.5 py-1 text-xs font-medium text-[#07432B] hover:bg-[#EAF4EE]"
            >
              Oct 2026
            </button>
            <button
              type="button"
              onClick={() => applyPreset('2026-10-01', '2026-11-30')}
              className="rounded-md border border-[#DDE7E0] bg-[#F7FAF8] px-2.5 py-1 text-xs font-medium text-[#07432B] hover:bg-[#EAF4EE]"
            >
              Q4 (Oct – Nov)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('2026-01-01', '2026-12-31')}
              className="rounded-md border border-[#DDE7E0] bg-[#F7FAF8] px-2.5 py-1 text-xs font-medium text-[#07432B] hover:bg-[#EAF4EE]"
            >
              FY 2026
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0D2319]">{t.fromDate}</label>
              <input
                type="date"
                required
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-sm text-[#0D2319] focus:border-[#07432B] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0D2319]">{t.toDate}</label>
              <input
                type="date"
                required
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-sm text-[#0D2319] focus:border-[#07432B] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#DDE7E0] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#DDE7E0] bg-white px-4 py-2 text-sm font-medium text-[#0D2319] hover:bg-[#F7FAF8]"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#07432B] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E7134]"
            >
              {t.generateReport}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
