const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
require('./config'); // Ensure .env.local is loaded

function initFirebase() {
  if (admin.apps.length) {
    return admin.firestore();
  }

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    try {
      const sa = JSON.parse(saJson);
      admin.initializeApp({
        credential: admin.credential.cert(sa),
      });
      return admin.firestore();
    } catch (e) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON, falling back to individual vars:', e.message);
    }
  }

  let key = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: (process.env.FIREBASE_PROJECT_ID || 'shamaabidi-3ddf8').trim(),
      clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
      privateKey: key,
    }),
  });

  return admin.firestore();
}

const db = initFirebase();
const FieldValue = admin.firestore.FieldValue;

function getCvAttachment() {
  const pdfPath = path.resolve(__dirname, '../../public/cv/Dr_Shama_Abidi_Academic_CV.pdf');
  if (fs.existsSync(pdfPath)) {
    return {
      filename: 'Dr_Shama_Abidi_Academic_CV.pdf',
      content: fs.readFileSync(pdfPath),
      contentType: 'application/pdf',
    };
  }
  return null;
}

module.exports = {
  admin,
  db,
  FieldValue,
  getCvAttachment,
};
