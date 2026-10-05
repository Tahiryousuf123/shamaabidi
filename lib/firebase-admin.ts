import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function initAdmin(): App {
  if (getApps().length > 0) return getApps()[0];

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!privateKey) throw new Error('FIREBASE_PRIVATE_KEY env variable is not set');

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

const adminApp = initAdmin();
export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
