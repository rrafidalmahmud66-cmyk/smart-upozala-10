// Safeguard against WebKit / iframe IndexedDB connection lost bug (DOMException: Connection to Indexed Database server lost)
try {
  const nullDescriptor = {
    get() { return null; },
    configurable: true
  };
  Object.defineProperty(window, 'indexedDB', nullDescriptor);
  Object.defineProperty(window, 'webkitIndexedDB', nullDescriptor);
  Object.defineProperty(window, 'mozIndexedDB', nullDescriptor);
  Object.defineProperty(window, 'msIndexedDB', nullDescriptor);
} catch (e) {
  try {
    (window as any).indexedDB = null;
  } catch (err) {}
}

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence, browserSessionPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { initializeFirestore, getFirestore, getDocFromServer, onSnapshot, collection, query, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, orderBy, where, addDoc, memoryLocalCache } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfigJSON from '../../firebase-applet-config.json';

// Secure environment-driven Firebase config initialization
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigJSON.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJSON.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJSON.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJSON.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJSON.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigJSON.appId,
};

// Prevent duplicate app initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Using initializeFirestore with offline caching and connection options to handle environment network restrictions
const jsonDbId = firebaseConfigJSON.firestoreDatabaseId;
const envDbId = import.meta.env.VITE_FIREBASE_DATABASE_ID;

let firestoreDbId = '(default)';
if (jsonDbId && jsonDbId !== 'default' && jsonDbId !== '(default)') {
  firestoreDbId = jsonDbId;
} else if (envDbId && envDbId !== 'default' && envDbId !== '(default)') {
  firestoreDbId = envDbId;
}

let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
    localCache: memoryLocalCache()
  } as any, firestoreDbId);
} catch (e) {
  dbInstance = getFirestore(app, firestoreDbId);
}

export const db = dbInstance;

// Initialize Firebase Auth with specific localStorage persistence to avoid iframe IndexedDB issues
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver
  });
} catch (e) {
  try {
    authInstance = getAuth(app);
  } catch (err) {
    authInstance = getAuth();
  }
}

export const auth = authInstance;
export const storage = getStorage(app);

// Connectivity check as mandated by the skill checklist
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase client is currently offline or network settings are restrictive.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Warn/Error: ', JSON.stringify(errInfo));
  
  // Only throw an exception for critical mutation failure checks, allow background reads to fallback gracefully
  if (operationType === OperationType.CREATE || operationType === OperationType.UPDATE || operationType === OperationType.DELETE || operationType === OperationType.WRITE) {
    throw new Error(JSON.stringify(errInfo));
  }
}

// Notification helpers
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return null;
  }
  
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    console.log('Notification permission granted');
    // In a real environment, we would get the FCM token here
    // return getToken(messaging, { vapidKey: '...' });
    return 'mock-fcm-token-' + Math.random().toString(36).substring(7);
  }
  return null;
}

export function onMessageListener(callback: (payload: any) => void) {
  // Mock listener for the preview environment
  console.log('Notification listener initialized (Mock)');
  
  return () => {
    console.log('Notification listener cleaned up');
  };
}
