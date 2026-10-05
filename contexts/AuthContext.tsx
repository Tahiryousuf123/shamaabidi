'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  AuthError,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const token = await u.getIdToken();
          document.cookie = `__session=${token}; path=/; max-age=2592000; SameSite=Lax`;
        } catch (e) {
          console.error('Failed to get auth token:', e);
        }
      } else {
        document.cookie = '__session=; path=/; max-age=0; SameSite=Lax';
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const token = await cred.user.getIdToken();
      document.cookie = `__session=${token}; path=/; max-age=2592000; SameSite=Lax`;
    } catch (err) {
      const authErr = err as AuthError;
      const messages: Record<string, string> = {
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Check your connection.',
      };
      setError(messages[authErr.code] ?? 'Sign-in failed. Please try again.');
      throw err;
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      const token = await cred.user.getIdToken();
      document.cookie = `__session=${token}; path=/; max-age=2592000; SameSite=Lax`;
    } catch (err) {
      const authErr = err as AuthError;
      if (authErr.code === 'auth/popup-closed-by-user' || authErr.code === 'auth/cancelled-popup-request') {
        return; // user cancelled/closed the popup
      }
      setError(authErr.message || 'Google sign-in failed. Please try again.');
      throw err;
    }
  };

  const signOut = async () => {
    document.cookie = '__session=; path=/; max-age=0; SameSite=Lax';
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInWithGoogle, signOut, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
