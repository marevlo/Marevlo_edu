// Firebase SDK is lazy-loaded on first use (not at app startup).
//
// The SDK is ~300 KB gzipped; loading it eagerly delayed first paint by
// ~300 ms on cold caches. Now it only downloads when a user actually
// needs it (auth, firestore, etc).

const FIREBASE_CONFIG = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Shared app instance — ensures initializeApp is only called once
let _appPromise = null;
async function ensureApp() {
    if (_appPromise) return _appPromise;
    _appPromise = import('firebase/app').then(({ initializeApp, getApps, getApp }) => {
        return getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    });
    return _appPromise;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
let _authCache = null;
export async function getFirebaseAuth() {
    if (_authCache) return _authCache;
    const [app, { getAuth, GoogleAuthProvider, signInWithPopup }] = await Promise.all([
        ensureApp(),
        import('firebase/auth'),
    ]);
    _authCache = { auth: getAuth(app), googleProvider: new GoogleAuthProvider(), signInWithPopup };
    return _authCache;
}

// ── Firestore ─────────────────────────────────────────────────────────────────
let _firestoreCache = null;
export async function getFirebaseFirestore() {
    if (_firestoreCache) return _firestoreCache;
    const [app, fs] = await Promise.all([
        ensureApp(),
        import('firebase/firestore'),
    ]);
    _firestoreCache = {
        db:              fs.getFirestore(app),
        collection:      fs.collection,
        addDoc:          fs.addDoc,
        query:           fs.query,
        orderBy:         fs.orderBy,
        onSnapshot:      fs.onSnapshot,
        serverTimestamp: fs.serverTimestamp,
        doc:             fs.doc,
        setDoc:          fs.setDoc,
        getDocs:         fs.getDocs,
        limit:           fs.limit,
    };
    return _firestoreCache;
}
