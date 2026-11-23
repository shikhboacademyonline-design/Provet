import React, { useState } from 'react';
import {
  AlertCircle,
  ClipboardCheck,
  DollarSign,
  Download,
  FileBarChart,
  FileText,
  Plus,
  Printer,
  RotateCcw,
  ShoppingCart,
  Tag,
  Truck,
  Users,
  X,
} from 'lucide-react';
import type { Customer, ERPDatabase, Product, SalesChallan, SalesQuotation } from '../../types/erp';
import { formatCurrency, numberToWords, round2 } from '../../utils/accounting';
import { apiFetch } from '../../utils/api';
import { exportQuotationToPDF } from '../../utils/exportReport';
import type { ReportType } from '../DateFilterModal';
import type { Lang } from '../../i18n/translations';
import { labels } from '../../i18n/translations';

interface SalesModuleProps {
  db: ERPDatabase;
  lang: Lang;
  onRefresh: (newDb: ERPDatabase) => void;
  onOpenReport: (type: ReportType, title: string) => void;
}

type SalesView = 'customers' | 'pricing' | 'quotations' | 'orders' | 'challans' | 'invoices' | 'delivery' | 'returns';
type PopupFormat = 'quotation' | 'order' | 'challan' | 'return' | null;

interface LineDraft {
  productId: string;
  productQuery: string;
  productName: string;
  qty: number;
  bonusQty: number;
  bonusProductName: string;
  salesPrice: number;
  discountPercent: number;
}

export const SalesModule: React.FC<SalesModuleProps> = ({ db, lang, onRefresh, onOpenReport }) => {
  const t = labels[lang];
  const cur = db.company.currency;

  const [activeView, setActiveView] = useState<SalesView>('challans');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [popupFormat, setPopupFormat] = useState<PopupFormat>(null);
  const [previewDoc, setPreviewDoc] = useState<{ kind: 'invoice' | 'delivery'; challan: SalesChallan } | null>(null);
  const [previewQuotation, setPreviewQuotation] = useState<SalesQuotation | null>(null);
  const [stockAlert, setStockAlert] = useState<{ productName: string; requested: number; available: number } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Price editing map
  const [priceEdits, setPriceEdits] = useState<Record<string, number>>({});

  // Add Customer state
  const [newCust, setNewCust] = useState({
    name: '',
    address: '',
    mobile: '',
    telephone: '',
    email: '',
    creditLimit: 300000,
  });

  // Shared Transaction Popup Draft (Quotation / Sale Order / Sales Challan / Sales Return)
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState('2026-12-15');
  const [customerQuery, setCustomerQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustDropdown, setShowCustDropdown] = useState(false);

  const [paymentTerms, setPaymentTerms] = useState<'Cash' | 'Credit'>('Credit');
  const [paymentMethod, setPaymentMethod] = useState<SalesChallan['paymentMethod']>('Bank Transfer');
  const [paymentPeriodDays, setPaymentPeriodDays] = useState(30);
  const [otherTerms, setOtherTerms] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [activeLineDropdown, setActiveLineDropdown] = useState<number | null>(null);

  const [lines, setLines] = useState<LineDraft[]>([
    {
      productId: '',
      productQuery: '',
      productName: '',
      qty: 1,
      bonusQty: 0,
      bonusProductName: '',
      salesPrice: 0,
      discountPercent: 0,
    },
  ]);

  const resetTxForm = (format: PopupFormat) => {
    setPopupFormat(format);
    setTxDate(new Date().toISOString().slice(0, 10));
    setCustomerQuery('');
    setSelectedCustomer(null);
    setPaymentTerms('Credit');
    setPaymentMethod('Bank Transfer');
    setPaymentPeriodDays(30);
    setOtherTerms('');
    setTxNotes('');
    setReturnReason('');
    setLines([
      {
        productId: '',
        productQuery: '',
        productName: '',
        qty: 1,
        bonusQty: 0,
        bonusProductName: '',
        salesPrice: 0,
        discountPercent: 0,
      },
    ]);
  };

  const filteredCustomers = customerQuery.trim().length >= 1
    ? db.customers.filter((c) => c.name.toLowerCase().includes(customerQuery.trim().toLowerCase()))
    : db.customers;

  const getFilteredProducts = (q: string) =>
    q.trim().length >= 1
      ? db.products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) || p.sku.toLowerCase().includes(q.trim().toLowerCase()))
      : db.products;

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerQuery(c.name);
    setShowCustDropdown(false);
  };

  const handleSelectProduct = (idx: number, p: Product) => {
    const next = [...lines];
    next[idx] = {
      ...next[idx],
      productId: p.id,
      productQuery: p.name,
      productName: p.name,
      salesPrice: p.salesPrice,
      bonusProductName: p.name,
    };
    setLines(next);
    setActiveLineDropdown(null);
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/erp/customers', {
      method: 'POST',
      body: JSON.stringify(newCust),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setShowAddCustomer(false);
    setNewCust({ name: '', address: '', mobile: '', telephone: '', email: '', creditLimit: 300000 });
    setFeedback({ type: 'ok', msg: `Customer "${data.customer.name}" saved to Customer List.` });
  };

  const handleSavePrice = async (productId: string) => {
    const newPrice = priceEdits[productId];
    if (newPrice === undefined || newPrice < 0) return;
    const res = await apiFetch(`/api/erp/products/${productId}/price`, {
      method: 'PUT',
      body: JSON.stringify({ salesPrice: newPrice }),
    });
    const data = await res.json();
    if (res.ok) {
      onRefresh(data.db);
      setFeedback({ type: 'ok', msg: `Sales price for "${data.product.name}" updated to ${formatCurrency(newPrice, cur)}.` });
    }
  };

  const computeLine = (l: LineDraft) => {
    const gross = round2(l.qty * l.salesPrice);
    const disc = round2(gross * (l.discountPercent / 100));
    const total = round2(Math.max(0, gross - disc));
    return { gross, disc, total };
  };

  const handleSubmitTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      setFeedback({ type: 'err', msg: 'Please type and select a customer from the filtered Customer List.' });
      return;
    }
    const validLines = lines.filter((l) => l.productId && l.qty > 0);
    if (validLines.length === 0) {
      setFeedback({ type: 'err', msg: 'Please select at least one product.' });
      return;
    }

    // For Sales Challan: Check Stock BEFORE posting and trigger Insufficient Stock Popup if needed
    if (popupFormat === 'challan') {
      for (const l of validLines) {
        const prod = db.products.find((p) => p.id === l.productId);
        if (prod) {
          const requested = Number(l.qty) + Number(l.bonusQty || 0);
          if (requested > prod.stockQty) {
            setStockAlert({
              productName: prod.name,
              requested,
              available: prod.stockQty,
            });
            return;
          }
        }
      }
    }

    const mappedItems = validLines.map((l) => {
      const { disc, total } = computeLine(l);
      return {
        productId: l.productId,
        productName: l.productName,
        qty: Number(l.qty),
        bonusQty: Number(l.bonusQty || 0),
        bonusProductName: l.bonusProductName || l.productName,
        salesPrice: Number(l.salesPrice),
        discountPercent: Number(l.discountPercent || 0),
        discountAmount: disc,
        lineTotal: total,
      };
    });

    const totalAmount = round2(mappedItems.reduce((s, i) => s + i.lineTotal, 0));

    if (popupFormat === 'quotation') {
      const res = await apiFetch('/api/erp/sales-quotations', {
        method: 'POST',
        body: JSON.stringify({
          date: txDate,
          validUntil,
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          customerAddress: selectedCustomer.address,
          customerMobile: selectedCustomer.mobile,
          items: mappedItems,
          totalAmount,
          notes: txNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
      onRefresh(data.db);
      setPopupFormat(null);
      setActiveView('quotations');
      setPreviewQuotation(data.sq);
      setFeedback({ type: 'ok', msg: `Sales Quotation ${data.sq.quotNo} saved.` });
    } else if (popupFormat === 'order') {
      const res = await apiFetch('/api/erp/sale-orders', {
        method: 'POST',
        body: JSON.stringify({
          date: txDate,
          deliveryDate: validUntil,
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          customerAddress: selectedCustomer.address,
          customerMobile: selectedCustomer.mobile,
          items: mappedItems,
          totalAmount,
          notes: txNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
      onRefresh(data.db);
      setPopupFormat(null);
      setActiveView('orders');
      setFeedback({ type: 'ok', msg: `Sale Order ${data.so.orderNo} confirmed.` });
    } else if (popupFormat === 'challan') {
      const res = await apiFetch('/api/erp/sales-challans', {
        method: 'POST',
        body: JSON.stringify({
          date: txDate,
          customerId: selectedCustomer.id,
          items: mappedItems,
          paymentTerms,
          paymentMethod,
          paymentPeriodDays: paymentTerms === 'Credit' ? Number(paymentPeriodDays) : 0,
          otherTerms,
          notes: txNotes,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === 'INSUFFICIENT_STOCK') {
        setStockAlert({
          productName: data.productName,
          requested: data.requested,
          available: data.available,
        });
        return;
      }
      if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
      onRefresh(data.db);
      setPopupFormat(null);
      setActiveView('challans');
      setFeedback({
        type: 'ok',
        msg: `Sales Challan ${data.challan.challanNo} saved! Stock reduced, P&L and Balance Sheet updated, and Invoice ${data.challan.invoiceNo} + Delivery Challan ${data.challan.deliveryChallanNo} generated.`,
      });
    } else if (popupFormat === 'return') {
      const res = await apiFetch('/api/erp/sales-returns', {
        method: 'POST',
        body: JSON.stringify({
          date: txDate,
          customerId: selectedCustomer.id,
          items: mappedItems,
          reason: returnReason || txNotes || 'Customer return',
        }),
      });
      const data = await res.json();
      if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
      onRefresh(data.db);
      setPopupFormat(null);
      setActiveView('returns');
      setFeedback({ type: 'ok', msg: `Sales Return ${data.ret.returnNo} saved. Stock restored & Receivable credited.` });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE7E0] pb-4">
        <div>
          <p className="text-xs font-medium text-[#1E7134]">Accounts Module / Sales</p>
          <h1 className="text-2xl font-bold text-[#0D2319]">Sales, Pricing & Dispatch Challan</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddCustomer(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE7E0] bg-white px-3.5 py-2 text-xs font-semibold text-[#0D2319] hover:bg-[#EAF4EE]"
          >
            <Plus className="h-3.5 w-3.5 text-[#07432B]" /> Add Customer
          </button>
          <button
            onClick={() => resetTxForm('challan')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> New Sales Challan
          </button>
        </div>
      </div>

      {/* Exact 3-Column Command Hub */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Column 1 */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5 lg:col-span-3">
          <h2 className="mb-3 text-xs font-semibold text-[#4B6356]">Column 1 · {t.masterSetup}</h2>
          <div className="space-y-2">
            <button
              onClick={() => setActiveView('customers')}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-xs font-medium ${
                activeView === 'customers' ? 'border-[#07432B] bg-[#07432B] text-white' : 'border-[#DDE7E0] bg-[#F7FAF8] text-[#0D2319] hover:bg-[#EAF4EE]'
              }`}
            >
              <Users className="h-4 w-4" /> Customer List ({db.customers.length})
            </button>
            <button
              onClick={() => setActiveView('pricing')}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-xs font-medium ${
                activeView === 'pricing' ? 'border-[#07432B] bg-[#07432B] text-white' : 'border-[#DDE7E0] bg-[#F7FAF8] text-[#0D2319] hover:bg-[#EAF4EE]'
              }`}
            >
              <Tag className="h-4 w-4" /> Sales Price
            </button>
          </div>
        </div>

        {/* Column 2 */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5 lg:col-span-5">
          <h2 className="mb-3 text-xs font-semibold text-[#4B6356]">Column 2 · {t.transactions}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              onClick={() => {
                setActiveView('quotations');
                resetTxForm('quotation');
              }}
              className="flex items-center gap-2 rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-3 py-2.5 text-left text-xs font-medium text-[#0D2319] hover:border-[#07432B] hover:bg-[#EAF4EE]"
            >
              <FileText className="h-3.5 w-3.5 text-[#07432B]" /> Quotation
            </button>
            <button
              onClick={() => {
                setActiveView('orders');
                resetTxForm('order');
              }}
              className="flex items-center gap-2 rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-3 py-2.5 text-left text-xs font-medium text-[#0D2319] hover:border-[#07432B] hover:bg-[#EAF4EE]"
            >
              <ClipboardCheck className="h-3.5 w-3.5 text-[#07432B]" /> Sale Order
            </button>
            <button
              onClick={() => {
                setActiveView('challans');
                resetTxForm('challan');
              }}
              className="flex items-center gap-2 rounded-lg border border-[#07432B] bg-[#EAF4EE] px-3 py-2.5 text-left text-xs font-semibold text-[#07432B] hover:bg-[#07432B] hover:text-white"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Sales Challan
            </button>
            <button
              onClick={() => setActiveView('invoices')}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium ${
                activeView === 'invoices' ? 'border-[#07432B] bg-[#07432B] text-white' : 'border-[#DDE7E0] bg-[#F7FAF8] text-[#0D2319] hover:bg-[#EAF4EE]'
              }`}
            >
              <DollarSign className="h-3.5 w-3.5" /> Sales Invoice
            </button>
            <button
              onClick={() => setActiveView('delivery')}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium ${
                activeView === 'delivery' ? 'border-[#07432B] bg-[#07432B] text-white' : 'border-[#DDE7E0] bg-[#F7FAF8] text-[#0D2319] hover:bg-[#EAF4EE]'
              }`}
            >
              <Truck className="h-3.5 w-3.5" /> Delivery Challan
            </button>
            <button
              onClick={() => {
                setActiveView('returns');
                resetTxForm('return');
              }}
              className="flex items-center gap-2 rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-3 py-2.5 text-left text-xs font-medium text-[#0D2319] hover:border-[#07432B] hover:bg-[#EAF4EE]"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[#07432B]" /> Product Return
            </button>
          </div>
        </div>

        {/* Column 3 */}
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-5 lg:col-span-4">
          <h2 className="mb-3 text-xs font-semibold text-[#4B6356]">Column 3 · {t.reportsColumn}</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'receivable' as const, label: 'Receivable' },
              { id: 'sales-register' as const, label: 'Sales Register' },
              { id: 'sales-return' as const, label: 'Sales Return' },
              { id: 'payment-schedule' as const, label: 'Payment Schedule' },
            ].map((rep) => (
              <button
                key={rep.id}
                onClick={() => onOpenReport(rep.id, `Sales · ${rep.label}`)}
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

      {/* Sub-navigation strip for viewing lists */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#DDE7E0] pb-2">
        {[
          { id: 'challans' as const, label: `Sales Challans (${db.salesChallans.length})` },
          { id: 'invoices' as const, label: `Sales Invoices (${db.salesChallans.length})` },
          { id: 'delivery' as const, label: `Delivery Challans (${db.salesChallans.length})` },
          { id: 'customers' as const, label: 'Customer List' },
          { id: 'pricing' as const, label: 'Sales Price Master' },
          { id: 'quotations' as const, label: 'Quotations' },
          { id: 'orders' as const, label: 'Sale Orders' },
          { id: 'returns' as const, label: 'Sales Returns' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeView === tab.id ? 'bg-[#07432B] text-white' : 'text-[#4B6356] hover:bg-[#EAF4EE] hover:text-[#07432B]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Data Table */}
      {activeView === 'customers' && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#0D2319]">Customer Directory</h3>
            <button onClick={() => setShowAddCustomer(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1E7134]">
              <Plus className="h-3.5 w-3.5" /> Add Customer
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                  <th className="px-3 py-2.5 font-semibold">Code</th>
                  <th className="px-3 py-2.5 font-semibold">Customer Name</th>
                  <th className="px-3 py-2.5 font-semibold">Address</th>
                  <th className="px-3 py-2.5 font-semibold">Mobile</th>
                  <th className="px-3 py-2.5 font-semibold">Telephone</th>
                  <th className="px-3 py-2.5 font-semibold">Email</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Credit Limit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F7FAF8]">
                    <td className="px-3 py-2.5 font-mono text-[#07432B]">{c.code}</td>
                    <td className="px-3 py-2.5 font-medium text-[#0D2319]">{c.name}</td>
                    <td className="px-3 py-2.5 text-[#4B6356]">{c.address}</td>
                    <td className="px-3 py-2.5 font-mono">{c.mobile}</td>
                    <td className="px-3 py-2.5 font-mono text-[#4B6356]">{c.telephone || '-'}</td>
                    <td className="px-3 py-2.5 text-[#4B6356]">{c.email}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCurrency(c.creditLimit, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'pricing' && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <h3 className="mb-1 text-base font-semibold text-[#0D2319]">Product-Wise Sales Price Configuration</h3>
          <p className="mb-4 text-xs text-[#4B6356]">Prices configured here automatically populate Sales Challan & Sales Invoice forms.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                  <th className="px-3 py-2.5 font-semibold">SKU</th>
                  <th className="px-3 py-2.5 font-semibold">Product Name</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Stock</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Weighted Avg Cost</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Current Sales Price</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Margin %</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Update Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.products.map((p) => {
                  const val = priceEdits[p.id] ?? p.salesPrice;
                  const margin = val > 0 ? (((val - p.weightedAvgCost) / val) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2.5 font-mono text-[#07432B]">{p.sku}</td>
                      <td className="px-3 py-2.5 font-medium">{p.name}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{p.stockQty} {p.unit}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(p.weightedAvgCost, cur)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={val}
                          onChange={(e) => setPriceEdits({ ...priceEdits, [p.id]: Number(e.target.value) })}
                          className="w-28 rounded border border-[#DDE7E0] px-2 py-1 text-right font-mono text-xs"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#1E7134]">{margin}%</td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => handleSavePrice(p.id)}
                          className="rounded bg-[#07432B] px-3 py-1 text-xs font-medium text-white hover:bg-[#1E7134]"
                        >
                          Save Price
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(activeView === 'challans' || activeView === 'invoices' || activeView === 'delivery') && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-[#0D2319]">
                {activeView === 'challans'
                  ? 'Sales Challans'
                  : activeView === 'invoices'
                  ? 'Sales Invoices (Generated from Sales Challans)'
                  : 'Delivery Challans (Generated from Sales Challans)'}
              </h3>
              <p className="text-xs text-[#4B6356]">
                Each Sales Challan automatically deducts stock, hits P&L & Balance Sheet, and generates both a Sales Invoice and Delivery Challan.
              </p>
            </div>
            <button onClick={() => resetTxForm('challan')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1E7134]">
              <Plus className="h-3.5 w-3.5" /> New Sales Challan
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                  <th className="px-3 py-2.5 font-semibold">
                    {activeView === 'invoices' ? 'Invoice No' : activeView === 'delivery' ? 'Delivery Challan' : 'Challan No'}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Customer</th>
                  <th className="px-3 py-2.5 font-semibold">Terms & Method</th>
                  <th className="px-3 py-2.5 font-semibold">Due Date</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Net Amount</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.salesChallans.map((sc) => (
                  <tr key={sc.id} className="hover:bg-[#F7FAF8]">
                    <td className="px-3 py-2.5 font-mono font-semibold text-[#07432B]">
                      {activeView === 'invoices' ? sc.invoiceNo : activeView === 'delivery' ? sc.deliveryChallanNo : sc.challanNo}
                      <span className="ml-1.5 text-[11px] font-normal text-[#4B6356]">
                        ({activeView === 'challans' ? sc.invoiceNo : sc.challanNo})
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[#4B6356] tabular-nums">{sc.date}</td>
                    <td className="px-3 py-2.5 font-medium">{sc.customerName}</td>
                    <td className="px-3 py-2.5 text-[#4B6356]">
                      {sc.paymentTerms} · {sc.paymentMethod} {sc.paymentTerms === 'Credit' ? `(${sc.paymentPeriodDays}d)` : ''}
                    </td>
                    <td className="px-3 py-2.5 text-[#4B6356] tabular-nums">{sc.dueDate}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">{formatCurrency(sc.netAmount, cur)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          onClick={() => setPreviewDoc({ kind: 'invoice', challan: sc })}
                          className="rounded border border-[#DDE7E0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#07432B] hover:bg-[#EAF4EE]"
                        >
                          Sales Invoice
                        </button>
                        <button
                          onClick={() => setPreviewDoc({ kind: 'delivery', challan: sc })}
                          className="rounded border border-[#DDE7E0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#07432B] hover:bg-[#EAF4EE]"
                        >
                          Delivery Challan
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'quotations' && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#0D2319]">Sales Quotations</h3>
            <button onClick={() => resetTxForm('quotation')} className="rounded-lg bg-[#07432B] px-3.5 py-2 text-xs font-medium text-white">+ New Quotation</button>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                <th className="py-2">Quot No</th>
                <th className="py-2">Date</th>
                <th className="py-2">Customer</th>
                <th className="py-2">Valid Until</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE7E0]">
              {db.salesQuotations.map((q) => (
                <tr key={q.id} className="hover:bg-[#F7FAF8]">
                  <td className="py-2.5 font-mono font-medium text-[#07432B]">{q.quotNo}</td>
                  <td className="py-2.5 text-[#4B6356]">{q.date}</td>
                  <td className="py-2.5 font-medium">{q.customerName}</td>
                  <td className="py-2.5 text-[#4B6356]">{q.validUntil}</td>
                  <td className="py-2.5 text-right font-mono font-semibold">{formatCurrency(q.totalAmount, cur)}</td>
                  <td className="py-2.5 text-right">
                    <div className="inline-flex gap-1.5">
                      <button
                        onClick={() => setPreviewQuotation(q)}
                        className="inline-flex items-center gap-1 rounded border border-[#DDE7E0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#07432B] hover:bg-[#EAF4EE]"
                      >
                        <Printer className="h-3 w-3" /> Print / View
                      </button>
                      <button
                        onClick={() =>
                          exportQuotationToPDF({
                            companyName: db.company.name,
                            companyAddress: db.company.address,
                            companyPhone: db.company.phone,
                            companyEmail: db.company.email,
                            quotNo: q.quotNo,
                            date: q.date,
                            validUntil: q.validUntil,
                            customerName: q.customerName,
                            customerAddress: q.customerAddress,
                            customerMobile: q.customerMobile,
                            notes: q.notes,
                            currency: cur === '৳' ? 'BDT ' : cur,
                            items: q.items.map((it) => ({
                              productName: it.productName,
                              qty: it.qty,
                              bonusQty: it.bonusQty || 0,
                              salesPrice: it.salesPrice,
                              discountAmount: it.discountAmount || 0,
                              lineTotal: it.lineTotal,
                            })),
                            totalAmount: q.totalAmount,
                            amountInWords: numberToWords(q.totalAmount),
                          })
                        }
                        className="inline-flex items-center gap-1 rounded bg-[#07432B] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1E7134]"
                      >
                        <Download className="h-3 w-3" /> PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'orders' && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#0D2319]">Sale Orders</h3>
            <button onClick={() => resetTxForm('order')} className="rounded-lg bg-[#07432B] px-3.5 py-2 text-xs font-medium text-white">+ New Sale Order</button>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                <th className="py-2">Order No</th>
                <th className="py-2">Date</th>
                <th className="py-2">Customer</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE7E0]">
              {db.saleOrders.map((o) => (
                <tr key={o.id}>
                  <td className="py-2.5 font-mono font-medium text-[#07432B]">{o.orderNo}</td>
                  <td className="py-2.5 text-[#4B6356]">{o.date}</td>
                  <td className="py-2.5">{o.customerName}</td>
                  <td className="py-2.5 text-[#1E7134]">{o.status}</td>
                  <td className="py-2.5 text-right font-mono font-semibold">{formatCurrency(o.totalAmount, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'returns' && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#0D2319]">Sales Returns</h3>
            <button onClick={() => resetTxForm('return')} className="rounded-lg bg-[#07432B] px-3.5 py-2 text-xs font-medium text-white">+ Record Return</button>
          </div>
          {db.salesReturns.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#4B6356]">No sales returns recorded yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                  <th className="py-2">Return No</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Customer</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.salesReturns.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 font-mono font-medium text-[#07432B]">{r.returnNo}</td>
                    <td className="py-2.5 text-[#4B6356]">{r.date}</td>
                    <td className="py-2.5">{r.customerName}</td>
                    <td className="py-2.5 text-[#4B6356]">{r.reason}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">{formatCurrency(r.totalAmount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add Customer Popup */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-[#DDE7E0] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#DDE7E0] px-6 py-4">
              <h3 className="text-base font-semibold text-[#0D2319]">Add New Customer</h3>
              <button onClick={() => setShowAddCustomer(false)} className="rounded-lg p-1 text-[#4B6356] hover:bg-[#EAF4EE]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-xs font-medium">Customer Name *</label>
                <input type="text" required value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Address *</label>
                <input type="text" required value={newCust.address} onChange={(e) => setNewCust({ ...newCust, address: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Mobile *</label>
                  <input type="text" required value={newCust.mobile} onChange={(e) => setNewCust({ ...newCust, mobile: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Telephone</label>
                  <input type="text" value={newCust.telephone} onChange={(e) => setNewCust({ ...newCust, telephone: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Email</label>
                  <input type="email" value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Credit Limit</label>
                  <input type="number" min={0} value={newCust.creditLimit} onChange={(e) => setNewCust({ ...newCust, creditLimit: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#DDE7E0] pt-4">
                <button type="button" onClick={() => setShowAddCustomer(false)} className="rounded-lg border border-[#DDE7E0] px-4 py-2 text-xs font-medium text-[#0D2319]">
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

      {/* Popup Transaction Format Modal (Quotation / Sale Order / Sales Challan / Product Return) */}
      {popupFormat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#DDE7E0] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDE7E0] bg-[#07432B] px-6 py-4 text-white">
              <div>
                <h3 className="text-base font-semibold">
                  {popupFormat === 'challan'
                    ? 'Sales Challan Format (Auto-generates Sales Invoice & Delivery Challan)'
                    : popupFormat === 'quotation'
                    ? 'Customer Quotation Format'
                    : popupFormat === 'order'
                    ? 'Sale Order Format'
                    : 'Sales Product Return Format'}
                </h3>
                <p className="text-xs text-white/80">
                  Type 1–2 characters in Customer Name or Product Name to filter and auto-fill details.
                </p>
              </div>
              <button onClick={() => setPopupFormat(null)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitTx} className="flex-1 space-y-5 overflow-y-auto p-6">
              {/* Customer Autocomplete & Auto-Filled Details */}
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#DDE7E0] bg-[#F7FAF8] p-4 md:grid-cols-12">
                <div className="relative md:col-span-5">
                  <label className="mb-1 block text-xs font-semibold text-[#0D2319]">
                    Customer Name (Type 1–2 letters) *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerQuery}
                    onFocus={() => setShowCustDropdown(true)}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setSelectedCustomer(null);
                      setShowCustDropdown(true);
                    }}
                    placeholder="Start typing customer name..."
                    className="w-full rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-xs focus:border-[#07432B] focus:outline-none"
                  />
                  {showCustDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#DDE7E0] bg-white shadow-lg">
                      {filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className="flex w-full flex-col border-b border-[#DDE7E0]/60 px-3 py-2 text-left text-xs hover:bg-[#EAF4EE] last:border-0"
                        >
                          <span className="font-semibold text-[#07432B]">{c.name}</span>
                          <span className="text-[11px] text-[#4B6356]">{c.mobile} · {c.address}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-[#4B6356]">Date</label>
                  <input type="date" required value={txDate} onChange={(e) => setTxDate(e.target.value)} className="w-full rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-xs" />
                </div>

                <div className="md:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-[#4B6356]">Auto-Filled Customer Details</label>
                  <div className="rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-xs text-[#0D2319]">
                    {selectedCustomer ? (
                      <>
                        <p className="font-medium">{selectedCustomer.mobile} · {selectedCustomer.email}</p>
                        <p className="truncate text-[11px] text-[#4B6356]">{selectedCustomer.address}</p>
                      </>
                    ) : (
                      <p className="text-[#4B6356]">Select a customer to auto-fill address & phone</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Line Items with Product Autocomplete + Stock Check */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#0D2319]">Product Line Items (from Stock & Sales Price Master)</h4>
                  <button
                    type="button"
                    onClick={() =>
                      setLines([
                        ...lines,
                        { productId: '', productQuery: '', productName: '', qty: 1, bonusQty: 0, bonusProductName: '', salesPrice: 0, discountPercent: 0 },
                      ])
                    }
                    className="text-xs font-semibold text-[#07432B] hover:underline"
                  >
                    + Add Product Row
                  </button>
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => {
                    const matchedProd = db.products.find((p) => p.id === line.productId);
                    const totalReq = Number(line.qty) + Number(line.bonusQty || 0);
                    const lowStock = popupFormat === 'challan' && matchedProd && totalReq > matchedProd.stockQty;
                    const { total } = computeLine(line);
                    const suggestions = getFilteredProducts(line.productQuery);

                    return (
                      <div key={idx} className="grid grid-cols-12 items-start gap-2 rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] p-2.5">
                        <div className="relative col-span-4">
                          <label className="mb-1 block text-[11px] font-medium text-[#4B6356]">Product Name (Type 1–2 letters)</label>
                          <input
                            type="text"
                            required
                            value={line.productQuery}
                            onFocus={() => setActiveLineDropdown(idx)}
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx] = { ...next[idx], productQuery: e.target.value, productId: '' };
                              setLines(next);
                              setActiveLineDropdown(idx);
                            }}
                            placeholder="Search stock..."
                            className="w-full rounded border border-[#DDE7E0] bg-white px-2.5 py-1.5 text-xs"
                          />
                          {matchedProd && (
                            <p className={`mt-1 text-[11px] font-medium ${lowStock ? 'text-[#DC2626]' : 'text-[#1E7134]'}`}>
                              In Stock: {matchedProd.stockQty} {matchedProd.unit}
                            </p>
                          )}
                          {activeLineDropdown === idx && suggestions.length > 0 && (
                            <div className="absolute z-30 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-[#DDE7E0] bg-white shadow-lg">
                              {suggestions.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => handleSelectProduct(idx, p)}
                                  className="flex w-full items-center justify-between border-b border-[#DDE7E0]/60 px-2.5 py-2 text-left text-xs hover:bg-[#EAF4EE] last:border-0"
                                >
                                  <span className="font-medium text-[#0D2319]">{p.name}</span>
                                  <span className="font-mono text-[11px] text-[#07432B]">
                                    Stk: {p.stockQty} · {formatCurrency(p.salesPrice, cur)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="col-span-2">
                          <label className="mb-1 block text-[11px] font-medium text-[#4B6356]">Qty</label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={line.qty}
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx].qty = Number(e.target.value);
                              setLines(next);
                            }}
                            className="w-full rounded border border-[#DDE7E0] bg-white px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="mb-1 block text-[11px] font-medium text-[#4B6356]">Bonus Qty</label>
                          <input
                            type="number"
                            min={0}
                            value={line.bonusQty}
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx].bonusQty = Number(e.target.value);
                              setLines(next);
                            }}
                            className="w-full rounded border border-[#DDE7E0] bg-white px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="mb-1 block text-[11px] font-medium text-[#4B6356]">Sales Price</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            required
                            value={line.salesPrice}
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx].salesPrice = Number(e.target.value);
                              setLines(next);
                            }}
                            className="w-full rounded border border-[#DDE7E0] bg-white px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>

                        <div className="col-span-1">
                          <label className="mb-1 block text-[11px] font-medium text-[#4B6356]">Disc %</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={line.discountPercent}
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx].discountPercent = Number(e.target.value);
                              setLines(next);
                            }}
                            className="w-full rounded border border-[#DDE7E0] bg-white px-2 py-1.5 font-mono text-xs"
                          />
                        </div>

                        <div className="col-span-1 text-right">
                          <label className="mb-1 block text-[11px] font-medium text-[#4B6356]">Total</label>
                          <p className="py-1.5 font-mono text-xs font-semibold text-[#07432B]">{formatCurrency(total, cur)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Payment Terms, Method, Period & Others Terms (For Sales Challan) */}
              {popupFormat === 'challan' && (
                <div className="space-y-4 rounded-xl border border-[#DDE7E0] bg-[#F7FAF8] p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Payment Terms</label>
                      <select
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value as 'Cash' | 'Credit')}
                        className="w-full rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-xs"
                      >
                        <option value="Credit">Credit Sale</option>
                        <option value="Cash">Cash / Instant Paid</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as SalesChallan['paymentMethod'])}
                        className="w-full rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-xs"
                      >
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cash">Cash</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Mobile Banking">Mobile Banking</option>
                      </select>
                    </div>
                    {paymentTerms === 'Credit' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium">Payment Period (Days)</label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={paymentPeriodDays}
                          onChange={(e) => setPaymentPeriodDays(Number(e.target.value))}
                          className="w-full rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#0D2319]">Others Terms</label>
                    <textarea
                      rows={2}
                      value={otherTerms}
                      onChange={(e) => setOtherTerms(e.target.value)}
                      placeholder="Write any additional delivery, warranty, transport, or special terms here..."
                      className="w-full rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-xs focus:border-[#07432B] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {(popupFormat === 'quotation' || popupFormat === 'order') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      {popupFormat === 'quotation' ? 'Valid Until' : 'Expected Delivery Date'}
                    </label>
                    <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Notes</label>
                    <input type="text" value={txNotes} onChange={(e) => setTxNotes(e.target.value)} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                  </div>
                </div>
              )}

              {popupFormat === 'return' && (
                <div>
                  <label className="mb-1 block text-xs font-medium">Reason for Sales Return</label>
                  <input type="text" required value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[#DDE7E0] pt-4">
                <div className="text-xs">
                  <span className="text-[#4B6356]">Grand Net Total: </span>
                  <span className="font-mono text-base font-bold text-[#07432B]">
                    {formatCurrency(
                      lines.reduce((s, l) => s + computeLine(l).total, 0),
                      cur
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setPopupFormat(null)} className="rounded-lg border border-[#DDE7E0] px-4 py-2 text-xs font-medium text-[#0D2319]">
                    {t.cancel}
                  </button>
                  <button type="submit" className="rounded-lg bg-[#07432B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
                    {t.save}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Insufficient Stock Alert Popup */}
      {stockAlert && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-[#DC2626]">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#DC2626]">Insufficient Stock Available</h3>
                <p className="mt-1 text-xs text-[#0D2319]">
                  Cannot dispatch Sales Challan because <strong>{stockAlert.productName}</strong> does not have enough stock.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-[#F7FAF8] p-3 text-xs">
                  <div>
                    <span className="text-[#4B6356]">Requested (incl. Bonus):</span>
                    <p className="font-mono text-sm font-bold text-[#DC2626]">{stockAlert.requested}</p>
                  </div>
                  <div>
                    <span className="text-[#4B6356]">Available Stock:</span>
                    <p className="font-mono text-sm font-bold text-[#07432B]">{stockAlert.available}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setStockAlert(null)}
                className="rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]"
              >
                Adjust Quantity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Sales Invoice / Delivery Challan Preview */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="print-area max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[#DDE7E0] bg-white p-8 shadow-2xl">
            <div className="no-print mb-5 flex items-center justify-between border-b border-[#DDE7E0] pb-3">
              <span className="text-xs font-semibold text-[#07432B]">
                {previewDoc.kind === 'invoice' ? 'Sales Invoice' : 'Delivery Challan'} Preview
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3 py-1.5 text-xs font-medium text-white">
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button onClick={() => setPreviewDoc(null)} className="rounded-lg border border-[#DDE7E0] px-3 py-1.5 text-xs font-medium">
                  Close
                </button>
              </div>
            </div>

            <div className="flex items-start justify-between border-b-2 border-[#07432B] pb-4">
              <div className="flex items-center gap-3">
                <img src="/assets/aistudio/images__32__e2bc1202.jpeg" alt="Provet" className="h-10 w-auto object-contain" referrerPolicy="no-referrer" />
                <div>
                  <h2 className="text-lg font-bold text-[#07432B]">{db.company.name}</h2>
                  <p className="text-xs text-[#4B6356]">{db.company.address}</p>
                </div>
              </div>
              <div className="text-right text-xs">
                <h3 className="text-base font-bold uppercase text-[#0D2319]">
                  {previewDoc.kind === 'invoice' ? 'SALES INVOICE' : 'DELIVERY CHALLAN'}
                </h3>
                <p className="font-mono font-semibold text-[#07432B]">
                  {previewDoc.kind === 'invoice' ? previewDoc.challan.invoiceNo : previewDoc.challan.deliveryChallanNo}
                </p>
                <p className="text-[#4B6356]">Ref Challan: {previewDoc.challan.challanNo} · Date: {previewDoc.challan.date}</p>
              </div>
            </div>

            <div className="my-4 grid grid-cols-2 gap-4 rounded-lg bg-[#F7FAF8] p-4 text-xs">
              <div>
                <p className="font-semibold text-[#4B6356]">Billed / Delivered To:</p>
                <p className="mt-1 font-bold text-[#0D2319]">{previewDoc.challan.customerName}</p>
                <p className="text-[#4B6356]">{previewDoc.challan.customerAddress}</p>
                <p className="text-[#4B6356]">{previewDoc.challan.customerMobile} · {previewDoc.challan.customerEmail}</p>
              </div>
              <div className="text-right">
                <p><span className="text-[#4B6356]">Payment Terms:</span> <strong>{previewDoc.challan.paymentTerms}</strong></p>
                <p><span className="text-[#4B6356]">Method:</span> {previewDoc.challan.paymentMethod}</p>
                <p><span className="text-[#4B6356]">Due Date:</span> {previewDoc.challan.dueDate}</p>
              </div>
            </div>

            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#07432B] text-white">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Bonus</th>
                  {previewDoc.kind === 'invoice' && (
                    <>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Discount</th>
                      <th className="px-3 py-2 text-right">Line Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {previewDoc.challan.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{it.productName}</td>
                    <td className="px-3 py-2 text-right font-mono">{it.qty}</td>
                    <td className="px-3 py-2 text-right font-mono">{it.bonusQty || 0}</td>
                    {previewDoc.kind === 'invoice' && (
                      <>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(it.salesPrice, cur)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(it.discountAmount, cur)}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrency(it.lineTotal, cur)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {previewDoc.kind === 'invoice' && (
              <div className="mt-4 space-y-3">
                <div className="flex justify-end">
                  <div className="w-64 space-y-1.5 text-xs">
                    <div className="flex justify-between"><span>Sub Total:</span><span className="font-mono">{formatCurrency(previewDoc.challan.subTotal, cur)}</span></div>
                    <div className="flex justify-between"><span>Discount:</span><span className="font-mono">-{formatCurrency(previewDoc.challan.totalDiscount, cur)}</span></div>
                    <div className="flex justify-between border-t-2 border-[#07432B] pt-1.5 text-sm font-bold text-[#07432B]">
                      <span>Net Invoice Total:</span>
                      <span className="font-mono">{formatCurrency(previewDoc.challan.netAmount, cur)}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-[#DDE7E0] bg-[#EAF4EE]/60 px-4 py-2.5 text-xs">
                  <span className="font-semibold text-[#07432B]">Amount in Words: </span>
                  <span className="font-medium text-[#0D2319]">{numberToWords(previewDoc.challan.netAmount)}</span>
                </div>
              </div>
            )}

            {previewDoc.challan.otherTerms && (
              <div className="mt-4 rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] px-4 py-2.5 text-xs">
                <p className="font-semibold text-[#4B6356]">Others Terms:</p>
                <p className="mt-0.5 whitespace-pre-wrap text-[#0D2319]">{previewDoc.challan.otherTerms}</p>
              </div>
            )}

            <div className="mt-12 grid grid-cols-2 gap-12 pt-6 text-center text-xs text-[#4B6356]">
              <div className="border-t border-[#DDE7E0] pt-2">Authorized Signature (Provet)</div>
              <div className="border-t border-[#DDE7E0] pt-2">Receiver's Signature & Stamp</div>
            </div>
          </div>
        </div>
      )}

      {/* Printable & Downloadable Sales Quotation Modal */}
      {previewQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="print-area max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[#DDE7E0] bg-white p-8 shadow-2xl">
            <div className="no-print mb-5 flex items-center justify-between border-b border-[#DDE7E0] pb-3">
              <span className="text-xs font-semibold text-[#07432B]">Sales Quotation Preview</span>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE7E0] bg-white px-3 py-1.5 text-xs font-medium text-[#0D2319] hover:bg-[#EAF4EE]">
                  <Printer className="h-3.5 w-3.5 text-[#07432B]" /> Print
                </button>
                <button
                  onClick={() =>
                    exportQuotationToPDF({
                      companyName: db.company.name,
                      companyAddress: db.company.address,
                      companyPhone: db.company.phone,
                      companyEmail: db.company.email,
                      quotNo: previewQuotation.quotNo,
                      date: previewQuotation.date,
                      validUntil: previewQuotation.validUntil,
                      customerName: previewQuotation.customerName,
                      customerAddress: previewQuotation.customerAddress,
                      customerMobile: previewQuotation.customerMobile,
                      notes: previewQuotation.notes,
                      currency: cur === '৳' ? 'BDT ' : cur,
                      items: previewQuotation.items.map((it) => ({
                        productName: it.productName,
                        qty: it.qty,
                        bonusQty: it.bonusQty || 0,
                        salesPrice: it.salesPrice,
                        discountAmount: it.discountAmount || 0,
                        lineTotal: it.lineTotal,
                      })),
                      totalAmount: previewQuotation.totalAmount,
                      amountInWords: numberToWords(previewQuotation.totalAmount),
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1E7134]"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </button>
                <button onClick={() => setPreviewQuotation(null)} className="rounded-lg border border-[#DDE7E0] px-3 py-1.5 text-xs font-medium">
                  Close
                </button>
              </div>
            </div>

            <div className="flex items-start justify-between border-b-2 border-[#07432B] pb-4">
              <div className="flex items-center gap-3">
                <img src="/assets/aistudio/images__32__e2bc1202.jpeg" alt="Provet" className="h-10 w-auto object-contain" referrerPolicy="no-referrer" />
                <div>
                  <h2 className="text-lg font-bold text-[#07432B]">{db.company.name}</h2>
                  <p className="text-xs text-[#4B6356]">{db.company.address}</p>
                  <p className="text-xs text-[#4B6356]">{db.company.phone} · {db.company.email}</p>
                </div>
              </div>
              <div className="text-right text-xs">
                <h3 className="text-base font-bold uppercase text-[#0D2319]">SALES QUOTATION</h3>
                <p className="font-mono font-semibold text-[#07432B]">{previewQuotation.quotNo}</p>
                <p className="text-[#4B6356]">Date: {previewQuotation.date}</p>
                <p className="text-[#4B6356]">Valid Until: {previewQuotation.validUntil}</p>
              </div>
            </div>

            <div className="my-4 rounded-lg bg-[#F7FAF8] p-4 text-xs">
              <p className="font-semibold text-[#4B6356]">Quotation Prepared For:</p>
              <p className="mt-1 font-bold text-[#0D2319]">{previewQuotation.customerName}</p>
              <p className="text-[#4B6356]">{previewQuotation.customerAddress}</p>
              <p className="text-[#4B6356]">Mobile: {previewQuotation.customerMobile}</p>
            </div>

            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#07432B] text-white">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Product Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Bonus</th>
                  <th className="px-3 py-2 text-right">Unit Price</th>
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {previewQuotation.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{it.productName}</td>
                    <td className="px-3 py-2 text-right font-mono">{it.qty}</td>
                    <td className="px-3 py-2 text-right font-mono">{it.bonusQty || 0}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatCurrency(it.salesPrice, cur)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatCurrency(it.discountAmount || 0, cur)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrency(it.lineTotal, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-64 border-t-2 border-[#07432B] pt-2 text-xs">
                <div className="flex justify-between text-sm font-bold text-[#07432B]">
                  <span>Quotation Total:</span>
                  <span className="font-mono">{formatCurrency(previewQuotation.totalAmount, cur)}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-[#DDE7E0] bg-[#EAF4EE]/60 px-4 py-2 text-xs">
              <span className="font-semibold text-[#07432B]">Amount in Words: </span>
              <span className="font-medium text-[#0D2319]">{numberToWords(previewQuotation.totalAmount)}</span>
            </div>

            {previewQuotation.notes && (
              <p className="mt-3 text-xs text-[#4B6356]"><strong>Notes / Terms:</strong> {previewQuotation.notes}</p>
            )}

            <div className="mt-12 grid grid-cols-2 gap-12 pt-6 text-center text-xs text-[#4B6356]">
              <div className="border-t border-[#DDE7E0] pt-2">Authorized Signature (Provet)</div>
              <div className="border-t border-[#DDE7E0] pt-2">Customer Acceptance</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
