/**
 * cloudDb.js
 * Multi-Browser & Multi-Computer Real-Time Data Sync Adapter.
 * Integrates BroadcastChannel for instant local multi-browser sync
 * and Firebase Realtime Database (SDK + REST HTTP Fallback) for instant cross-computer sync.
 */

const STORAGE_KEY_FIREBASE_CONFIG = 'nfl_pickem_firebase_config_v1';
const BROADCAST_CHANNEL_NAME = 'nfl_blowout_pickem_broadcast_v1';

// Default User Firebase Realtime Database Configuration
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCmfNbIxHFJGUgpLQp_fuDkzO8LUCyMoQs",
  authDomain: "nfl-blowout-pickem.firebaseapp.com",
  databaseURL: "https://nfl-blowout-pickem-default-rtdb.firebaseio.com",
  projectId: "nfl-blowout-pickem",
  storageBucket: "nfl-blowout-pickem.firebasestorage.app",
  messagingSenderId: "472126067885",
  appId: "1:472126067885:web:e820a1e8decf0bd4466224",
  measurementId: "G-GX0LJCVVFJ"
};

const REST_DATABASE_URL = DEFAULT_FIREBASE_CONFIG.databaseURL;

let firebaseApp = null;
let firebaseDb = null;
let broadcastChannel = null;
let isCloudConnected = false;

// 1. Multi-Browser BroadcastChannel Setup
export function initBroadcastSync(onSyncCallback) {
  try {
    if ('BroadcastChannel' in window) {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        if (event.data && typeof onSyncCallback === 'function') {
          onSyncCallback(event.data);
        }
      };
    }
  } catch (err) {
    console.warn('BroadcastChannel not supported:', err);
  }
}

export function broadcastDataUpdate(type, payload) {
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type, payload, timestamp: Date.now() });
    } catch (err) {
      console.warn('Error broadcasting update:', err);
    }
  }
}

// 2. Saved / Default Firebase Config
export function getSavedFirebaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIREBASE_CONFIG);
    if (!raw) return DEFAULT_FIREBASE_CONFIG;
    return JSON.parse(raw);
  } catch (err) {
    return DEFAULT_FIREBASE_CONFIG;
  }
}

export function saveFirebaseConfig(config) {
  if (!config) {
    localStorage.removeItem(STORAGE_KEY_FIREBASE_CONFIG);
  } else {
    localStorage.setItem(STORAGE_KEY_FIREBASE_CONFIG, JSON.stringify(config));
  }
}

export async function initCloudDatabase() {
  const config = getSavedFirebaseConfig() || DEFAULT_FIREBASE_CONFIG;

  if (config && config.apiKey && config.databaseURL) {
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { getDatabase } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

      firebaseApp = initializeApp(config);
      firebaseDb = getDatabase(firebaseApp);
      isCloudConnected = true;
      console.log('⚡ Connected to Firebase Realtime Database (nfl-blowout-pickem)!');
      return { success: true, mode: 'FIREBASE' };
    } catch (err) {
      console.warn('Firebase SDK init warning:', err);
    }
  }

  isCloudConnected = true;
  return { success: true, mode: 'REST_FALLBACK' };
}

export async function syncLeagueToCloud(leagueData) {
  if (!leagueData || !leagueData.id) return;

  broadcastDataUpdate('LEAGUE_UPDATE', leagueData);

  // 1. Try Firebase SDK
  if (firebaseDb) {
    try {
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      await set(ref(firebaseDb, `leagues/${leagueData.id}`), leagueData);
    } catch (err) {
      console.warn('SDK league sync error, attempting REST fallback:', err);
    }
  }

  // 2. HTTP REST Fallback
  try {
    const dbUrl = getSavedFirebaseConfig()?.databaseURL || REST_DATABASE_URL;
    await fetch(`${dbUrl}/leagues/${leagueData.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leagueData)
    });
    return { success: true };
  } catch (err) {
    console.error('Error in REST syncLeagueToCloud:', err);
  }
}

export async function syncAccountsToCloud(accounts) {
  if (!accounts) return;

  broadcastDataUpdate('ACCOUNTS_UPDATE', accounts);

  // 1. Try Firebase SDK
  if (firebaseDb) {
    try {
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      await set(ref(firebaseDb, 'accounts'), accounts);
    } catch (err) {
      console.warn('SDK accounts sync error, attempting REST fallback:', err);
    }
  }

  // 2. HTTP REST Fallback
  try {
    const dbUrl = getSavedFirebaseConfig()?.databaseURL || REST_DATABASE_URL;
    await fetch(`${dbUrl}/accounts.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accounts)
    });
    return { success: true };
  } catch (err) {
    console.error('Error in REST syncAccountsToCloud:', err);
  }
}

export async function subscribeToRealtimeCloudUpdates(onLeaguesUpdate, onAccountsUpdate) {
  if (firebaseDb) {
    try {
      const { ref, onValue } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      
      onValue(ref(firebaseDb, 'leagues'), (snapshot) => {
        if (snapshot.exists() && typeof onLeaguesUpdate === 'function') {
          onLeaguesUpdate(snapshot.val());
        }
      }, (err) => {
        console.warn('Firebase leagues subscribe notice:', err.message);
      });

      onValue(ref(firebaseDb, 'accounts'), (snapshot) => {
        if (snapshot.exists() && typeof onAccountsUpdate === 'function') {
          onAccountsUpdate(snapshot.val());
        }
      }, (err) => {
        console.warn('Firebase accounts subscribe notice:', err.message);
      });
    } catch (err) {
      console.error('Error subscribing to Firebase:', err);
    }
  }
}

export function isCloudActive() {
  return isCloudConnected;
}

export async function fetchAccountsFromCloud() {
  // 1. Try Firebase SDK
  if (firebaseDb) {
    try {
      const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const snapshot = await get(ref(firebaseDb, 'accounts'));
      if (snapshot.exists()) return snapshot.val();
    } catch (err) {
      console.warn('SDK fetch accounts notice, trying REST fallback:', err);
    }
  }

  // 2. HTTP REST Fallback
  try {
    const dbUrl = getSavedFirebaseConfig()?.databaseURL || REST_DATABASE_URL;
    const res = await fetch(`${dbUrl}/accounts.json`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.error('Error in REST fetchAccountsFromCloud:', err);
  }
  return null;
}

export async function fetchLeaguesFromCloud() {
  // 1. Try Firebase SDK
  if (firebaseDb) {
    try {
      const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const snapshot = await get(ref(firebaseDb, 'leagues'));
      if (snapshot.exists()) return snapshot.val();
    } catch (err) {
      console.warn('SDK fetch leagues notice, trying REST fallback:', err);
    }
  }

  // 2. HTTP REST Fallback
  try {
    const dbUrl = getSavedFirebaseConfig()?.databaseURL || REST_DATABASE_URL;
    const res = await fetch(`${dbUrl}/leagues.json`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.error('Error in REST fetchLeaguesFromCloud:', err);
  }
  return null;
}
