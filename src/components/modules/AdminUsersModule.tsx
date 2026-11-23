import React, { useEffect, useState } from 'react';
import { KeyRound, Plus, Shield, UserCheck, UserX, X } from 'lucide-react';
import type { ERPUser, PermissionKey } from '../../types/erp';
import { apiFetch } from '../../utils/api';

interface AdminUsersModuleProps {
  currentUser: ERPUser;
}

const PERMISSION_META: { key: PermissionKey; label: string; desc: string }[] = [
  { key: 'dashboard', label: 'Dashboard', desc: 'View financial KPIs & charts' },
  { key: 'stock', label: 'Stock Module', desc: 'Add stock, requisitions, transfer, damage & stock reports' },
  { key: 'purchase', label: 'Purchase Module', desc: 'Suppliers, PR, quotations, purchase invoices & payables' },
  { key: 'sales', label: 'Sales Module', desc: 'Customers, pricing, quotations, orders, challans & receivables' },
  { key: 'account', label: 'Account Module', desc: 'Vouchers (Receipt/Payment/Journal/Contra) & Financial Statements' },
  { key: 'reports', label: 'Reports Hub', desc: 'Centralized exportable reports access' },
  { key: 'hr', label: 'HR Complete Module', desc: 'Employees, attendance, leaves & payroll' },
];

export const AdminUsersModule: React.FC<AdminUsersModuleProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<ERPUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Create User State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    fullName: '',
    password: '',
    role: 'Staff' as 'Admin' | 'Staff',
    permissions: ['dashboard', 'sales'] as PermissionKey[],
  });

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<ERPUser | null>(null);
  const [editPerms, setEditPerms] = useState<PermissionKey[]>([]);
  const [editRole, setEditRole] = useState<'Admin' | 'Staff'>('Staff');
  const [editFullName, setEditFullName] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    const res = await apiFetch('/api/admin/users');
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const toggleCreatePerm = (p: PermissionKey) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(p)
        ? prev.permissions.filter((x) => x !== p)
        : [...prev.permissions, p],
    }));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    setUsers(data.users);
    setShowCreateModal(false);
    setForm({ userId: '', fullName: '', password: '', role: 'Staff', permissions: ['dashboard', 'sales'] });
    setFeedback({ type: 'ok', msg: `User "${data.user.userId}" created with assigned module access.` });
  };

  const openEdit = (u: ERPUser) => {
    setEditingUser(u);
    setEditFullName(u.fullName);
    setEditRole(u.role);
    setEditPerms(u.permissions);
    setResetPassword('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const res = await apiFetch(`/api/admin/users/${editingUser.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: editFullName,
        role: editRole,
        permissions: editPerms,
        ...(resetPassword.trim() ? { password: resetPassword.trim() } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) return setFeedback({ type: 'err', msg: data.error });
    setUsers(data.users);
    setEditingUser(null);
    setFeedback({ type: 'ok', msg: `Updated permissions and profile for "${data.user.userId}".` });
  };

  const handleToggleActive = async (u: ERPUser) => {
    if (u.id === currentUser.id) {
      return setFeedback({ type: 'err', msg: 'You cannot deactivate your own active Admin account.' });
    }
    const res = await apiFetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !u.active }),
    });
    const data = await res.json();
    if (res.ok) {
      setUsers(data.users);
      setFeedback({ type: 'ok', msg: `User "${u.userId}" is now ${data.user.active ? 'Active' : 'Inactive'}.` });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE7E0] pb-4">
        <div>
          <p className="text-xs font-medium text-[#1E7134]">Administration / Security</p>
          <h1 className="text-2xl font-bold text-[#0D2319]">User Accounts & Access Control</h1>
          <p className="mt-1 text-xs text-[#4B6356]">
            Create User IDs & Passwords for team members and control exactly which ERP modules each user can access.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]"
        >
          <Plus className="h-4 w-4" /> Create New User
        </button>
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

      <div className="rounded-xl border border-[#DDE7E0] bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-[#0D2319]">Registered ERP Users</h2>
        {loading ? (
          <p className="py-8 text-center text-xs text-[#4B6356]">Loading users...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE7E0] bg-[#F7FAF8] text-[#4B6356]">
                  <th className="px-3 py-2.5 font-semibold">User ID</th>
                  <th className="px-3 py-2.5 font-semibold">Full Name</th>
                  <th className="px-3 py-2.5 font-semibold">Role</th>
                  <th className="px-3 py-2.5 font-semibold">Module Access Permissions</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE7E0]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#F7FAF8]">
                    <td className="px-3 py-3 font-mono font-semibold text-[#07432B]">{u.userId}</td>
                    <td className="px-3 py-3 font-medium text-[#0D2319]">{u.fullName}</td>
                    <td className="px-3 py-3">
                      <span className={`font-semibold ${u.role === 'Admin' ? 'text-[#07432B]' : 'text-[#4B6356]'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#4B6356]">
                      {u.role === 'Admin'
                        ? 'Full Access (All Modules)'
                        : u.permissions.map((p) => PERMISSION_META.find((m) => m.key === p)?.label || p).join(' · ') || 'None'}
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      <span className={u.active ? 'text-[#1E7134]' : 'text-[#DC2626]'}>
                        {u.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="inline-flex items-center gap-1 rounded border border-[#DDE7E0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#07432B] hover:bg-[#EAF4EE]"
                        >
                          <KeyRound className="h-3 w-3" /> Edit Access / Password
                        </button>
                        {u.id !== currentUser.id && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            className="inline-flex items-center gap-1 rounded border border-[#DDE7E0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#0D2319] hover:bg-[#F7FAF8]"
                          >
                            {u.active ? <UserX className="h-3 w-3 text-[#DC2626]" /> : <UserCheck className="h-3 w-3 text-[#1E7134]" />}
                            {u.active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-xl border border-[#DDE7E0] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#DDE7E0] px-6 py-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#07432B]" />
                <h3 className="text-base font-semibold text-[#0D2319]">Create User ID & Assign Access</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="rounded p-1 text-[#4B6356] hover:bg-[#EAF4EE]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">User ID *</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={form.userId}
                    onChange={(e) => setForm({ ...form, userId: e.target.value })}
                    placeholder="e.g. sales_rahim"
                    className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    placeholder="e.g. Rahim Uddin"
                    className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Password (min 6 chars) *</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as 'Admin' | 'Staff' })}
                    className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                  >
                    <option value="Staff">Staff (Custom Module Access)</option>
                    <option value="Admin">Admin (Full Access)</option>
                  </select>
                </div>
              </div>

              {form.role === 'Staff' && (
                <div>
                  <label className="mb-2 block text-xs font-semibold text-[#0D2319]">
                    Select Allowed Modules for this User
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PERMISSION_META.map((pm) => (
                      <label
                        key={pm.key}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] p-2.5 text-xs hover:bg-[#EAF4EE]"
                      >
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(pm.key)}
                          onChange={() => toggleCreatePerm(pm.key)}
                          className="mt-0.5 accent-[#07432B]"
                        />
                        <div>
                          <p className="font-semibold text-[#0D2319]">{pm.label}</p>
                          <p className="text-[11px] text-[#4B6356]">{pm.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-[#DDE7E0] pt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg border border-[#DDE7E0] px-4 py-2 text-xs font-medium">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#07432B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Permissions / Password Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-xl border border-[#DDE7E0] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#DDE7E0] px-6 py-4">
              <h3 className="text-base font-semibold text-[#0D2319]">
                Edit Access: {editingUser.userId}
              </h3>
              <button onClick={() => setEditingUser(null)} className="rounded p-1 text-[#4B6356] hover:bg-[#EAF4EE]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Role</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as 'Admin' | 'Staff')}
                    className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                  >
                    <option value="Staff">Staff</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Reset Password (Optional, leave blank to keep current)</label>
                <input
                  type="password"
                  minLength={6}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="New password..."
                  className="w-full rounded-lg border border-[#DDE7E0] px-3 py-2 text-xs"
                />
              </div>

              {editRole === 'Staff' && (
                <div>
                  <label className="mb-2 block text-xs font-semibold text-[#0D2319]">Module Permissions</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PERMISSION_META.map((pm) => (
                      <label
                        key={pm.key}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#DDE7E0] bg-[#F7FAF8] p-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={editPerms.includes(pm.key)}
                          onChange={() =>
                            setEditPerms((prev) =>
                              prev.includes(pm.key) ? prev.filter((x) => x !== pm.key) : [...prev, pm.key]
                            )
                          }
                          className="accent-[#07432B]"
                        />
                        <span className="font-medium text-[#0D2319]">{pm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-[#DDE7E0] pt-4">
                <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg border border-[#DDE7E0] px-4 py-2 text-xs font-medium">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#07432B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]">
                  Update User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
