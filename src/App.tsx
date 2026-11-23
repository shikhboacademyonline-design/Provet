import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react';
import { useFirebase } from './contexts/FirebaseContext';
import type { ERPDatabase, ERPUser, PermissionKey } from './types/erp';
import { DateFilterModal, type ReportType } from './components/DateFilterModal';
import { ReportViewerModal } from './components/ReportViewerModal';
import { LoginView } from './components/LoginView';
import { DashboardView, type NavSection } from './components/modules/DashboardView';
import { StockModule } from './components/modules/StockModule';
import { PurchaseModule } from './components/modules/PurchaseModule';
import { SalesModule } from './components/modules/SalesModule';
import { AccountModule } from './components/modules/AccountModule';
import { ReportsModule } from './components/modules/ReportsModule';
import { HRModule } from './components/modules/HRModule';
import { AdminUsersModule } from './components/modules/AdminUsersModule';
import { apiFetch, setAuthToken, setOnUnauthorized } from './utils/api';
import type { Lang } from './i18n/translations';
import { labels } from './i18n/translations';

type AppSection = NavSection | 'admin-users';

const ALL_MODULE_ORDER: PermissionKey[] = ['dashboard', 'stock', 'purchase', 'sales', 'account', 'reports', 'hr'];

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [currentUser, setCurrentUser] = useState<ERPUser | null>(null);
  const [db, setDb] = useState<ERPDatabase | null>(null);
  const [loadingDb, setLoadingDb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [accountsExpanded, setAccountsExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lang, setLang] = useState<Lang>('en');

  // Report Date Filter & Viewer State
  const [pendingReport, setPendingReport] = useState<{ type: ReportType; title: string } | null>(null);
  const [activeReport, setActiveReport] = useState<{
    type: ReportType;
    title: string;
    fromDate: string;
    toDate: string;
  } | null>(null);

  const t = labels[lang];
  const { firebaseUser, syncing, lastSyncedAt, syncError, connectWithGoogle, disconnectFirebase, syncWorkspace } =
    useFirebase();

  useEffect(() => {
    if (!db || !firebaseUser) return;
    const timer = setTimeout(() => {
      syncWorkspace(db).catch((err) => {
        console.error('Firebase background sync error:', err);
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [db, firebaseUser, syncWorkspace]);

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setDb(null);
    setActiveReport(null);
    setPendingReport(null);
    setSetupRequired(false);
    setError(null);
  };

  useEffect(() => {
    setOnUnauthorized(() => {
      setAuthToken(null);
      setCurrentUser(null);
      setDb(null);
    });

    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        setSetupRequired(Boolean(data.setupRequired));
        setAuthChecking(false);
      })
      .catch(() => {
        setError('Unable to reach Provet ERP authentication server.');
        setAuthChecking(false);
      });
  }, []);

  const canAccess = (perm: PermissionKey): boolean => {
    if (!currentUser) return false;
    return currentUser.role === 'Admin' || currentUser.permissions.includes(perm);
  };

  const handleAuthenticated = async (token: string, user: ERPUser) => {
    setAuthToken(token);
    setCurrentUser(user);
    setSetupRequired(false);
    setError(null);
    setLoadingDb(true);

    const firstPermitted: AppSection =
      user.role === 'Admin' || user.permissions.includes('dashboard')
        ? 'dashboard'
        : ALL_MODULE_ORDER.find((p) => user.permissions.includes(p)) || 'dashboard';
    setActiveSection(firstPermitted);

    try {
      const res = await apiFetch('/api/erp/state');
      if (!res.ok) throw new Error('Failed to load ERP database');
      const data: ERPDatabase = await res.json();
      setDb(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Database unavailable');
    } finally {
      setLoadingDb(false);
    }
  };

  const handleOpenReport = (type: ReportType, title: string) => {
    setPendingReport({ type, title });
  };

  const handleConfirmDuration = (type: ReportType, fromDate: string, toDate: string) => {
    if (!pendingReport) return;
    setActiveReport({ type, title: pendingReport.title, fromDate, toDate });
    setPendingReport(null);
  };

  const sectionLabels: Record<AppSection, string> = {
    dashboard: t.dashboard,
    stock: `Accounts / ${t.stock}`,
    purchase: `Accounts / ${t.purchase}`,
    sales: `Accounts / ${t.sales}`,
    account: `Accounts / ${t.account}`,
    reports: `Accounts / ${t.reports}`,
    hr: t.hrModule,
    'admin-users': 'Administration / User & Access Control',
  };

  if (authChecking || loadingDb) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7FAF8]">
        <div className="space-y-3 text-center">
          <img
            src="/assets/aistudio/images__32__e2bc1202.jpeg"
            alt="Provet"
            className="mx-auto h-12 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
          <p className="text-xs font-medium text-[#4B6356]">
            {authChecking ? 'Checking Provet ERP session...' : 'Loading Provet Enterprise ERP...'}
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView setupRequired={setupRequired} onAuthenticated={handleAuthenticated} />;
  }

  if (error || !db) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7FAF8] p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center">
          <h2 className="text-base font-bold text-[#DC2626]">Unable to Connect to ERP Server</h2>
          <p className="mt-1 text-xs text-[#4B6356]">{error || 'Database unavailable'}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={handleLogout}
              className="rounded-lg border border-[#DDE7E0] px-4 py-2 text-xs font-semibold text-[#0D2319]"
            >
              Back to Login
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navigate = (sec: AppSection) => {
    setActiveSection(sec);
    setMobileMenuOpen(false);
  };

  const accountsSubItems = [
    { id: 'stock' as const, label: t.stock, icon: Boxes },
    { id: 'purchase' as const, label: t.purchase, icon: ShoppingBag },
    { id: 'sales' as const, label: t.sales, icon: ShoppingCart },
    { id: 'account' as const, label: t.account, icon: BookOpen },
    { id: 'reports' as const, label: t.reports, icon: BarChart3 },
  ].filter((item) => canAccess(item.id));

  const topNavLinks = [
    { id: 'stock' as const, label: 'Stock' },
    { id: 'purchase' as const, label: 'Purchase' },
    { id: 'sales' as const, label: 'Sales' },
    { id: 'account' as const, label: 'Account' },
    { id: 'hr' as const, label: 'HR' },
  ].filter((link) => canAccess(link.id));

  const primaryCtaTarget: { section: AppSection; label: string } | null = canAccess('sales')
    ? { section: 'sales', label: 'Sales Challan' }
    : currentUser.role === 'Admin'
    ? { section: 'admin-users', label: 'Manage Users' }
    : canAccess('purchase')
    ? { section: 'purchase', label: 'Purchase' }
    : canAccess('stock')
    ? { section: 'stock', label: 'Stock' }
    : canAccess('account')
    ? { section: 'account', label: 'Vouchers' }
    : canAccess('hr')
    ? { section: 'hr', label: 'HR & Payroll' }
    : canAccess('reports')
    ? { section: 'reports', label: 'Reports' }
    : null;

  return (
    <div className="flex min-h-screen bg-[#F7FAF8] text-[#0D2319]">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation (260px) */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-[#DDE7E0] bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Provet Logo Header */}
        <div className="flex h-16 items-center justify-between border-b border-[#DDE7E0] px-5">
          <button
            onClick={() => navigate(canAccess('dashboard') ? 'dashboard' : primaryCtaTarget?.section || 'dashboard')}
            className="flex items-center gap-2.5 text-left"
          >
            <img
              src="/assets/aistudio/images__32__e2bc1202.jpeg"
              alt="Provet"
              className="h-9 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </button>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1 text-[#4B6356] lg:hidden"
            aria-label="Close Sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tree */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
          {canAccess('dashboard') && (
            <button
              onClick={() => navigate('dashboard')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                activeSection === 'dashboard'
                  ? 'bg-[#07432B] text-white'
                  : 'text-[#0D2319] hover:bg-[#EAF4EE] hover:text-[#07432B]'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>{t.dashboard}</span>
            </button>
          )}

          {/* Accounts Module Group */}
          {accountsSubItems.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setAccountsExpanded(!accountsExpanded)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-bold text-[#07432B] hover:bg-[#EAF4EE]/60"
              >
                <span>{t.accountsModule}</span>
                {accountsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>

              {accountsExpanded && (
                <div className="mt-1 space-y-1 pl-2">
                  {accountsSubItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(item.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                          active
                            ? 'bg-[#EAF4EE] font-semibold text-[#07432B]'
                            : 'text-[#4B6356] hover:bg-[#F7FAF8] hover:text-[#0D2319]'
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${active ? 'text-[#07432B]' : 'text-[#4B6356]'}`} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* HR Complete Module */}
          {canAccess('hr') && (
            <div className="pt-2">
              <button
                onClick={() => navigate('hr')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                  activeSection === 'hr'
                    ? 'bg-[#07432B] text-white'
                    : 'text-[#0D2319] hover:bg-[#EAF4EE] hover:text-[#07432B]'
                }`}
              >
                <Users className="h-4 w-4" />
                <span>{t.hrModule}</span>
              </button>
            </div>
          )}

          {/* Admin-only User & Access Control */}
          {currentUser.role === 'Admin' && (
            <div className="border-t border-[#DDE7E0] pt-3">
              <button
                onClick={() => navigate('admin-users')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                  activeSection === 'admin-users'
                    ? 'bg-[#07432B] text-white'
                    : 'text-[#0D2319] hover:bg-[#EAF4EE] hover:text-[#07432B]'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>User & Access Control</span>
              </button>
            </div>
          )}
        </nav>

        {/* Footer Info */}
        <div className="border-t border-[#DDE7E0] px-4 py-3 text-[11px] text-[#4B6356]">
          <p className="font-semibold text-[#07432B]">{db.company.name} Enterprise</p>
          <p className="mt-0.5">Weighted Avg · Double-Entry</p>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: 1-row, 3-zone */}
        <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-8 border-b border-[#DDE7E0] bg-white px-6">
          {/* Zone 1: Brand / Breadcrumb */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-1.5 text-[#0D2319] hover:bg-[#EAF4EE] lg:hidden"
              aria-label="Open Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate font-display text-sm font-bold tracking-tight text-[#07432B] whitespace-nowrap">
              {sectionLabels[activeSection]}
            </span>
          </div>

          {/* Zone 2: Permitted Single-Line Nav Links */}
          <nav className="hidden items-center gap-6 text-xs font-medium text-[#4B6356] md:flex">
            {topNavLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => navigate(link.id)}
                className={`shrink-0 whitespace-nowrap pb-0.5 transition-colors ${
                  activeSection === link.id
                    ? 'border-b-2 border-[#07432B] font-semibold text-[#07432B]'
                    : 'hover:text-[#07432B]'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="shrink-0">
            {primaryCtaTarget ? (
              <button
                onClick={() => navigate(primaryCtaTarget.section)}
                className="shrink-0 whitespace-nowrap rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E7134]"
              >
                {primaryCtaTarget.label}
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="shrink-0 whitespace-nowrap rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E7134]"
              >
                Sign Out
              </button>
            )}
          </div>
        </header>

        {/* Below-header Workspace Utility Strip */}
        <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE7E0] bg-[#F7FAF8] px-6 py-2 text-xs text-[#4B6356]">
          <div className="flex flex-wrap items-center gap-2">
            <span>Provet Accounting & HR</span>
            <span aria-hidden="true">·</span>
            <span>FY 2026</span>
            <span aria-hidden="true">·</span>
            <span>Currency: {db.company.currency}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[#07432B]">
              {currentUser.fullName} · {currentUser.role}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {firebaseUser ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => syncWorkspace(db)}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#1E7134]/30 bg-[#EAF4EE] px-2.5 py-1 text-[11px] font-semibold text-[#07432B] hover:bg-[#DDE7E0]/60 disabled:opacity-60"
                  title={syncError || `Synced to Firestore as ${firebaseUser.email}`}
                >
                  <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing Cloud...' : lastSyncedAt ? `Firebase Synced (${lastSyncedAt})` : 'Sync Firebase'}
                </button>
                <button
                  onClick={disconnectFirebase}
                  className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-[#4B6356] hover:text-[#DC2626]"
                  title="Disconnect Firebase Google session"
                >
                  <CloudOff className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={connectWithGoogle}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#07432B]/25 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#07432B] hover:bg-[#EAF4EE]"
              >
                <Cloud className="h-3.5 w-3.5 text-[#1E7134]" />
                Connect Firebase Cloud
              </button>
            )}
            <button
              onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
              className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-[#07432B] hover:underline"
            >
              <Globe className="h-3.5 w-3.5" />
              {lang === 'en' ? 'বাংলায় দেখুন' : 'Switch to English'}
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-[#DC2626] hover:underline"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
        {syncError && (
          <div className="no-print border-b border-red-200 bg-red-50 px-6 py-1.5 text-xs text-[#DC2626]">
            Firebase Sync Notice: {syncError}
          </div>
        )}

        {/* Main Viewport */}
        <main className={`mx-auto w-full max-w-[1440px] flex-1 p-6 ${activeReport ? 'no-print' : ''}`}>
          {activeSection === 'dashboard' && canAccess('dashboard') && (
            <DashboardView db={db} canAccess={canAccess} onNavigate={navigate} onOpenReport={handleOpenReport} />
          )}
          {activeSection === 'stock' && canAccess('stock') && (
            <StockModule db={db} lang={lang} onRefresh={setDb} onOpenReport={handleOpenReport} />
          )}
          {activeSection === 'purchase' && canAccess('purchase') && (
            <PurchaseModule db={db} lang={lang} onRefresh={setDb} onOpenReport={handleOpenReport} />
          )}
          {activeSection === 'sales' && canAccess('sales') && (
            <SalesModule db={db} lang={lang} onRefresh={setDb} onOpenReport={handleOpenReport} />
          )}
          {activeSection === 'account' && canAccess('account') && (
            <AccountModule db={db} lang={lang} onRefresh={setDb} onOpenReport={handleOpenReport} />
          )}
          {activeSection === 'reports' && canAccess('reports') && (
            <ReportsModule onOpenReport={handleOpenReport} />
          )}
          {activeSection === 'hr' && canAccess('hr') && (
            <HRModule db={db} onRefresh={setDb} onOpenReport={handleOpenReport} />
          )}
          {activeSection === 'admin-users' && currentUser.role === 'Admin' && (
            <AdminUsersModule currentUser={currentUser} />
          )}
          {((activeSection !== 'admin-users' && !canAccess(activeSection)) ||
            (activeSection === 'admin-users' && currentUser.role !== 'Admin')) && (
            <div className="rounded-xl border border-[#DDE7E0] bg-white p-8 text-center">
              <h2 className="text-base font-bold text-[#0D2319]">Access Restricted</h2>
              <p className="mt-1 text-xs text-[#4B6356]">
                Your account does not have permission to open this module. Contact your Provet Administrator.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Universal Date Duration Filter Popup */}
      <DateFilterModal
        reportType={pendingReport?.type || null}
        reportTitle={pendingReport?.title || ''}
        lang={lang}
        onClose={() => setPendingReport(null)}
        onConfirm={handleConfirmDuration}
      />

      {/* Universal Formal Report Viewer + Print / PDF / Excel */}
      <ReportViewerModal
        db={db}
        report={activeReport}
        lang={lang}
        onClose={() => setActiveReport(null)}
        onChangeDuration={(type, title) => {
          setActiveReport(null);
          setPendingReport({ type, title });
        }}
      />
    </div>
  );
}
