import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Firebase configuration
const firebaseConfig = {
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://hospital-token-system-17571-default-rtdb.firebaseio.com"
};

// Initialize Firebase Admin SDK
let db = null;
let isConnected = false;

try {
  let credential;

  // Method 1: Use environment variables (preferred for deployment)
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    console.log('[Firebase] Using environment variables for authentication');

    // Handle private key formatting - Render and other platforms may handle \n differently
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    // If the key contains literal \n (as string), replace with actual newlines
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    // If the key doesn't have actual newlines yet (came as single line), add them
    if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN')) {
      // The key might be base64 encoded or mangled - try to reconstruct
      console.log('[Firebase] Warning: Private key may be malformed, attempting to use as-is');
    }

    console.log('[Firebase] Private key length:', privateKey.length);
    console.log('[Firebase] Private key starts with:', privateKey.substring(0, 30));

    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    });
  }
  // Method 2: Fall back to service-account.json file (for local development)
  else {
    const serviceAccountPath = join(__dirname, '../../service-account.json');

    if (!existsSync(serviceAccountPath)) {
      console.error('\n============================================');
      console.error('  FIREBASE CREDENTIALS NOT FOUND');
      console.error('============================================');
      console.error('\nOption 1: Use environment variables (recommended):');
      console.error('  Add these to your .env file:');
      console.error('  - FIREBASE_PROJECT_ID');
      console.error('  - FIREBASE_PRIVATE_KEY');
      console.error('  - FIREBASE_CLIENT_EMAIL');
      console.error('  - FIREBASE_DATABASE_URL');
      console.error('');
      console.error('Option 2: Use service account file:');
      console.error('  1. Go to Firebase Console:');
      console.error('     https://console.firebase.google.com/project/hospital-token-system-17571/settings/serviceaccounts/adminsdk');
      console.error('  2. Click "Generate new private key"');
      console.error('  3. Save as: backend/service-account.json');
      console.error('============================================\n');
      process.exit(1);
    }

    console.log('[Firebase] Using service-account.json for authentication');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    credential = admin.credential.cert(serviceAccount);
  }

  admin.initializeApp({
    credential,
    databaseURL: firebaseConfig.databaseURL
  });

  db = admin.database();
  isConnected = true;
  console.log('[Firebase] ✓ Firebase Admin SDK initialized');
  console.log('[Firebase] ✓ Database URL:', firebaseConfig.databaseURL);

  // Test connection asynchronously (non-blocking)
  db.ref('.info/connected').once('value')
    .then(() => console.log('[Firebase] ✓ Database connection verified'))
    .catch(err => console.error('[Firebase] ✗ Database connection test failed:', err.message));
} catch (error) {
  console.error('\n============================================');
  console.error('  FIREBASE CONNECTION FAILED');
  console.error('============================================');
  console.error('\nError:', error.message);
  console.error('\nPlease check:');
  console.error('  - Your .env file has correct Firebase credentials');
  console.error('  - OR service-account.json is valid JSON');
  console.error('  - The service account has database access');
  console.error('  - Firebase Realtime Database is enabled');
  console.error('============================================\n');
  process.exit(1);
}

export { db, admin, firebaseConfig, isConnected };
