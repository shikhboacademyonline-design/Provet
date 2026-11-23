import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  OperationType,
  WORKSPACE_ID,
  firebaseAuth,
  firestoreDb,
  googleProvider,
  handleFirestoreError,
  syncErpWorkspaceToFirestore,
  testConnection,
} from '../firebase';
import type { ERPDatabase } from '../types/erp';

interface FirebaseContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  connectionStatus: 'checking' | 'online' | 'offline';
  syncing: boolean;
  lastSyncedAt: string | null;
  syncedRecords: number | null;
  syncError: string | null;
  connectWithGoogle: () => Promise<User | null>;
  disconnectFirebase: () => Promise<void>;
  syncWorkspace: (erpDb: ERPDatabase) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncedRecords, setSyncedRecords] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    testConnection().then((status) => {
      if (mounted) setConnectionStatus(status);
    });

    const unsubAuth = onAuthStateChanged(firebaseAuth, (user) => {
      if (!mounted) return;
      setFirebaseUser(user);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      unsubAuth();
    };
  }, []);

  // Attach workspace listener only when Firebase Auth is ready and user is signed in
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const wsPath = `erp_workspaces/${WORKSPACE_ID}`;
    const wsRef = doc(firestoreDb, 'erp_workspaces', WORKSPACE_ID);

    const unsubSnap = onSnapshot(
      wsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.recordCount === 'number') {
            setSyncedRecords(data.recordCount);
          }
          setSyncError(null);
        }
      },
      (err) => {
        setSyncError(err.message);
        handleFirestoreError(err, OperationType.GET, wsPath);
      }
    );

    return () => unsubSnap();
  }, [authReady, firebaseUser]);

  const connectWithGoogle = useCallback(async (): Promise<User | null> => {
    setSyncError(null);
    try {
      const cred = await signInWithPopup(firebaseAuth, googleProvider);
      return cred.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Firebase Google sign-in failed';
      if (msg.includes('unauthorized-domain')) {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        const friendly = `Domain "${domain}" is not yet authorized in Firebase Console -> Authentication -> Settings -> Authorized domains.`;
        setSyncError(friendly);
        throw new Error(friendly);
      }
      setSyncError(msg);
      throw err instanceof Error ? err : new Error(msg);
    }
  }, []);

  const disconnectFirebase = useCallback(async () => {
    setSyncError(null);
    await signOut(firebaseAuth);
    setLastSyncedAt(null);
  }, []);

  const syncWorkspace = useCallback(async (erpDb: ERPDatabase) => {
    if (!firebaseAuth.currentUser) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await syncErpWorkspaceToFirestore(erpDb);
      setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setSyncedRecords(res.syncedCount);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Firestore sync failed');
      throw err;
    } finally {
      setSyncing(false);
    }
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        firebaseUser,
        authReady,
        connectionStatus,
        syncing,
        lastSyncedAt,
        syncedRecords,
        syncError,
        connectWithGoogle,
        disconnectFirebase,
        syncWorkspace,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) throw new Error('useFirebase must be used inside FirebaseProvider');
  return ctx;
}
