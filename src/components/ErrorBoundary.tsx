import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed && parsed.error) {
          friendlyMessage = `Firestore ${parsed.operationType || 'operation'} failed on ${parsed.path || 'database'}: ${parsed.error}`;
        }
      } catch {
        // Plain text error
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F7FAF8] p-6">
          <div className="w-full max-w-md rounded-xl border border-[#DDE7E0] bg-white p-6 text-center shadow-lg">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-[#DC2626]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold text-[#0D2319]">Provet ERP Runtime Notice</h2>
            <p className="mt-2 break-words text-xs text-[#4B6356]">{friendlyMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#07432B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E7134]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
