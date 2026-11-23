import React, { useState } from 'react';
import { ClipboardList, FileBarChart, FileCheck, FileSpreadsheet, Plus, RotateCcw, Users, X } from 'lucide-react';
import type { ERPDatabase } from '../../types/erp';
import { formatCurrency } from '../../utils/accounting';
import { apiFetch } from '../../utils/api';
import type { ReportType } from '../DateFilterModal';
import type { Lang } from '../../i18n/translations';
import { labels } from '../../i18n/translations';

interface PurchaseModuleProps {
  db: ERPDatabase;
  lang: Lang;
  onRefresh: (newDb: ERPDatabase) => void;
  onOpenReport: (type: ReportType, title: string) => void;
}

type PurchasePanel = 'suppliers' | 'pr' | 'quotation' | 'invoice' | 'return';

export const PurchaseModule: React.FC<PurchaseModuleProps> = ({ db, lang, onRefresh, onOpenReport }) => {
  const t = labels[lang];
  const cur = db.company.currency;
  const [activePanel, setActivePanel] = useState<PurchasePanel>('suppliers');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Add Supplier State
  const [newSup, setNewSup] = useState({
    name: '',
    address: '',
    mobile: '',
    telephone: '',
    email: '',
    openingBalance: 0,
  });

  // PR State
  const [prForm, setPrForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    requestedBy: '',
    department: 'Supply Chain',
    productId: db.products[0]?.id || '',
    qty: 50,
    unitCost: db.products[0]?.weightedAvgCost || 0,
    notes: '',
  });

  // Quotation State
  const [quotForm, setQuotForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    validUntil: '2026-12-15',
    supplierId: db.suppliers[0]?.id || '',
    productId: db.products[0]?.id || '',
    qty: 50,
    unitCost: db.products[0]?.weightedAvgCost || 0,
    notes: '',
  });

  // Purchase Invoice State
  const [invForm, setInvForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    supplierId: db.suppliers[0]?.id || '',
    paymentType: 'Credit' as 'Cash' | 'Bank' | 'Credit',
    discountAmount: 0,
    notes: '',
    items: [
      {
        productId: db.products[0]?.id || '',
        qty: 25,
        unitCost: db.products[0]?.weightedAvgCost || 0,
      },
    ],
  });

  // Purchase Return State
  const [retForm, setRetForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    supplierId: db.suppliers[0]?.id || '',
    invoiceRef: '',
    productId: db.products[0]?.id || '',
    qty: 5,
    unitCost: db.products[0]?.weightedAvgCost || 0,
    reason: '',
  });

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/erp/suppliers', {
      method: 'POST',
      body: JSON.stringify(newSup),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setShowSupplierModal(false);
    setNewSup({ name: '', address: '', mobile: '', telephone: '', email: '', openingBalance: 0 });
    setFeedback({ type: 'ok', msg: `Supplier "${data.supplier.name}" added to Supplier List.` });
  };

  const handleSavePR = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = db.products.find((p) => p.id === (prForm.productId || db.products[0]?.id));
    if (!prod) return setFeedback({ type: 'err', msg: 'Please add a product in Stock first.' });
    const total = Number(prForm.qty) * Number(prForm.unitCost);
    const res = await apiFetch('/api/erp/purchase-requisitions', {
      method: 'POST',
      body: JSON.stringify({
        date: prForm.date,
        requestedBy: prForm.requestedBy,
        department: prForm.department,
        status: 'Pending',
        items: [{ productId: prod.id, productName: prod.name, qty: Number(prForm.qty), unitCost: Number(prForm.unitCost), discount: 0, total }],
        notes: prForm.notes,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setFeedback({ type: 'ok', msg: `Purchase Requisition ${data.pr.prNo} saved.` });
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = db.products.find((p) => p.id === (quotForm.productId || db.products[0]?.id));
    const supplierId = quotForm.supplierId || db.suppliers[0]?.id;
    if (!prod || !supplierId) {
      return setFeedback({ type: 'err', msg: 'Please add at least one Supplier and one Product first.' });
    }
    const totalAmount = Number(quotForm.qty) * Number(quotForm.unitCost);
    const res = await apiFetch('/api/erp/purchase-quotations', {
      method: 'POST',
      body: JSON.stringify({
        date: quotForm.date,
        validUntil: quotForm.validUntil,
        supplierId,
        items: [{ productId: prod.id, productName: prod.name, qty: Number(quotForm.qty), unitCost: Number(quotForm.unitCost), discount: 0, total: totalAmount }],
        totalAmount,
        notes: quotForm.notes,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setFeedback({ type: 'ok', msg: `Supplier Quotation ${data.pq.quotNo} saved.` });
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const supplierId = invForm.supplierId || db.suppliers[0]?.id;
    if (!supplierId) return setFeedback({ type: 'err', msg: 'Please add a Supplier first.' });
    const mappedItems = invForm.items
      .map((it) => {
        const prod = db.products.find((p) => p.id === (it.productId || db.products[0]?.id));
        if (!prod) return null;
        return {
          productId: prod.id,
          productName: prod.name,
          qty: Number(it.qty),
          unitCost: Number(it.unitCost),
          discount: 0,
          total: Number(it.qty) * Number(it.unitCost),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (mappedItems.length === 0) return setFeedback({ type: 'err', msg: 'Please add a Product in Stock first.' });

    const res = await apiFetch('/api/erp/purchase-invoices', {
      method: 'POST',
      body: JSON.stringify({
        date: invForm.date,
        supplierId,
        paymentType: invForm.paymentType,
        discountAmount: Number(invForm.discountAmount),
        notes: invForm.notes,
        items: mappedItems,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setFeedback({
      type: 'ok',
      msg: `Purchase Invoice ${data.invoice.invoiceNo} posted. Stock Weighted Average Cost and Payable Ledger updated.`,
    });
  };

  const handleSaveReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = db.products.find((p) => p.id === (retForm.productId || db.products[0]?.id));
    const supplierId = retForm.supplierId || db.suppliers[0]?.id;
    if (!prod || !supplierId) {
      return setFeedback({ type: 'err', msg: 'Please ensure both a Supplier and a Product exist.' });
    }
    const res = await apiFetch('/api/erp/purchase-returns', {
      method: 'POST',
      body: JSON.stringify({
        date: retForm.date,
        supplierId,
        invoiceRef: retForm.invoiceRef,
        items: [{ productId: prod.id, productName: prod.name, qty: Number(retForm.qty), unitCost: Number(retForm.unitCost), discount: 0, total: Number(retForm.qty) * Number(retForm.unitCost) }],
        reason: retForm.reason,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setFeedback({ type: 'ok', msg: `Purchase Return ${data.ret.returnNo} recorded.` });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE7E0] pb-4">
        <div>
          <p className="text-xs font-medium text-[#1E7134]">Accounts Module / Purchase</p>
          <h1 className="text-2xl font-bold text-[#0D2319]">Procurement & Supplier Ledger</h1>
        </div>
        <button
          onClick={() => {
            setActivePanel('suppliers');
            setShowSupplierModal(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]"
        >
          <Plus className="h-4 w-4" /> Add Supplier
        </button>
      </div>

      {/* Exact 3-Column Command Hub */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Column 1 */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold text-[#4B6356]">Column 1 · {t.masterSetup}</h2>
          <button
            onClick={() => setActivePanel('suppliers')}
            className={`flex w-full items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-xs font-medium transition-colors ${
              activePanel === 'suppliers'
                ? 'border-[#07432B] bg-[#07432B] text-white'
                : 'border-[#DDE7E0] bg-[#F7FAF8] text-[#0D2319] hover:bg-[#EAF4EE]'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Supplier List ({db.suppliers.length})</span>
          </button>
        </div>

        {/* Column 2 */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold text-[#4B6356]">Column 2 · {t.transactions}</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'pr' as const, label: 'Purchase Requisition', icon: ClipboardList },
              { id: 'quotation' as const, label: 'Quotation', icon: FileCheck },
              { id: 'invoice' as const, label: 'Purchases Invoice', icon: FileSpreadsheet },
              { id: 'return' as const, label: 'Product Return', icon: RotateCcw },
            ].map((item) => {
              const Icon = item.icon;
              const active = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePanel(item.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    active
                      ? 'border-[#07432B] bg-[#07432B] text-white'
                      : 'border-[#DDE7E0] bg-[#F7FAF8] text-[#0D2319] hover:bg-[#EAF4EE]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 3 */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold text-[#4B6356]">Column 3 · {t.reportsColumn}</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'supplier-list' as const, label: 'Supplier List' },
              { id: 'payable' as const, label: 'Payable' },
              { id: 'purchase-register' as const, label: 'Purchase Register' },
              { id: 'purchase-return' as const, label: 'Product Return' },
            ].map((rep) => (
              <button
                key={rep.id}
                onClick={() => onOpenReport(rep.id, `Purchase · ${rep.label}`)}
                className="flex items-center gap-2 rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-3 py-2.5 text-left text-xs font-medium text-[#0D2319] hover:border-[#07432B] hover:bg-[#EAF4EE]"
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

      {/* Workspace Views */}
      {activePanel === 'suppliers' && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#0D2319]">Supplier Directory</h3>
            <button
              onClick={() => setShowSupplierModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1E7134]"
            >
              <Plus className="h-3.5 w-3.5" /> Add Supplier
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                  <th className="px-3 py-2.5 font-semibold">Code</th>
                  <th className="px-3 py-2.5 font-semibold">Supplier Name</th>
                  <th className="px-3 py-2.5 font-semibold">Address</th>
                  <th className="px-3 py-2.5 font-semibold">Mobile</th>
                  <th className="px-3 py-2.5 font-semibold">Telephone</th>
                  <th className="px-3 py-2.5 font-semibold">Email</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Opening Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-xs text-[#4B6356]">
                      No suppliers added yet. Click &ldquo;Add Supplier&rdquo; to register your first vendor.
                    </td>
                  </tr>
                ) : (
                  db.suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-[#F7FAF8]">
                      <td className="px-3 py-2.5 font-mono text-[#07432B]">{s.code}</td>
                      <td className="px-3 py-2.5 font-medium text-[#0D2319]">{s.name}</td>
                      <td className="px-3 py-2.5 text-[#4B6356]">{s.address}</td>
                      <td className="px-3 py-2.5 font-mono">{s.mobile}</td>
                      <td className="px-3 py-2.5 font-mono text-[#4B6356]">{s.telephone || '-'}</td>
                      <td className="px-3 py-2.5 text-[#4B6356]">{s.email}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCurrency(s.openingBalance, cur)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePanel === 'pr' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSavePR} className="space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-5">
            <h3 className="text-base font-semibold text-[#0D2319]">Purchase Requisition Form</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Date</label>
                <input type="date" required value={prForm.date} onChange={(e) => setPrForm({ ...prForm, date: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Requested By</label>
                <input type="text" required value={prForm.requestedBy} onChange={(e) => setPrForm({ ...prForm, requestedBy: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Product</label>
              <select
                value={prForm.productId}
                onChange={(e) => {
                  const p = db.products.find((x) => x.id === e.target.value);
                  setPrForm({ ...prForm, productId: e.target.value, unitCost: p?.weightedAvgCost || 0 });
                }}
                className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
              >
                {db.products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Qty</label>
                <input type="number" min={1} required value={prForm.qty} onChange={(e) => setPrForm({ ...prForm, qty: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Estimated Cost</label>
                <input type="number" min={0} step="0.01" required value={prForm.unitCost} onChange={(e) => setPrForm({ ...prForm, unitCost: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Notes</label>
              <input type="text" value={prForm.notes} onChange={(e) => setPrForm({ ...prForm, notes: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
              Save Purchase Requisition
            </button>
          </form>
          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-7">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">Saved Purchase Requisitions</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                  <th className="py-2">PR No</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Requested By</th>
                  <th className="py-2">Items</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.purchaseRequisitions.map((pr) => (
                  <tr key={pr.id}>
                    <td className="py-2.5 font-mono font-medium text-[#07432B]">{pr.prNo}</td>
                    <td className="py-2.5 text-[#4B6356]">{pr.date}</td>
                    <td className="py-2.5">{pr.requestedBy}</td>
                    <td className="py-2.5">{pr.items.map((i) => `${i.productName} × ${i.qty}`).join(', ')}</td>
                    <td className="py-2.5 font-medium text-[#1E7134]">{pr.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePanel === 'quotation' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSaveQuotation} className="space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-5">
            <h3 className="text-base font-semibold text-[#0D2319]">Supplier Quotation Form</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Date</label>
                <input type="date" required value={quotForm.date} onChange={(e) => setQuotForm({ ...quotForm, date: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Valid Until</label>
                <input type="date" required value={quotForm.validUntil} onChange={(e) => setQuotForm({ ...quotForm, validUntil: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Supplier</label>
              <select value={quotForm.supplierId} onChange={(e) => setQuotForm({ ...quotForm, supplierId: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                {db.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="mb-1 block text-xs font-medium">Product</label>
                <select value={quotForm.productId} onChange={(e) => setQuotForm({ ...quotForm, productId: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                  {db.products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Qty</label>
                <input type="number" min={1} required value={quotForm.qty} onChange={(e) => setQuotForm({ ...quotForm, qty: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Quoted Rate</label>
                <input type="number" min={0} step="0.01" required value={quotForm.unitCost} onChange={(e) => setQuotForm({ ...quotForm, unitCost: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <button type="submit" className="w-full rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
              Save Quotation
            </button>
          </form>

          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-7">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">Supplier Quotations</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                  <th className="py-2">Quot No</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Supplier</th>
                  <th className="py-2">Valid Until</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.purchaseQuotations.map((q) => (
                  <tr key={q.id}>
                    <td className="py-2.5 font-mono font-medium text-[#07432B]">{q.quotNo}</td>
                    <td className="py-2.5 text-[#4B6356]">{q.date}</td>
                    <td className="py-2.5">{q.supplierName}</td>
                    <td className="py-2.5 text-[#4B6356]">{q.validUntil}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">{formatCurrency(q.totalAmount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePanel === 'invoice' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSaveInvoice} className="space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-6">
            <h3 className="text-base font-semibold text-[#0D2319]">Purchases Invoice Form</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Invoice Date</label>
                <input type="date" required value={invForm.date} onChange={(e) => setInvForm({ ...invForm, date: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Supplier</label>
                <select value={invForm.supplierId} onChange={(e) => setInvForm({ ...invForm, supplierId: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                  {db.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Payment Type</label>
                <select value={invForm.paymentType} onChange={(e) => setInvForm({ ...invForm, paymentType: e.target.value as 'Cash' | 'Bank' | 'Credit' })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                  <option value="Credit">Credit (Payable)</option>
                  <option value="Bank">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#0D2319]">Line Items</label>
                <button
                  type="button"
                  onClick={() =>
                    setInvForm({
                      ...invForm,
                      items: [...invForm.items, { productId: db.products[0]?.id || '', qty: 10, unitCost: db.products[0]?.weightedAvgCost || 0 }],
                    })
                  }
                  className="text-xs font-medium text-[#07432B] hover:underline"
                >
                  + Add Line
                </button>
              </div>
              {invForm.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-2">
                  <select
                    value={item.productId}
                    onChange={(e) => {
                      const p = db.products.find((x) => x.id === e.target.value);
                      const next = [...invForm.items];
                      next[idx] = { ...next[idx], productId: e.target.value, unitCost: p?.weightedAvgCost || 0 };
                      setInvForm({ ...invForm, items: next });
                    }}
                    className="col-span-6 rounded-lg border border-[#DDE7E0] px-2.5 py-1.5 text-xs"
                  >
                    {db.products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => {
                      const next = [...invForm.items];
                      next[idx] = { ...next[idx], qty: Number(e.target.value) };
                      setInvForm({ ...invForm, items: next });
                    }}
                    className="col-span-3 rounded-lg border border-[#DDE7E0] px-2.5 py-1.5 text-xs"
                    placeholder="Qty"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unitCost}
                    onChange={(e) => {
                      const next = [...invForm.items];
                      next[idx] = { ...next[idx], unitCost: Number(e.target.value) };
                      setInvForm({ ...invForm, items: next });
                    }}
                    className="col-span-3 rounded-lg border border-[#DDE7E0] px-2.5 py-1.5 text-xs"
                    placeholder="Cost"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Discount Amount</label>
                <input type="number" min={0} value={invForm.discountAmount} onChange={(e) => setInvForm({ ...invForm, discountAmount: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Notes</label>
                <input type="text" value={invForm.notes} onChange={(e) => setInvForm({ ...invForm, notes: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[#EAF4EE] px-4 py-2.5 text-xs">
              <span>Net Invoice Payable</span>
              <span className="font-mono font-bold text-[#07432B]">
                {formatCurrency(
                  Math.max(0, invForm.items.reduce((s, i) => s + i.qty * i.unitCost, 0) - invForm.discountAmount),
                  cur
                )}
              </span>
            </div>

            <button type="submit" className="w-full rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
              Post Purchase Invoice
            </button>
          </form>

          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-6">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">Recent Purchase Invoices</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                  <th className="py-2">Invoice</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Supplier</th>
                  <th className="py-2">Type</th>
                  <th className="py-2 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.purchaseInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 font-mono font-medium text-[#07432B]">{inv.invoiceNo}</td>
                    <td className="py-2.5 text-[#4B6356]">{inv.date}</td>
                    <td className="py-2.5">{inv.supplierName}</td>
                    <td className="py-2.5">{inv.paymentType}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">{formatCurrency(inv.netAmount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePanel === 'return' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSaveReturn} className="space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-5">
            <h3 className="text-base font-semibold text-[#0D2319]">Purchase Product Return Form</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Return Date</label>
                <input type="date" required value={retForm.date} onChange={(e) => setRetForm({ ...retForm, date: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Invoice Ref</label>
                <input type="text" placeholder="PI-2026-001" value={retForm.invoiceRef} onChange={(e) => setRetForm({ ...retForm, invoiceRef: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Supplier</label>
              <select value={retForm.supplierId} onChange={(e) => setRetForm({ ...retForm, supplierId: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                {db.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="mb-1 block text-xs font-medium">Product</label>
                <select
                  value={retForm.productId}
                  onChange={(e) => {
                    const p = db.products.find((x) => x.id === e.target.value);
                    setRetForm({ ...retForm, productId: e.target.value, unitCost: p?.weightedAvgCost || 0 });
                  }}
                  className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                >
                  {db.products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.stockQty})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Return Qty</label>
                <input type="number" min={1} required value={retForm.qty} onChange={(e) => setRetForm({ ...retForm, qty: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Unit Cost</label>
                <input type="number" min={0} step="0.01" required value={retForm.unitCost} onChange={(e) => setRetForm({ ...retForm, unitCost: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Reason for Return</label>
              <input type="text" required value={retForm.reason} onChange={(e) => setRetForm({ ...retForm, reason: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
              Save Purchase Return
            </button>
          </form>

          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-7">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">Purchase Returns</h3>
            {db.purchaseReturns.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#4B6356]">No purchase returns recorded yet.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                    <th className="py-2">Return No</th>
                    <th className="py-2">Date</th>
                    <th className="py-2">Supplier</th>
                    <th className="py-2">Reason</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE7E0]">
                  {db.purchaseReturns.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 font-mono font-medium text-[#07432B]">{r.returnNo}</td>
                      <td className="py-2.5 text-[#4B6356]">{r.date}</td>
                      <td className="py-2.5">{r.supplierName}</td>
                      <td className="py-2.5 text-[#4B6356]">{r.reason}</td>
                      <td className="py-2.5 text-right font-mono font-semibold">{formatCurrency(r.totalAmount, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Add Supplier Popup Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-[#DDE7E0] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#DDE7E0] px-6 py-4">
              <h3 className="text-base font-semibold text-[#0D2319]">Add New Supplier</h3>
              <button onClick={() => setShowSupplierModal(false)} className="rounded-lg p-1 text-[#4B6356] hover:bg-[#EAF4EE]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddSupplier} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-xs font-medium">Supplier Name *</label>
                <input type="text" required value={newSup.name} onChange={(e) => setNewSup({ ...newSup, name: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Address *</label>
                <input type="text" required value={newSup.address} onChange={(e) => setNewSup({ ...newSup, address: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Mobile *</label>
                  <input type="text" required value={newSup.mobile} onChange={(e) => setNewSup({ ...newSup, mobile: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Telephone</label>
                  <input type="text" value={newSup.telephone} onChange={(e) => setNewSup({ ...newSup, telephone: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Email</label>
                  <input type="email" value={newSup.email} onChange={(e) => setNewSup({ ...newSup, email: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Opening Payable</label>
                  <input type="number" min={0} value={newSup.openingBalance} onChange={(e) => setNewSup({ ...newSup, openingBalance: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#DDE7E0] pt-4">
                <button type="button" onClick={() => setShowSupplierModal(false)} className="rounded-lg border border-[#DDE7E0] px-4 py-2 text-xs font-medium text-[#0D2319] hover:bg-[#F7FAF8]">
                  {t.cancel}
                </button>
                <button type="submit" className="rounded-lg bg-[#07432B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
