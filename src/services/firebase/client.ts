import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredConfig = [
  ['VITE_FIREBASE_API_KEY', config.apiKey],
  ['VITE_FIREBASE_AUTH_DOMAIN', config.authDomain],
  ['VITE_FIREBASE_PROJECT_ID', config.projectId],
  ['VITE_FIREBASE_APP_ID', config.appId],
] as const

let cached: { app: ReturnType<typeof getApp>; auth: ReturnType<typeof getAuth>; db: Firestore } | undefined

export function firebaseConfigured(): boolean {
  return requiredConfig.every(([, value]) => typeof value === 'string' && value.trim() !== '')
}

export function getFirebaseServices() {
  if (cached) return cached
  const missing = requiredConfig.filter(([, value]) => typeof value !== 'string' || !value.trim()).map(([key]) => key)
  if (missing.length) throw new Error(`Firebase configuration is missing: ${missing.join(', ')}. Check .env.local and restart the development server.`)
  const app = getApps().length ? getApp() : initializeApp(config)
  let db: Firestore
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch (error) {
    // Firestore may already be initialized by Vite HMR, or IndexedDB may be unavailable.
    console.warn('[ALI AL-FATEEH] Persistent Firestore cache unavailable; using default cache.', error)
    db = getFirestore(app)
  }
  cached = { app, auth: getAuth(app), db }
  return cached
}

export function getFirebaseAuth() {
  if (!firebaseConfigured()) throw new Error('Firebase configuration is incomplete. Add VITE_FIREBASE_* values to .env.local.')
  return getFirebaseServices().auth
}

export function getCurrentActorUid(): string {
  const user = getFirebaseServices().auth.currentUser
  if (!user) throw new Error('Your sign-in session has expired. Sign in again.')
  return user.uid
}
