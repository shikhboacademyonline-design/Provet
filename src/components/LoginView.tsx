import React, { useState } from 'react';
import { Cloud, Eye, EyeOff, KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { useFirebase } from '../contexts/FirebaseContext';
import type { ERPUser } from '../types/erp';

interface LoginViewProps {
  setupRequired: boolean;
  onAuthenticated: (token: string, user: ERPUser) => void;
  onFirebaseAuthenticated: (fbUser: FirebaseUser) => Promise<void>;
}

async function fetchAuthWithRetry(
  url: string,
  body: Record<string, unknown>,
  retries = 3
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      if (res.status === 404) {
        return {
          ok: false,
          status: 404,
          data: {
            error:
              'Password server route returned 404 on this host. Please sign in using Firebase Cloud (Google) below.',
          },
        };
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        return {
          ok: false,
          status: res.status,
          data: { error: `Server returned unexpected status (${res.status}). Please retry or use Google Sign-In.` },
        };
      }
      const data = (await res.json()) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 700));
      }
    }
  }
  throw lastErr || new Error('Network error');
}

export const LoginView: React.FC<LoginViewProps> = ({
  setupRequired,
  onAuthenticated,
  onFirebaseAuthenticated,
}) => {
  const { firebaseUser, connectWithGoogle, disconnectFirebase } = useFirebase();
  const [userId, setUserId] = useState(setupRequired ? 'admin' : '');
  const [fullName, setFullName] = useState('System Administrator');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (setupRequired) {
      if (password.length < 6) {
        return setError('Password must be at least 6 characters.');
      }
      if (password !== confirmPassword) {
        return setError('Password and Confirm Password do not match.');
      }
      setSubmitting(true);
      try {
        const { ok, data } = await fetchAuthWithRetry('/api/auth/setup-admin', {
          userId,
          fullName,
          password,
        });
        if (!ok) {
          setError(String(data.error || 'Admin setup failed.'));
          setSubmitting(false);
          return;
        }
        onAuthenticated(String(data.token), data.user as ERPUser);
      } catch {
        setError('Unable to reach server. Use Sign in with Google (Firebase Cloud) below or retry.');
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const { ok, data } = await fetchAuthWithRetry('/api/auth/login', {
        userId,
        password,
      });
      if (!ok) {
        setError(String(data.error || 'Invalid credentials.'));
        setSubmitting(false);
        return;
      }
      onAuthenticated(String(data.token), data.user as ERPUser);
    } catch {
      setError('Unable to reach server. Use Sign in with Google (Firebase Cloud) below or retry.');
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setCloudLoading(true);
    try {
      const fbUser = firebaseUser || (await connectWithGoogle());
      if (!fbUser) {
        setCloudLoading(false);
        return;
      }
      await onFirebaseAuthenticated(fbUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Firebase Google sign-in failed.');
      setCloudLoading(false);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    setError(null);
    setCloudLoading(true);
    try {
      await disconnectFirebase();
      const fbUser = await connectWithGoogle();
      if (!fbUser) {
        setCloudLoading(false);
        return;
      }
      await onFirebaseAuthenticated(fbUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Firebase Google sign-in failed.');
      setCloudLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7FAF8] p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#DDE7E0] bg-white shadow-xl">
        {/* Provet Brand Header */}
        <div className="border-b border-[#DDE7E0] bg-[#07432B] px-8 py-6 text-white">
          <div className="flex items-center gap-3.5">
            <div className="rounded-lg bg-white p-1.5">
              <img
                src="/assets/aistudio/images__32__e2bc1202.jpeg"
                alt="Provet"
                className="h-9 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight">Provet Enterprise ERP</h1>
              <p className="text-xs text-white/80">
                {setupRequired ? 'First-Run Administrator Setup' : 'Accounts, Inventory & HR Portal'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {setupRequired ? (
              <div className="rounded-lg border border-[#1E7134]/25 bg-[#EAF4EE] p-3 text-xs text-[#07432B]">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>Create Initial Admin Credentials</span>
                </div>
                <p className="mt-1 text-[11px] text-[#4B6356]">
                  Set up your primary Administrator User ID and Password to unlock the ERP and manage staff access.
                </p>
              </div>
            ) : (
              <div>
                <h2 className="text-base font-bold text-[#0D2319]">Sign in to continue</h2>
                <p className="mt-0.5 text-xs text-[#4B6356]">
                  Enter your User ID & Password, or connect directly with Firebase Cloud.
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-[#DC2626]">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#0D2319]">User ID</label>
              <div className="relative">
                <User className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#4B6356]" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g. admin or accounts01"
                  className="w-full rounded-lg border border-[#DDE7E0] bg-white py-2 pr-3 pl-9 text-sm text-[#0D2319] focus:border-[#07432B] focus:outline-none"
                />
              </div>
            </div>

            {setupRequired && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#0D2319]">Administrator Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-[#DDE7E0] bg-white px-3 py-2 text-sm text-[#0D2319] focus:border-[#07432B] focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#0D2319]">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#4B6356]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-lg border border-[#DDE7E0] bg-white py-2 pr-10 pl-9 text-sm text-[#0D2319] focus:border-[#07432B] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute top-2 right-2.5 rounded p-1 text-[#4B6356] hover:text-[#07432B]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {setupRequired && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#0D2319]">Confirm Password</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#4B6356]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full rounded-lg border border-[#DDE7E0] bg-white py-2 pr-3 pl-9 text-sm text-[#0D2319] focus:border-[#07432B] focus:outline-none"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || cloudLoading}
              className="w-full rounded-lg bg-[#07432B] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1E7134] disabled:opacity-60"
            >
              {submitting
                ? 'Verifying...'
                : setupRequired
                ? 'Create Admin & Enter ERP'
                : 'Login to Provet ERP'}
            </button>
          </form>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-[#DDE7E0]" />
            <span className="mx-3 shrink text-[11px] font-semibold uppercase tracking-wider text-[#4B6356]">
              Or Cloud Access
            </span>
            <div className="flex-grow border-t border-[#DDE7E0]" />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting || cloudLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#1E7134]/40 bg-[#EAF4EE] px-4 py-2.5 text-xs font-semibold text-[#07432B] transition-colors hover:bg-[#DDE7E0]/70 disabled:opacity-60"
            >
              <Cloud className="h-4 w-4 text-[#1E7134]" />
              {cloudLoading
                ? 'Connecting Firebase Cloud...'
                : firebaseUser
                ? `Continue as ${firebaseUser.email} (Firebase Cloud)`
                : 'Sign in with Google (Firebase Cloud)'}
            </button>
            {firebaseUser && (
              <button
                type="button"
                onClick={handleSwitchGoogleAccount}
                disabled={submitting || cloudLoading}
                className="w-full text-center text-[11px] font-medium text-[#4B6356] hover:text-[#07432B] hover:underline"
              >
                Use a different Google account
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
