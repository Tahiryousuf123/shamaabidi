import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let _app: App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

export function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === '[DEFAULT]') || getApps()[0];
  if (existing) return existing;
  if (_app) return _app;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!privateKey) {
    const fallback = getApps().find((a) => a.name === 'fallback-build-app');
    if (fallback) return fallback;
    try {
      _app = initializeApp(
        {
          projectId: process.env.FIREBASE_PROJECT_ID || 'shamaabidi-3ddf8',
        },
        'fallback-build-app'
      );
      return _app;
    } catch {
      return getApps()[0];
    }
  }

  _app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'shamaabidi-3ddf8',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
  return _app;
}

export function getAdminDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getAdminApp());
  return _db;
}

export function getAdminAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getAdminApp());
  return _auth;
}

// Proxies so existing code `adminDb.collection(...)` works seamlessly everywhere
export const adminDb = new Proxy({} as Firestore, {
  get(_, prop) {
    const db = getAdminDb();
    const val = (db as any)[prop];
    return typeof val === 'function' ? val.bind(db) : val;
  },
});

export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    const auth = getAdminAuth();
    const val = (auth as any)[prop];
    return typeof val === 'function' ? val.bind(auth) : val;
  },
});
