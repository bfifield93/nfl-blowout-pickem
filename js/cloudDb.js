/**
 * cloudDb.js
 * Multi-Browser & Multi-Computer Real-Time Data Sync Adapter.
 * Integrates BroadcastChannel for instant local multi-browser sync (Chrome, Edge, Incognito)
 * and Firebase Realtime Database for cross-computer remote sync.
 */

const STORAGE_KEY_FIREBASE_CONFIG = 'nfl_pickem_firebase_config_v1';
const BROADCAST_CHANNEL_NAME = 'nfl_blowout_pickem_broadcast_v1';

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
    console.warn('BroadcastChannel not supported in this browser environment:', err);
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

// 2. Firebase Cloud Database Setup
export function getSavedFirebaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIREBASE_CONFIG);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
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
  const config = getSavedFirebaseConfig();

  if (config && config.apiKey && config.databaseURL) {
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { getDatabase, ref, onValue, set, get } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

      firebaseApp = initializeApp(config);
      firebaseDb = getDatabase(firebaseApp);
      isCloudConnected = true;
      console.log('⚡ Connected to Firebase Realtime Database!');
      return { success: true, mode: 'FIREBASE' };
    } catch (err) {
      console.warn('Firebase init error, falling back to BroadcastChannel sync:', err);
    }
  }

  isCloudConnected = false;
  return { success: false, mode: 'BROADCAST_ONLY' };
}

export async function syncLeagueToCloud(leagueData) {
  if (!leagueData || !leagueData.id) return;

  // Broadcast to other local browser windows/tabs immediately
  broadcastDataUpdate('LEAGUE_UPDATE', leagueData);

  const config = getSavedFirebaseConfig();
  if (config && firebaseDb) {
    try {
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const leagueRef = ref(firebaseDb, `leagues/${leagueData.id}`);
      await set(leagueRef, leagueData);
      return { success: true };
    } catch (err) {
      console.error('Error syncing league to Firebase:', err);
    }
  }
}

export async function syncAccountsToCloud(accounts) {
  if (!accounts) return;

  // Broadcast to other local browser windows/tabs immediately
  broadcastDataUpdate('ACCOUNTS_UPDATE', accounts);

  const config = getSavedFirebaseConfig();
  if (config && firebaseDb) {
    try {
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      await set(ref(firebaseDb, 'accounts'), accounts);
      return { success: true };
    } catch (err) {
      console.error('Error syncing accounts to Firebase:', err);
    }
  }
}

export async function subscribeToRealtimeCloudUpdates(onLeaguesUpdate, onAccountsUpdate) {
  const config = getSavedFirebaseConfig();
  if (config && firebaseDb) {
    try {
      const { ref, onValue } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      
      const leaguesRef = ref(firebaseDb, 'leagues');
      onValue(leaguesRef, (snapshot) => {
        if (snapshot.exists() && typeof onLeaguesUpdate === 'function') {
          onLeaguesUpdate(snapshot.val());
        }
      });

      const accountsRef = ref(firebaseDb, 'accounts');
      onValue(accountsRef, (snapshot) => {
        if (snapshot.exists() && typeof onAccountsUpdate === 'function') {
          onAccountsUpdate(snapshot.val());
        }
      });
    } catch (err) {
      console.error('Error subscribing to Firebase:', err);
    }
  }
}

export function isCloudActive() {
  return isCloudConnected && !!firebaseDb;
}
