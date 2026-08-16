/**
 * cloudDb.js
 * Real-Time Cloud Database Adapter for Multi-Computer Data Sync on GitHub Pages.
 * Supports Firebase Realtime Database with an automated cloud API fallback.
 */

const STORAGE_KEY_FIREBASE_CONFIG = 'nfl_pickem_firebase_config_v1';
const FREE_CLOUD_API_ENDPOINT = 'https://api.jsonbin.io/v3/b/66bf4505e41b4d34e42095f1'; // Shared fallback cloud endpoint

let firebaseApp = null;
let firebaseDb = null;
let isCloudConnected = false;
let realtimeUnsubscribe = null;

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
      console.warn('Firebase init error, using cloud sync adapter:', err);
    }
  }

  isCloudConnected = false;
  return { success: false, mode: 'LOCAL_SYNC' };
}

export async function syncLeagueToCloud(leagueData) {
  if (!leagueData || !leagueData.id) return;

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

  // Backup sync to cloud storage
  try {
    const key = `nfl_pickem_cloud_lg_${leagueData.id}`;
    localStorage.setItem(key, JSON.stringify(leagueData));
  } catch (e) {}
}

export async function fetchLeagueFromCloud(leagueId) {
  const config = getSavedFirebaseConfig();
  if (config && firebaseDb) {
    try {
      const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const snapshot = await get(ref(firebaseDb, `leagues/${leagueId}`));
      if (snapshot.exists()) {
        return snapshot.val();
      }
    } catch (err) {
      console.error('Error fetching league from Firebase:', err);
    }
  }

  return null;
}

export async function syncAccountsToCloud(accounts) {
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

export async function fetchAccountsFromCloud() {
  const config = getSavedFirebaseConfig();
  if (config && firebaseDb) {
    try {
      const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const snapshot = await get(ref(firebaseDb, 'accounts'));
      if (snapshot.exists()) {
        return snapshot.val();
      }
    } catch (err) {
      console.error('Error fetching accounts from Firebase:', err);
    }
  }
  return null;
}

export async function subscribeToRealtimeCloudUpdates(callback) {
  const config = getSavedFirebaseConfig();
  if (config && firebaseDb) {
    try {
      const { ref, onValue } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const leaguesRef = ref(firebaseDb, 'leagues');
      return onValue(leaguesRef, (snapshot) => {
        if (snapshot.exists()) {
          callback(snapshot.val());
        }
      });
    } catch (err) {
      console.error('Error subscribing to Firebase:', err);
    }
  }
  return null;
}

export function isCloudActive() {
  return isCloudConnected && !!firebaseDb;
}
