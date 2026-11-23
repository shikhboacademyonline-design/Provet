import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BookOpen, FileBarChart, Landmark, Repeat } from 'lucide-react';
import type { ERPDatabase, JournalEntry } from '../../types/erp';
import { computeTrialBalance, formatCurrency } from '../../utils/accounting';
import { apiFetch } from '../../utils/api';
import type { ReportType } from '../DateFilterModal';
import type { Lang } from '../../i18n/translations';
import { labels } from '../../i18n/translations';

interface AccountModuleProps {
  db: ERPDatabase;
  lang: Lang;
  onRefresh: (newDb: ERPDatabase) => void;
  onOpenReport: (type: ReportType, title: string) => void;
}

type VoucherTab = 'Receipt' | 'Payment' | 'Journal' | 'Contra' | 'COA';

export const AccountModule: React.FC<AccountModuleProps> = ({ db, lang, onRefresh, onOpenReport }) => {
  const t = labels[lang];
  const cur = db.company.currency;
  const [activeTab, setActiveTab] = useState<VoucherTab>('Receipt');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [partyName, setPartyName] = useState('');
  const [narration, setNarration] = useState('');
  const [cashOrBankId, setCashOrBankId] = useState('acc-1002');
  const [otherAccountId, setOtherAccountId] = useState('acc-1100');
  const [contraFromId, setContraFromId] = useState('acc-1001');
  const [contraToId, setContraToId] = useState('acc-1002');
  const [amount, setAmount] = useState(10000);

  // Multi-line general journal
  const [journalLines, setJournalLines] = useState([
    { accountId: 'acc-5300', debit: 5000, credit: 0 },
    { accountId: 'acc-1001', debit: 0, credit: 5000 },
  ]);

  const cashBankAccounts = db.accounts.filter((a) => a.id === 'acc-1001' || a.id === 'acc-1002');
  const { rows: coaRows } = computeTrialBalance(db, '2026-10-01', '2026-12-31');

  const handleSubmitVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    let lines: JournalEntry['lines'] = [];
    if (activeTab === 'Receipt') {
      const dr = db.accounts.find((a) => a.id === cashOrBankId)!;
      const cr = db.accounts.find((a) => a.id === otherAccountId)!;
      lines = [
        { accountId: dr.id, accountCode: dr.code, accountName: dr.name, debit: Number(amount), credit: 0 },
        { accountId: cr.id, accountCode: cr.code, accountName: cr.name, debit: 0, credit: Number(amount) },
      ];
    } else if (activeTab === 'Payment') {
      const dr = db.accounts.find((a) => a.id === otherAccountId)!;
      const cr = db.accounts.find((a) => a.id === cashOrBankId)!;
      lines = [
        { accountId: dr.id, accountCode: dr.code, accountName: dr.name, debit: Number(amount), credit: 0 },
        { accountId: cr.id, accountCode: cr.code, accountName: cr.name, debit: 0, credit: Number(amount) },
      ];
    } else if (activeTab === 'Contra') {
      if (contraFromId === contraToId) {
        return setFeedback({ type: 'err', msg: 'Source and Destination Cash/Bank accounts must be different.' });
      }
      const fromAcc = db.accounts.find((a) => a.id === contraFromId)!;
      const toAcc = db.accounts.find((a) => a.id === contraToId)!;
      lines = [
        { accountId: toAcc.id, accountCode: toAcc.code, accountName: toAcc.name, debit: Number(amount), credit: 0 },
        { accountId: fromAcc.id, accountCode: fromAcc.code, accountName: fromAcc.name, debit: 0, credit: Number(amount) },
      ];
    } else if (activeTab === 'Journal') {
      lines = journalLines.map((jl) => {
        const acc = db.accounts.find((a) => a.id === jl.accountId)!;
        return {
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          debit: Number(jl.debit || 0),
          credit: Number(jl.credit || 0),
        };
      });
    }

    const res = await apiFetch('/api/erp/vouchers', {
      method: 'POST',
      body: JSON.stringify({
        voucherType: activeTab,
        date,
        partyName,
        narration: narration || `${activeTab} Voucher`,
        lines,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setNarration('');
    setPartyName('');
    setFeedback({ type: 'ok', msg: `${activeTab} Voucher ${data.entry.voucherNo} posted to General Ledger.` });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE7E0] pb-4">
        <div>
          <p className="text-xs font-medium text-[#1E7134]">Accounts Module / Account</p>
          <h1 className="text-2xl font-bold text-[#0D2319]">General Ledger, Vouchers & Statements</h1>
        </div>
        <button
          onClick={() => setActiveTab('COA')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE7E0] bg-white px-3.5 py-2 text-xs font-semibold text-[#0D2319] hover:bg-[#EAF4EE]"
        >
          <Landmark className="h-3.5 w-3.5 text-[#07432B]" /> Chart of Accounts
        </button>
      </div>

      {/* Exact 2-Column Command Hub */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Column 1: Vouchers */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold text-[#4B6356]">Column 1 · {t.vouchers}</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'Receipt' as const, label: 'Receipt', icon: ArrowDownLeft },
              { id: 'Payment' as const, label: 'Payment', icon: ArrowUpRight },
              { id: 'Journal' as const, label: 'Journal', icon: BookOpen },
              { id: 'Contra' as const, label: 'Contra', icon: Repeat },
            ].map((v) => {
              const Icon = v.icon;
              const active = activeTab === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setActiveTab(v.id);
                    if (v.id === 'Receipt') setOtherAccountId('acc-1100');
                    if (v.id === 'Payment') setOtherAccountId('acc-2001');
                  }}
                  className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                    active
                      ? 'border-[#07432B] bg-[#07432B] text-white'
                      : 'border-[#DDE7E0] bg-[#F7FAF8] text-[#0D2319] hover:bg-[#EAF4EE]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 2: Financial Statements */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold text-[#4B6356]">Column 2 · {t.financialStatements}</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'trial-balance' as const, label: 'Trial Balance' },
              { id: 'profit-loss' as const, label: 'Profit and Loss Account' },
              { id: 'balance-sheet' as const, label: 'Balance Sheet' },
              { id: 'retained-earnings' as const, label: 'Retained Earnings' },
              { id: 'receipt-payment' as const, label: 'Receipt And Payment' },
            ].map((rep, idx) => (
              <button
                key={rep.id}
                onClick={() => onOpenReport(rep.id, rep.label)}
                className={`flex items-center gap-2 rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-3 py-2.5 text-left text-xs font-medium text-[#0D2319] hover:border-[#07432B] hover:bg-[#EAF4EE] ${
                  idx === 4 ? 'col-span-2' : ''
                }`}
              >
                <FileBarChart className="h-3.5 w-3.5 shrink-0 text-[#1E7134]" />
                <span className="truncate">{rep.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-[#1E7134]/30 bg-[#EAF4EE] text-[#07432B]'
              : 'border-[#DC2626]/30 bg-red-50 text-[#DC2626]'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Workspace */}
      {activeTab === 'COA' ? (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <h3 className="mb-4 text-base font-semibold text-[#0D2319]">Chart of Accounts & Current Balances</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Account Name</th>
                  <th className="px-3 py-2.5">Class</th>
                  <th className="px-3 py-2.5 text-right">Debit Balance</th>
                  <th className="px-3 py-2.5 text-right">Credit Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {coaRows.map((r) => (
                  <tr key={r.accountId} className="hover:bg-[#F7FAF8]">
                    <td className="px-3 py-2.5 font-mono text-[#07432B]">{r.code}</td>
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-[#4B6356]">{r.type}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {r.closingDebit ? formatCurrency(r.closingDebit, cur) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {r.closingCredit ? formatCurrency(r.closingCredit, cur) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSubmitVoucher} className="space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-5">
            <h3 className="text-base font-semibold text-[#0D2319]">{activeTab} Voucher Entry</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Voucher Date</label>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              {activeTab !== 'Journal' && (
                <div>
                  <label className="mb-1 block text-xs font-medium">Amount ({cur})</label>
                  <input type="number" min={1} step="0.01" required value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 font-mono text-xs" />
                </div>
              )}
            </div>

            {(activeTab === 'Receipt' || activeTab === 'Payment') && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    {activeTab === 'Receipt' ? 'Deposit Into (Dr Cash / Bank)' : 'Paid From (Cr Cash / Bank)'}
                  </label>
                  <select value={cashOrBankId} onChange={(e) => setCashOrBankId(e.target.value)} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                    {cashBankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    {activeTab === 'Receipt' ? 'Received From Account (Cr)' : 'Paid Towards Account (Dr)'}
                  </label>
                  <select value={otherAccountId} onChange={(e) => setOtherAccountId(e.target.value)} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                    {db.accounts
                      .filter((a) => a.id !== cashOrBankId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    Party / Customer / Supplier Name
                  </label>
                  <input
                    type="text"
                    list="party-suggestions"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    placeholder="Select or type party name (links to Receivable/Payable)"
                    className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                  />
                  <datalist id="party-suggestions">
                    {db.customers.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                    {db.suppliers.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </div>
              </>
            )}

            {activeTab === 'Contra' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">From Account (Cr)</label>
                  <select value={contraFromId} onChange={(e) => setContraFromId(e.target.value)} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                    {cashBankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">To Account (Dr)</label>
                  <select value={contraToId} onChange={(e) => setContraToId(e.target.value)} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                    {cashBankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'Journal' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold">Balanced Journal Lines</label>
                  <button
                    type="button"
                    onClick={() => setJournalLines([...journalLines, { accountId: 'acc-1001', debit: 0, credit: 0 }])}
                    className="text-xs font-medium text-[#07432B] hover:underline"
                  >
                    + Add Line
                  </button>
                </div>
                {journalLines.map((jl, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select
                      value={jl.accountId}
                      onChange={(e) => {
                        const next = [...journalLines];
                        next[idx].accountId = e.target.value;
                        setJournalLines(next);
                      }}
                      className="col-span-6 rounded border border-[#DDE7E0] px-2 py-1.5 text-xs"
                    >
                      {db.accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      placeholder="Dr"
                      value={jl.debit}
                      onChange={(e) => {
                        const next = [...journalLines];
                        next[idx].debit = Number(e.target.value);
                        setJournalLines(next);
                      }}
                      className="col-span-3 rounded border border-[#DDE7E0] px-2 py-1.5 font-mono text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Cr"
                      value={jl.credit}
                      onChange={(e) => {
                        const next = [...journalLines];
                        next[idx].credit = Number(e.target.value);
                        setJournalLines(next);
                      }}
                      className="col-span-3 rounded border border-[#DDE7E0] px-2 py-1.5 font-mono text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium">Narration</label>
              <input type="text" required value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Transaction particulars..." className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>

            <button type="submit" className="w-full rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
              Post {activeTab} Voucher
            </button>
          </form>

          {/* Voucher Register */}
          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-7">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">General Ledger Voucher Register</h3>
            {db.journalEntries.length === 0 ? (
              <p className="py-12 text-center text-xs text-[#4B6356]">No vouchers posted yet.</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                      <th className="py-2">Voucher No</th>
                      <th className="py-2">Date</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Accounts Impacted</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DDE7E0]">
                    {[...db.journalEntries].reverse().map((je) => {
                      const tot = je.lines.reduce((s, l) => s + l.debit, 0);
                      return (
                        <tr key={je.id} className="hover:bg-[#F7FAF8]">
                          <td className="py-2.5 font-mono font-medium text-[#07432B]">{je.voucherNo}</td>
                          <td className="py-2.5 text-[#4B6356] tabular-nums">{je.date}</td>
                          <td className="py-2.5 font-medium">{je.voucherType}</td>
                          <td className="py-2.5 text-[#4B6356]">
                            <p className="font-medium text-[#0D2319]">{je.narration}</p>
                            <p className="text-[11px]">
                              {je.lines.map((l) => `${l.accountName} (${l.debit > 0 ? 'Dr' : 'Cr'} ${formatCurrency(l.debit || l.credit, cur)})`).join(' · ')}
                            </p>
                          </td>
                          <td className="py-2.5 text-right font-mono font-semibold tabular-nums">{formatCurrency(tot, cur)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
