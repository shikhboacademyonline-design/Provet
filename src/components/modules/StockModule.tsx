import React, { useState } from 'react';
import { AlertTriangle, ArrowLeftRight, ClipboardList, FileBarChart, PackagePlus, Plus, ShoppingBag, X } from 'lucide-react';
import type { ERPDatabase } from '../../types/erp';
import { formatCurrency } from '../../utils/accounting';
import { apiFetch } from '../../utils/api';
import type { ReportType } from '../DateFilterModal';
import type { Lang } from '../../i18n/translations';
import { labels } from '../../i18n/translations';

interface StockModuleProps {
  db: ERPDatabase;
  lang: Lang;
  onRefresh: (newDb: ERPDatabase) => void;
  onOpenReport: (type: ReportType, title: string) => void;
}

type StockPanel = 'add-stock' | 'requisition' | 'stock-purchase' | 'transfer' | 'damaged';

export const StockModule: React.FC<StockModuleProps> = ({ db, lang, onRefresh, onOpenReport }) => {
  const t = labels[lang];
  const cur = db.company.currency;
  const [activePanel, setActivePanel] = useState<StockPanel>('add-stock');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStockMode, setAddStockMode] = useState<'existing' | 'new'>('new');
  const [restockForm, setRestockForm] = useState({
    productId: db.products[0]?.id || '',
    addQty: 10,
    costPrice: db.products[0]?.weightedAvgCost || 0,
    location: db.products[0]?.location || 'Dhaka Central Warehouse',
    notes: '',
  });
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Add Stock Form
  const [newProd, setNewProd] = useState({
    name: '',
    sku: '',
    supplierId: db.suppliers[0]?.id || '',
    group: 'Feed Additives',
    category: 'Vitamins & Minerals',
    location: 'Dhaka Central Warehouse',
    unit: 'Pack',
    stockQty: 0,
    costPrice: 0,
    salesPrice: 0,
    reorderLevel: 25,
  });

  // Requisition Form
  const [reqForm, setReqForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    department: 'Gazipur Distribution',
    requestedBy: '',
    productId: db.products[0]?.id || '',
    qty: 10,
    notes: '',
  });

  // Stock Purchase Form
  const [purForm, setPurForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    supplierId: db.suppliers[0]?.id || '',
    paymentType: 'Credit' as 'Cash' | 'Bank' | 'Credit',
    productId: db.products[0]?.id || '',
    qty: 20,
    unitCost: db.products[0]?.weightedAvgCost || 0,
    notes: '',
  });

  // Stock Transfer Form
  const [trForm, setTrForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    productId: db.products[0]?.id || '',
    fromLocation: db.products[0]?.location || 'Dhaka Central Warehouse',
    toLocation: 'Gazipur Depot',
    qty: 10,
    notes: '',
  });

  // Damaged Product Form
  const [dmgForm, setDmgForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    productId: db.products[0]?.id || '',
    location: db.products[0]?.location || 'Dhaka Central Warehouse',
    qty: 1,
    reason: '',
  });

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (addStockMode === 'existing') {
      const targetId = restockForm.productId || db.products[0]?.id;
      if (!targetId) {
        return setFeedback({ type: 'err', msg: 'No existing products found. Switch to "+ Add New Product Name" first.' });
      }
      const res = await apiFetch('/api/erp/products/restock', {
        method: 'POST',
        body: JSON.stringify({ ...restockForm, productId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
      onRefresh(data.db);
      setShowAddModal(false);
      setFeedback({ type: 'ok', msg: `Added +${restockForm.addQty} stock to "${data.product.name}". Weighted Avg updated.` });
      return;
    }

    const res = await apiFetch('/api/erp/products', {
      method: 'POST',
      body: JSON.stringify({ ...newProd, supplierId: newProd.supplierId || db.suppliers[0]?.id || '' }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setShowAddModal(false);
    setNewProd({
      name: '',
      sku: '',
      supplierId: db.suppliers[0]?.id || '',
      group: 'Feed Additives',
      category: 'Vitamins & Minerals',
      location: 'Dhaka Central Warehouse',
      unit: 'Pack',
      stockQty: 0,
      costPrice: 0,
      salesPrice: 0,
      reorderLevel: 25,
    });
    setFeedback({ type: 'ok', msg: `New product "${data.product.name}" saved to Stock List.` });
  };

  const handleSaveRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = db.products.find((p) => p.id === (reqForm.productId || db.products[0]?.id));
    if (!prod) return setFeedback({ type: 'err', msg: 'Please add a product in Stock first.' });
    const res = await apiFetch('/api/erp/stock-requisitions', {
      method: 'POST',
      body: JSON.stringify({
        date: reqForm.date,
        department: reqForm.department,
        requestedBy: reqForm.requestedBy,
        status: 'Pending',
        items: [{ productId: prod.id, productName: prod.name, qty: Number(reqForm.qty), location: prod.location }],
        notes: reqForm.notes,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setFeedback({ type: 'ok', msg: `Stock Requisition ${data.record.reqNo} created.` });
  };

  const handleStockPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = db.products.find((p) => p.id === (purForm.productId || db.products[0]?.id));
    const supplierId = purForm.supplierId || db.suppliers[0]?.id;
    if (!prod || !supplierId) {
      return setFeedback({ type: 'err', msg: 'Please ensure both a Supplier and a Product exist before recording Stock Purchase.' });
    }
    const qty = Number(purForm.qty);
    const unitCost = Number(purForm.unitCost);
    const res = await apiFetch('/api/erp/purchase-invoices', {
      method: 'POST',
      body: JSON.stringify({
        date: purForm.date,
        supplierId,
        paymentType: purForm.paymentType,
        items: [{ productId: prod.id, productName: prod.name, qty, unitCost, discount: 0, total: qty * unitCost }],
        discountAmount: 0,
        notes: purForm.notes || 'Stock Purchase entry',
      }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setFeedback({ type: 'ok', msg: `Stock Purchase ${data.invoice.invoiceNo} saved. Weighted Average Cost updated.` });
  };

  const handleStockTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const productId = trForm.productId || db.products[0]?.id;
    if (!productId) return setFeedback({ type: 'err', msg: 'Please add a product first.' });
    const res = await apiFetch('/api/erp/stock-transfers', {
      method: 'POST',
      body: JSON.stringify({ ...trForm, productId }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setFeedback({ type: 'ok', msg: `Stock Transfer ${data.transfer.transferNo} completed.` });
  };

  const handleDamagedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const productId = dmgForm.productId || db.products[0]?.id;
    if (!productId) return setFeedback({ type: 'err', msg: 'Please add a product first.' });
    const res = await apiFetch('/api/erp/damaged-products', {
      method: 'POST',
      body: JSON.stringify({ ...dmgForm, productId }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setFeedback({ type: 'ok', msg: `Damage Record ${data.record.damageNo} saved and posted to P&L.` });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE7E0] pb-4">
        <div>
          <p className="text-xs font-medium text-[#1E7134]">Accounts Module / Stock</p>
          <h1 className="text-2xl font-bold text-[#0D2319]">Stock & Inventory Control</h1>
        </div>
        <button
          onClick={() => {
            setActivePanel('add-stock');
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]"
        >
          <Plus className="h-4 w-4" /> Add Stock
        </button>
      </div>

      {/* Exact 2-Column Command Hub */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Column 1: Operations */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-[#4B6356]">
            Column 1 · {t.operations}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { id: 'add-stock' as const, label: 'Add Stock', icon: PackagePlus },
              { id: 'requisition' as const, label: 'Stock Requisition', icon: ClipboardList },
              { id: 'stock-purchase' as const, label: 'Stock Purchase', icon: ShoppingBag },
              { id: 'transfer' as const, label: 'Stock Transfer', icon: ArrowLeftRight },
              { id: 'damaged' as const, label: 'Damaged Product', icon: AlertTriangle },
            ].map((item) => {
              const Icon = item.icon;
              const active = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePanel(item.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                    active
                      ? 'border-[#07432B] bg-[#07432B] text-white'
                      : 'border-[#DDE7E0] bg-[#F7FAF8] text-[#0D2319] hover:border-[#07432B] hover:bg-[#EAF4EE]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 2: Date-Filtered Reports */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-[#4B6356]">
            Column 2 · {t.reportsColumn}
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {[
              { id: 'stock-summary' as const, label: 'Stock Summary (Weighted Average Method)' },
              { id: 'stock-record' as const, label: 'Stock Record' },
              { id: 'damaged-record' as const, label: 'Damaged Product Record' },
            ].map((rep) => (
              <button
                key={rep.id}
                onClick={() => onOpenReport(rep.id, rep.label)}
                className="flex items-center justify-between rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-4 py-2.5 text-left text-xs font-medium text-[#0D2319] transition-colors hover:border-[#07432B] hover:bg-[#EAF4EE]"
              >
                <span className="flex items-center gap-2.5">
                  <FileBarChart className="h-4 w-4 text-[#1E7134]" />
                  {rep.label}
                </span>
                <span className="text-[11px] font-medium text-[#07432B]">Filter & Export</span>
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

      {/* Active Workspace */}
      {activePanel === 'add-stock' && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#0D2319]">Current Stock List</h3>
              <p className="text-xs text-[#4B6356]">
                All inventory items valued under Weighted Average Costing
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1E7134]"
            >
              <Plus className="h-3.5 w-3.5" /> Add Stock Item
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                  <th className="px-3 py-2.5 font-semibold">SKU</th>
                  <th className="px-3 py-2.5 font-semibold">Product Name</th>
                  <th className="px-3 py-2.5 font-semibold">Supplier</th>
                  <th className="px-3 py-2.5 font-semibold">Group / Category</th>
                  <th className="px-3 py-2.5 font-semibold">Location</th>
                  <th className="px-3 py-2.5 text-right font-semibold">In Stock</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Weighted Avg Cost</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Sales Price</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Stock Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.products.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-xs text-[#4B6356]">
                      No products in stock yet. Click &ldquo;Add Stock Item&rdquo; above to add your first product.
                    </td>
                  </tr>
                ) : (
                  db.products.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F7FAF8]">
                      <td className="px-3 py-2.5 font-mono text-[#07432B]">{p.sku}</td>
                      <td className="px-3 py-2.5 font-medium text-[#0D2319]">{p.name}</td>
                      <td className="px-3 py-2.5 text-[#4B6356]">{p.supplierName}</td>
                      <td className="px-3 py-2.5 text-[#4B6356]">{p.group} · {p.category}</td>
                      <td className="px-3 py-2.5 text-[#4B6356]">{p.location}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
                        {p.stockQty} {p.unit}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatCurrency(p.weightedAvgCost, cur)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatCurrency(p.salesPrice, cur)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#07432B] tabular-nums">
                        {formatCurrency(p.stockQty * p.weightedAvgCost, cur)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePanel === 'requisition' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSaveRequisition} className="space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-5">
            <h3 className="text-base font-semibold text-[#0D2319]">New Stock Requisition</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Date</label>
                <input type="date" required value={reqForm.date} onChange={(e) => setReqForm({ ...reqForm, date: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Department</label>
                <input type="text" required value={reqForm.department} onChange={(e) => setReqForm({ ...reqForm, department: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Requested By</label>
              <input type="text" required placeholder="Officer name" value={reqForm.requestedBy} onChange={(e) => setReqForm({ ...reqForm, requestedBy: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium">Product</label>
                <select value={reqForm.productId} onChange={(e) => setReqForm({ ...reqForm, productId: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                  {db.products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.stockQty})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Qty</label>
                <input type="number" min={1} required value={reqForm.qty} onChange={(e) => setReqForm({ ...reqForm, qty: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Purpose / Notes</label>
              <input type="text" value={reqForm.notes} onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
              Save Requisition
            </button>
          </form>

          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-7">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">Stock Requisition History</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                  <th className="py-2">Req No</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Department</th>
                  <th className="py-2">Items</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.stockRequisitions.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 font-mono font-medium text-[#07432B]">{r.reqNo}</td>
                    <td className="py-2.5 text-[#4B6356]">{r.date}</td>
                    <td className="py-2.5">{r.department} ({r.requestedBy})</td>
                    <td className="py-2.5">{r.items.map((i) => `${i.productName} × ${i.qty}`).join(', ')}</td>
                    <td className="py-2.5 font-medium text-[#1E7134]">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePanel === 'stock-purchase' && (
        <form onSubmit={handleStockPurchase} className="max-w-2xl space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6">
          <h3 className="text-base font-semibold text-[#0D2319]">Direct Stock Purchase (Updates Weighted Avg Cost)</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Date</label>
              <input type="date" required value={purForm.date} onChange={(e) => setPurForm({ ...purForm, date: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Supplier</label>
              <select value={purForm.supplierId} onChange={(e) => setPurForm({ ...purForm, supplierId: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                {db.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Payment Type</label>
              <select value={purForm.paymentType} onChange={(e) => setPurForm({ ...purForm, paymentType: e.target.value as 'Cash' | 'Bank' | 'Credit' })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                <option value="Credit">Credit (Payable)</option>
                <option value="Bank">Bank Transfer</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="mb-1 block text-xs font-medium">Product</label>
              <select
                value={purForm.productId}
                onChange={(e) => {
                  const p = db.products.find((x) => x.id === e.target.value);
                  setPurForm({ ...purForm, productId: e.target.value, unitCost: p?.weightedAvgCost || 0 });
                }}
                className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
              >
                {db.products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Quantity</label>
              <input type="number" min={1} required value={purForm.qty} onChange={(e) => setPurForm({ ...purForm, qty: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Unit Purchase Cost</label>
              <input type="number" min={1} step="0.01" required value={purForm.unitCost} onChange={(e) => setPurForm({ ...purForm, unitCost: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[#EAF4EE] px-4 py-2.5 text-xs">
            <span>Total Purchase Value (Posts Dr Inventory Asset)</span>
            <span className="font-mono font-bold text-[#07432B]">{formatCurrency(purForm.qty * purForm.unitCost, cur)}</span>
          </div>
          <button type="submit" className="rounded-lg bg-[#07432B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
            Save Stock Purchase
          </button>
        </form>
      )}

      {activePanel === 'transfer' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleStockTransfer} className="space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-5">
            <h3 className="text-base font-semibold text-[#0D2319]">Warehouse Stock Transfer</h3>
            <div>
              <label className="mb-1 block text-xs font-medium">Transfer Date</label>
              <input type="date" required value={trForm.date} onChange={(e) => setTrForm({ ...trForm, date: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Product</label>
              <select
                value={trForm.productId}
                onChange={(e) => {
                  const p = db.products.find((x) => x.id === e.target.value);
                  setTrForm({ ...trForm, productId: e.target.value, fromLocation: p?.location || '' });
                }}
                className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
              >
                {db.products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (Avail: {p.stockQty})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">From Location</label>
                <input type="text" required value={trForm.fromLocation} onChange={(e) => setTrForm({ ...trForm, fromLocation: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">To Location</label>
                <input type="text" required value={trForm.toLocation} onChange={(e) => setTrForm({ ...trForm, toLocation: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Transfer Qty</label>
              <input type="number" min={1} required value={trForm.qty} onChange={(e) => setTrForm({ ...trForm, qty: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
              Execute Stock Transfer
            </button>
          </form>

          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-7">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">Transfer Log</h3>
            {db.stockTransfers.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#4B6356]">No warehouse transfers recorded yet.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                    <th className="py-2">Transfer No</th>
                    <th className="py-2">Date</th>
                    <th className="py-2">Product</th>
                    <th className="py-2">Route</th>
                    <th className="py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE7E0]">
                  {db.stockTransfers.map((tr) => (
                    <tr key={tr.id}>
                      <td className="py-2 font-mono font-medium text-[#07432B]">{tr.transferNo}</td>
                      <td className="py-2 text-[#4B6356]">{tr.date}</td>
                      <td className="py-2">{tr.productName}</td>
                      <td className="py-2">{tr.fromLocation} → {tr.toLocation}</td>
                      <td className="py-2 text-right font-mono">{tr.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activePanel === 'damaged' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleDamagedSubmit} className="space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-5">
            <h3 className="text-base font-semibold text-[#0D2319]">Record Damaged Product</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Date</label>
                <input type="date" required value={dmgForm.date} onChange={(e) => setDmgForm({ ...dmgForm, date: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Damaged Qty</label>
                <input type="number" min={1} required value={dmgForm.qty} onChange={(e) => setDmgForm({ ...dmgForm, qty: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Product</label>
              <select
                value={dmgForm.productId}
                onChange={(e) => {
                  const p = db.products.find((x) => x.id === e.target.value);
                  setDmgForm({ ...dmgForm, productId: e.target.value, location: p?.location || '' });
                }}
                className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
              >
                {db.products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (Stock: {p.stockQty})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Reason</label>
              <input type="text" required placeholder="Expiry, breakage, moisture..." value={dmgForm.reason} onChange={(e) => setDmgForm({ ...dmgForm, reason: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
              Save Damage Entry
            </button>
          </form>

          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-7">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">Damaged Product History</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                  <th className="py-2">Damage No</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Product</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Loss Value</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.damagedRecords.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2.5 font-mono font-medium text-[#DC2626]">{d.damageNo}</td>
                    <td className="py-2.5 text-[#4B6356]">{d.date}</td>
                    <td className="py-2.5">{d.productName}</td>
                    <td className="py-2.5 text-right font-mono">{d.qty}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">{formatCurrency(d.totalLoss, cur)}</td>
                    <td className="py-2.5 text-[#4B6356]">{d.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Stock Popup Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-xl border border-[#DDE7E0] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#DDE7E0] px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-[#0D2319]">Add Stock</h3>
                <p className="text-[11px] text-[#4B6356]">Select an existing product to restock or add a brand-new product</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-[#4B6356] hover:bg-[#EAF4EE]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 pt-4">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#F7FAF8] p-1 border border-[#DDE7E0]">
                <button
                  type="button"
                  onClick={() => setAddStockMode('existing')}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    addStockMode === 'existing' ? 'bg-[#07432B] text-white' : 'text-[#4B6356] hover:text-[#0D2319]'
                  }`}
                >
                  Existing Product List
                </button>
                <button
                  type="button"
                  onClick={() => setAddStockMode('new')}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    addStockMode === 'new' ? 'bg-[#07432B] text-white' : 'text-[#4B6356] hover:text-[#0D2319]'
                  }`}
                >
                  + Add New Product Name
                </button>
              </div>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-4 p-6">
              {addStockMode === 'existing' ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Select Existing Product *</label>
                    <select
                      required
                      value={restockForm.productId || db.products[0]?.id || ''}
                      onChange={(e) => {
                        const p = db.products.find((x) => x.id === e.target.value);
                        setRestockForm({
                          ...restockForm,
                          productId: e.target.value,
                          costPrice: p?.weightedAvgCost || 0,
                          location: p?.location || 'Dhaka Central Warehouse',
                        });
                      }}
                      className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                    >
                      {db.products.length === 0 ? (
                        <option value="">No products available yet — add a new product first</option>
                      ) : (
                        db.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.name} (In Stock: {p.stockQty} {p.unit})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Add Qty *</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={restockForm.addQty}
                        onChange={(e) => setRestockForm({ ...restockForm, addQty: Number(e.target.value) })}
                        className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Cost Price *</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        required
                        value={restockForm.costPrice}
                        onChange={(e) => setRestockForm({ ...restockForm, costPrice: Number(e.target.value) })}
                        className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Location</label>
                      <input
                        type="text"
                        required
                        value={restockForm.location}
                        onChange={(e) => setRestockForm({ ...restockForm, location: e.target.value })}
                        className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Notes</label>
                    <input
                      type="text"
                      value={restockForm.notes}
                      onChange={(e) => setRestockForm({ ...restockForm, notes: e.target.value })}
                      placeholder="Batch / adjustment notes..."
                      className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-medium">New Product Name *</label>
                      <input type="text" required value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" placeholder="e.g. Provet Liver Tonic 1L" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">SKU / Code</label>
                      <input type="text" value={newProd.sku} onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" placeholder="Auto" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Supplier Name *</label>
                      <select value={newProd.supplierId} onChange={(e) => setNewProd({ ...newProd, supplierId: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                        {db.suppliers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Location / Warehouse *</label>
                      <input type="text" required value={newProd.location} onChange={(e) => setNewProd({ ...newProd, location: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Product Group *</label>
                      <input type="text" required value={newProd.group} onChange={(e) => setNewProd({ ...newProd, group: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Product Category *</label>
                      <input type="text" required value={newProd.category} onChange={(e) => setNewProd({ ...newProd, category: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Unit *</label>
                      <input type="text" required value={newProd.unit} onChange={(e) => setNewProd({ ...newProd, unit: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Opening Qty</label>
                      <input type="number" min={0} value={newProd.stockQty} onChange={(e) => setNewProd({ ...newProd, stockQty: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Cost Price</label>
                      <input type="number" min={0} step="0.01" value={newProd.costPrice} onChange={(e) => setNewProd({ ...newProd, costPrice: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Sales Price</label>
                      <input type="number" min={0} step="0.01" value={newProd.salesPrice} onChange={(e) => setNewProd({ ...newProd, salesPrice: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Reorder Lvl</label>
                      <input type="number" min={0} value={newProd.reorderLevel} onChange={(e) => setNewProd({ ...newProd, reorderLevel: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-[#DDE7E0] pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-[#DDE7E0] bg-white px-4 py-2 text-xs font-medium text-[#0D2319] hover:bg-[#F7FAF8]"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#07432B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]"
                >
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
