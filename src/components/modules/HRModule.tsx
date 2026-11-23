import React, { useState } from 'react';
import { CalendarCheck, Check, FileBarChart, Plus, Printer, UserPlus, Users, Wallet, X } from 'lucide-react';
import type { ERPDatabase, PayrollEntry, PayrollRun } from '../../types/erp';
import { formatCurrency } from '../../utils/accounting';
import { apiFetch } from '../../utils/api';
import type { ReportType } from '../DateFilterModal';

interface HRModuleProps {
  db: ERPDatabase;
  onRefresh: (newDb: ERPDatabase) => void;
  onOpenReport: (type: ReportType, title: string) => void;
}

type HRTab = 'employees' | 'attendance' | 'leaves' | 'payroll' | 'reports';

export const HRModule: React.FC<HRModuleProps> = ({ db, onRefresh, onOpenReport }) => {
  const cur = db.company.currency;
  const [activeTab, setActiveTab] = useState<HRTab>('employees');
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [payslipPreview, setPayslipPreview] = useState<{ run: PayrollRun; entry: PayrollEntry } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Add Employee
  const [empForm, setEmpForm] = useState({
    name: '',
    designation: '',
    department: 'Sales & Marketing',
    phone: '',
    email: '',
    joinDate: new Date().toISOString().slice(0, 10),
    basicSalary: 30000,
    houseRent: 12000,
    medicalAllowance: 3000,
    transportAllowance: 3000,
    bankAccount: '',
  });

  // Attendance Date & Map
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [attStatusMap, setAttStatusMap] = useState<Record<string, 'Present' | 'Late' | 'Absent' | 'Leave'>>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map: Record<string, 'Present' | 'Late' | 'Absent' | 'Leave'> = {};
    db.employees.forEach((e) => {
      const existing = db.attendance.find((a) => a.date === today && a.employeeId === e.id);
      map[e.id] = existing?.status || 'Present';
    });
    return map;
  });

  // Leave Application
  const [leaveForm, setLeaveForm] = useState({
    empId: db.employees[0]?.id || '',
    leaveType: 'Casual' as 'Annual' | 'Sick' | 'Casual',
    fromDate: new Date().toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    days: 1,
    reason: '',
  });

  // Payroll Draft
  const [payMonth, setPayMonth] = useState('2026-11');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<'Bank Transfer' | 'Cash'>('Bank Transfer');
  const [postPayrollToAccounts, setPostPayrollToAccounts] = useState(true);
  const [overtimeMap, setOvertimeMap] = useState<Record<string, number>>({});
  const [deductionMap, setDeductionMap] = useState<Record<string, number>>({});

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/erp/employees', {
      method: 'POST',
      body: JSON.stringify(empForm),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setShowAddEmp(false);
    setEmpForm({
      name: '',
      designation: '',
      department: 'Sales & Marketing',
      phone: '',
      email: '',
      joinDate: new Date().toISOString().slice(0, 10),
      basicSalary: 30000,
      houseRent: 12000,
      medicalAllowance: 3000,
      transportAllowance: 3000,
      bankAccount: '',
    });
    setFeedback({ type: 'ok', msg: `Employee "${data.employee.name}" onboarded (${data.employee.empCode}).` });
  };

  const handleSaveAttendance = async () => {
    const records = db.employees.map((e) => ({
      employeeId: e.id,
      status: attStatusMap[e.id] || 'Present',
    }));
    const res = await apiFetch('/api/erp/attendance', {
      method: 'POST',
      body: JSON.stringify({ date: attDate, records }),
    });
    const data = await res.json();
    if (res.ok) {
      onRefresh(data.db);
      setFeedback({ type: 'ok', msg: `Attendance register saved for ${attDate}.` });
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const empId = leaveForm.empId || db.employees[0]?.id;
    if (!empId) return setFeedback({ type: 'err', msg: 'Please onboard an employee first.' });
    const res = await apiFetch('/api/erp/leaves', {
      method: 'POST',
      body: JSON.stringify({ ...leaveForm, empId }),
    });
    const data = await res.json();
    if (res.ok) {
      onRefresh(data.db);
      setLeaveForm({ ...leaveForm, reason: '' });
      setFeedback({ type: 'ok', msg: 'Leave request submitted.' });
    }
  };

  const handleLeaveAction = async (id: string, status: 'Approved' | 'Rejected') => {
    const res = await apiFetch(`/api/erp/leaves/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok) {
      onRefresh(data.db);
      setFeedback({ type: 'ok', msg: `Leave request marked as ${status}.` });
    }
  };

  const payrollPreviewEntries: PayrollEntry[] = db.employees.map((e) => {
    const allowances = e.houseRent + e.medicalAllowance + e.transportAllowance;
    const overtime = Number(overtimeMap[e.id] || 0);
    const deductions = Number(deductionMap[e.id] || 0);
    const netSalary = Math.max(0, e.basicSalary + allowances + overtime - deductions);
    return {
      employeeId: e.id,
      empCode: e.empCode,
      employeeName: e.name,
      designation: e.designation,
      department: e.department,
      basicSalary: e.basicSalary,
      allowances,
      overtime,
      deductions,
      netSalary,
    };
  });

  const handleProcessPayroll = async () => {
    const res = await apiFetch('/api/erp/payroll', {
      method: 'POST',
      body: JSON.stringify({
        month: payMonth,
        date: payDate,
        paymentMethod: payMethod,
        entries: payrollPreviewEntries,
        postToAccounts: postPayrollToAccounts,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    onRefresh(data.db);
    setFeedback({
      type: 'ok',
      msg: `Payroll Run ${data.run.runNo} processed${data.run.voucherNo ? ` & posted to Accounts (${data.run.voucherNo})` : ''}.`,
    });
  };

  const handlePostRunToAccounts = async (runId: string) => {
    const res = await apiFetch(`/api/erp/payroll/${runId}/post`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      onRefresh(data.db);
      setFeedback({ type: 'ok', msg: `Payroll posted to General Ledger (${data.run.voucherNo}).` });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE7E0] pb-4">
        <div>
          <p className="text-xs font-medium text-[#1E7134]">Human Resources & Payroll</p>
          <h1 className="text-2xl font-bold text-[#0D2319]">HR Complete Module</h1>
        </div>
        <button
          onClick={() => setShowAddEmp(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]"
        >
          <UserPlus className="h-4 w-4" /> Add Employee
        </button>
      </div>

      {/* HR Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#DDE7E0] pb-3">
        {[
          { id: 'employees' as const, label: 'Employee Directory', icon: Users },
          { id: 'attendance' as const, label: 'Attendance Register', icon: CalendarCheck },
          { id: 'leaves' as const, label: 'Leave Management', icon: CalendarCheck },
          { id: 'payroll' as const, label: 'Payroll & Payslips', icon: Wallet },
          { id: 'reports' as const, label: 'HR Reports', icon: FileBarChart },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'border-[#07432B] bg-[#07432B] text-white'
                  : 'border-[#DDE7E0] bg-white text-[#0D2319] hover:bg-[#EAF4EE]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
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

      {activeTab === 'employees' && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#0D2319]">Active Staff Directory ({db.employees.length})</h3>
            <button onClick={() => setShowAddEmp(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3.5 py-2 text-xs font-medium text-white">
              <Plus className="h-3.5 w-3.5" /> New Employee
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Name & Contact</th>
                  <th className="px-3 py-2.5">Designation & Dept</th>
                  <th className="px-3 py-2.5">Join Date</th>
                  <th className="px-3 py-2.5 text-right">Basic</th>
                  <th className="px-3 py-2.5 text-right">Allowances</th>
                  <th className="px-3 py-2.5 text-right">Gross Salary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.employees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-xs text-[#4B6356]">
                      No employees onboarded yet. Click &ldquo;New Employee&rdquo; to add staff.
                    </td>
                  </tr>
                ) : (
                  db.employees.map((e) => {
                    const allow = e.houseRent + e.medicalAllowance + e.transportAllowance;
                    return (
                      <tr key={e.id} className="hover:bg-[#F7FAF8]">
                        <td className="px-3 py-2.5 font-mono text-[#07432B]">{e.empCode}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-[#0D2319]">{e.name}</p>
                          <p className="text-[11px] text-[#4B6356]">{e.phone} · {e.email}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{e.designation}</p>
                          <p className="text-[11px] text-[#4B6356]">{e.department}</p>
                        </td>
                        <td className="px-3 py-2.5 text-[#4B6356] tabular-nums">{e.joinDate}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCurrency(e.basicSalary, cur)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCurrency(allow, cur)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-[#07432B] tabular-nums">
                          {formatCurrency(e.basicSalary + allow, cur)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-[#0D2319]">Daily Attendance Register</h3>
              <p className="text-xs text-[#4B6356]">Mark daily presence, late arrivals, and approved leave</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={attDate}
                onChange={(e) => setAttDate(e.target.value)}
                className="rounded-lg border border-[#DDE7E0] px-3 py-1.5 text-xs"
              />
              <button
                onClick={handleSaveAttendance}
                className="rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]"
              >
                Save Attendance
              </button>
            </div>
          </div>

          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                <th className="px-3 py-2.5">Emp Code</th>
                <th className="px-3 py-2.5">Employee Name</th>
                <th className="px-3 py-2.5">Department</th>
                <th className="px-3 py-2.5">Attendance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE7E0]">
              {db.employees.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2.5 font-mono text-[#07432B]">{e.empCode}</td>
                  <td className="px-3 py-2.5 font-medium">{e.name}</td>
                  <td className="px-3 py-2.5 text-[#4B6356]">{e.department}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {(['Present', 'Late', 'Absent', 'Leave'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setAttStatusMap({ ...attStatusMap, [e.id]: st })}
                          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                            attStatusMap[e.id] === st
                              ? st === 'Absent'
                                ? 'border-[#DC2626] bg-[#DC2626] text-white'
                                : st === 'Late'
                                ? 'border-[#D97706] bg-[#D97706] text-white'
                                : 'border-[#07432B] bg-[#07432B] text-white'
                              : 'border-[#DDE7E0] bg-white text-[#4B6356] hover:bg-[#F7FAF8]'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'leaves' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSubmitLeave} className="space-y-4 rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-4">
            <h3 className="text-base font-semibold text-[#0D2319]">Apply for Leave</h3>
            <div>
              <label className="mb-1 block text-xs font-medium">Employee</label>
              <select value={leaveForm.empId} onChange={(e) => setLeaveForm({ ...leaveForm, empId: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                {db.employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Leave Type</label>
                <select value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value as 'Annual' | 'Sick' | 'Casual' })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs">
                  <option value="Casual">Casual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Annual">Annual Leave</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Days</label>
                <input type="number" min={1} required value={leaveForm.days} onChange={(e) => setLeaveForm({ ...leaveForm, days: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">From Date</label>
                <input type="date" required value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">To Date</label>
                <input type="date" required value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Reason</label>
              <input type="text" required value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
              Submit Leave Request
            </button>
          </form>

          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6 lg:col-span-8">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">Leave Approval Queue</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] text-[#4B6356]">
                  <th className="py-2">Employee</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Duration</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {db.leaves.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 font-medium">{l.employeeName}</td>
                    <td className="py-2.5">{l.leaveType} ({l.days}d)</td>
                    <td className="py-2.5 text-[#4B6356]">{l.fromDate} → {l.toDate}</td>
                    <td className="py-2.5 text-[#4B6356]">{l.reason}</td>
                    <td className={`py-2.5 font-semibold ${l.status === 'Approved' ? 'text-[#1E7134]' : l.status === 'Rejected' ? 'text-[#DC2626]' : 'text-[#D97706]'}`}>
                      {l.status}
                    </td>
                    <td className="py-2.5 text-right">
                      {l.status === 'Pending' && (
                        <div className="inline-flex gap-1.5">
                          <button onClick={() => handleLeaveAction(l.id, 'Approved')} className="rounded bg-[#07432B] px-2.5 py-1 text-[11px] font-medium text-white">
                            Approve
                          </button>
                          <button onClick={() => handleLeaveAction(l.id, 'Rejected')} className="rounded border border-[#DDE7E0] px-2.5 py-1 text-[11px] font-medium text-[#DC2626]">
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'payroll' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-[#DDE7E0] pb-4">
              <div>
                <h3 className="text-base font-semibold text-[#0D2319]">Monthly Payroll Run</h3>
                <p className="text-xs text-[#4B6356]">Configure overtime/deductions and optionally post directly to Salaries Expense & Cash/Bank Ledger</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} className="rounded-lg border border-[#DDE7E0] px-3 py-1.5 text-xs" />
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="rounded-lg border border-[#DDE7E0] px-3 py-1.5 text-xs" />
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'Bank Transfer' | 'Cash')} className="rounded-lg border border-[#DDE7E0] px-3 py-1.5 text-xs">
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0D2319]">
                  <input type="checkbox" checked={postPayrollToAccounts} onChange={(e) => setPostPayrollToAccounts(e.target.checked)} className="accent-[#07432B]" />
                  Post to Accounts
                </label>
                <button onClick={handleProcessPayroll} className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
                  <Check className="h-3.5 w-3.5" /> Process Payroll
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2 text-right">Basic</th>
                    <th className="px-3 py-2 text-right">Allowances</th>
                    <th className="px-3 py-2 text-right">Overtime (+)</th>
                    <th className="px-3 py-2 text-right">Deductions (-)</th>
                    <th className="px-3 py-2 text-right">Net Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE7E0]">
                  {payrollPreviewEntries.map((ent) => (
                    <tr key={ent.employeeId}>
                      <td className="px-3 py-2 font-medium">{ent.employeeName} <span className="text-[#4B6356]">({ent.designation})</span></td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(ent.basicSalary, cur)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(ent.allowances, cur)}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min={0} value={overtimeMap[ent.employeeId] || 0} onChange={(e) => setOvertimeMap({ ...overtimeMap, [ent.employeeId]: Number(e.target.value) })} className="w-24 rounded border border-[#DDE7E0] px-2 py-1 text-right font-mono text-xs" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min={0} value={deductionMap[ent.employeeId] || 0} onChange={(e) => setDeductionMap({ ...deductionMap, [ent.employeeId]: Number(e.target.value) })} className="w-24 rounded border border-[#DDE7E0] px-2 py-1 text-right font-mono text-xs" />
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-[#07432B]">{formatCurrency(ent.netSalary, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
            <h3 className="mb-3 text-base font-semibold text-[#0D2319]">Processed Payroll Runs & Payslips</h3>
            {db.payrollRuns.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#4B6356]">No payroll runs processed yet. Click "Process Payroll" above to generate payslips.</p>
            ) : (
              <div className="space-y-4">
                {db.payrollRuns.map((run) => (
                  <div key={run.id} className="rounded-lg border border-[#DDE7E0] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs">
                        <span className="font-mono font-bold text-[#07432B]">{run.runNo}</span>
                        <span className="mx-2 text-[#4B6356]">·</span>
                        <span className="font-medium">Month: {run.month}</span>
                        <span className="mx-2 text-[#4B6356]">·</span>
                        <span>Net Disbursed: <strong className="font-mono">{formatCurrency(run.totalNet, cur)}</strong></span>
                      </div>
                      <div>
                        {run.postedToAccounts ? (
                          <span className="text-xs font-semibold text-[#1E7134]">Posted to GL ({run.voucherNo})</span>
                        ) : (
                          <button onClick={() => handlePostRunToAccounts(run.id)} className="rounded bg-[#07432B] px-3 py-1 text-xs font-medium text-white">
                            Post to Accounts
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {run.entries.map((ent) => (
                        <button
                          key={ent.employeeId}
                          onClick={() => setPayslipPreview({ run, entry: ent })}
                          className="inline-flex items-center gap-1.5 rounded border border-[#DDE7E0] bg-[#F7FAF8] px-3 py-1.5 text-xs font-medium text-[#0D2319] hover:bg-[#EAF4EE]"
                        >
                          <Printer className="h-3 w-3 text-[#07432B]" />
                          Payslip: {ent.employeeName}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { id: 'hr-employees' as const, title: 'Employee Roster & Compensation', desc: 'Staff details & gross salary breakdown' },
            { id: 'hr-attendance' as const, title: 'Attendance Register', desc: 'Date-filtered attendance logs' },
            { id: 'hr-payroll' as const, title: 'Payroll Disbursement Summary', desc: 'Monthly payroll runs & GL voucher refs' },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => onOpenReport(r.id, r.title)}
              className="rounded-xl border border-[#DDE7E0] bg-white p-5 text-left hover:border-[#07432B] hover:bg-[#EAF4EE]"
            >
              <FileBarChart className="mb-2 h-5 w-5 text-[#1E7134]" />
              <h3 className="text-sm font-semibold text-[#0D2319]">{r.title}</h3>
              <p className="mt-1 text-xs text-[#4B6356]">{r.desc}</p>
            </button>
          ))}
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-xl border border-[#DDE7E0] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#DDE7E0] px-6 py-4">
              <h3 className="text-base font-semibold text-[#0D2319]">Onboard New Employee</h3>
              <button onClick={() => setShowAddEmp(false)} className="rounded-lg p-1 text-[#4B6356] hover:bg-[#EAF4EE]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddEmployee} className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Full Name *</label>
                  <input type="text" required value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Designation *</label>
                  <input type="text" required value={empForm.designation} onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Department</label>
                  <input type="text" required value={empForm.department} onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Phone</label>
                  <input type="text" required value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Join Date</label>
                  <input type="date" required value={empForm.joinDate} onChange={(e) => setEmpForm({ ...empForm, joinDate: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Email</label>
                  <input type="email" value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Bank Account</label>
                  <input type="text" value={empForm.bankAccount} onChange={(e) => setEmpForm({ ...empForm, bankAccount: e.target.value })} className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Basic</label>
                  <input type="number" min={0} required value={empForm.basicSalary} onChange={(e) => setEmpForm({ ...empForm, basicSalary: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-2.5 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">House Rent</label>
                  <input type="number" min={0} value={empForm.houseRent} onChange={(e) => setEmpForm({ ...empForm, houseRent: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-2.5 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Medical</label>
                  <input type="number" min={0} value={empForm.medicalAllowance} onChange={(e) => setEmpForm({ ...empForm, medicalAllowance: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-2.5 py-2 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Transport</label>
                  <input type="number" min={0} value={empForm.transportAllowance} onChange={(e) => setEmpForm({ ...empForm, transportAllowance: Number(e.target.value) })} className="w-full rounded-lg border border-[#DDE7E0] px-2.5 py-2 text-xs" />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-[#DDE7E0] pt-4">
                <button type="button" onClick={() => setShowAddEmp(false)} className="rounded-lg border border-[#DDE7E0] px-4 py-2 text-xs font-medium">Cancel</button>
                <button type="submit" className="rounded-lg bg-[#07432B] px-5 py-2 text-xs font-semibold text-white">Save Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Individual Payslip Modal */}
      {payslipPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="print-area w-full max-w-xl rounded-xl border border-[#DDE7E0] bg-white p-8 shadow-2xl">
            <div className="no-print mb-4 flex justify-end gap-2">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#07432B] px-3 py-1.5 text-xs font-medium text-white">
                <Printer className="h-3.5 w-3.5" /> Print Payslip
              </button>
              <button onClick={() => setPayslipPreview(null)} className="rounded-lg border border-[#DDE7E0] px-3 py-1.5 text-xs font-medium">Close</button>
            </div>
            <div className="flex items-center justify-between border-b-2 border-[#07432B] pb-4">
              <div className="flex items-center gap-3">
                <img src="/assets/aistudio/images__32__e2bc1202.jpeg" alt="Provet" className="h-9 w-auto object-contain" referrerPolicy="no-referrer" />
                <div>
                  <h3 className="text-base font-bold text-[#07432B]">{db.company.name}</h3>
                  <p className="text-xs text-[#4B6356]">Employee Salary Slip · {payslipPreview.run.month}</p>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="font-mono font-semibold">{payslipPreview.run.runNo}</p>
                <p className="text-[#4B6356]">Paid: {payslipPreview.run.date}</p>
              </div>
            </div>
            <div className="my-4 grid grid-cols-2 gap-3 rounded-lg bg-[#F7FAF8] p-3 text-xs">
              <div>
                <p className="font-bold text-[#0D2319]">{payslipPreview.entry.employeeName}</p>
                <p className="text-[#4B6356]">{payslipPreview.entry.designation}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[#07432B]">{payslipPreview.entry.empCode}</p>
                <p className="text-[#4B6356]">{payslipPreview.entry.department}</p>
              </div>
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-[#DDE7E0]">
                <tr><td className="py-2">Basic Salary</td><td className="py-2 text-right font-mono">{formatCurrency(payslipPreview.entry.basicSalary, cur)}</td></tr>
                <tr><td className="py-2">Allowances (House Rent, Medical, Transport)</td><td className="py-2 text-right font-mono">{formatCurrency(payslipPreview.entry.allowances, cur)}</td></tr>
                <tr><td className="py-2">Overtime / Bonus</td><td className="py-2 text-right font-mono">{formatCurrency(payslipPreview.entry.overtime, cur)}</td></tr>
                <tr><td className="py-2 text-[#DC2626]">Deductions</td><td className="py-2 text-right font-mono text-[#DC2626]">-{formatCurrency(payslipPreview.entry.deductions, cur)}</td></tr>
                <tr className="bg-[#EAF4EE] font-bold text-[#07432B]"><td className="px-2 py-2.5">Net Salary Paid ({payslipPreview.run.paymentMethod})</td><td className="px-2 py-2.5 text-right font-mono">{formatCurrency(payslipPreview.entry.netSalary, cur)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
