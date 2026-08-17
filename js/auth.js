/**
 * auth.js
 * User Authentication, Password Hashing, Session Management & Admin Control Engine.
 */

const STORAGE_KEY_ACCOUNTS = 'nfl_pickem_accounts_v2';
const STORAGE_KEY_SESSION = 'nfl_pickem_session_v2';
const FIREBASE_REST_ACCOUNTS_URL = 'https://nfl-blowout-pickem-default-rtdb.firebaseio.com/accounts.json';

// Helper: Hash password string using SHA-256 (with fallback for HTTP non-secure contexts)
async function hashPassword(password) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback below
    }
  }
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'h_' + Math.abs(hash).toString(16);
}

const DEFAULT_ACCOUNTS = [
  {
    id: 'u_master',
    username: 'master',
    name: 'Master Admin',
    avatar: '👑',
    role: 'ADMIN',
    passwordHash: 'b5e8184907709e73b274e23a7502d6b6ccdd3ce387d6d96881fb96852fa19578' // 'nbpisdynamite25'
  },
  {
    id: 'p_admin',
    username: 'admin',
    name: 'Commissioner Admin',
    avatar: '👑',
    role: 'ADMIN',
    passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' // 'admin123'
  },
  {
    id: 'p1',
    username: 'player1',
    name: 'Player 1',
    avatar: '⚡',
    role: 'USER',
    passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f' // 'pass123'
  },
  {
    id: 'p2',
    username: 'player2',
    name: 'Player 2',
    avatar: '🔥',
    role: 'USER',
    passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f' // 'pass123'
  }
];

export function getAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
    let accounts = raw ? JSON.parse(raw) : DEFAULT_ACCOUNTS;

    // Guarantee master admin account exists
    if (!accounts.some(a => a.username === 'master')) {
      accounts.unshift(DEFAULT_ACCOUNTS[0]);
      localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
    }
    return accounts;
  } catch (err) {
    console.error('Error reading accounts:', err);
    return DEFAULT_ACCOUNTS;
  }
}

export function saveAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accountsUpdated', { detail: accounts }));
    }
  } catch (err) {
    console.error('Error saving accounts:', err);
  }
}

export function mergeAccountsFromSync(incomingAccounts) {
  if (!incomingAccounts) return;
  const arr = Array.isArray(incomingAccounts) ? incomingAccounts : Object.values(incomingAccounts);
  if (!arr || arr.length === 0) return;

  // Guarantee master admin account is preserved
  if (!arr.some(a => a.username === 'master')) {
    const masterAcc = DEFAULT_ACCOUNTS.find(a => a.username === 'master');
    if (masterAcc) arr.unshift(masterAcc);
  }

  localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(arr));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('accountsUpdated', { detail: arr }));
  }
}

export function getCurrentSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function setCurrentSession(sessionData) {
  try {
    if (sessionData) {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(sessionData));
    } else {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    }
  } catch (err) {
    console.error('Error updating session:', err);
  }
}

export function getCurrentUser() {
  const session = getCurrentSession();
  if (!session) return null;
  const accounts = getAccounts();
  const found = accounts.find(a => (a.id === session.userId || a.username === session.username));
  return found || session;
}

export function isAdmin() {
  const user = getCurrentUser();
  return user && (user.role === 'ADMIN' || user.username === 'master');
}

export async function loginUser(username, password) {
  const cleanUsername = username.trim().toLowerCase();

  // Direct REST check from Firebase Realtime Database
  try {
    const cloudRes = await fetch(FIREBASE_REST_ACCOUNTS_URL);
    if (cloudRes.ok) {
      const cloudAccounts = await cloudRes.json();
      if (cloudAccounts) {
        mergeAccountsFromSync(cloudAccounts);
      }
    }
  } catch (err) {
    console.warn('Direct REST cloud fetch notice:', err);
  }

  const accounts = getAccounts();
  const account = accounts.find(a => a.username.toLowerCase() === cleanUsername);

  if (!account) {
    return { success: false, error: 'User account not found.' };
  }

  const inputHash = await hashPassword(password);
  if (account.passwordHash !== inputHash) {
    return { success: false, error: 'Incorrect password.' };
  }

  const session = {
    userId: account.id,
    username: account.username,
    name: account.name,
    avatar: account.avatar,
    role: account.role,
    loggedInAt: Date.now()
  };

  setCurrentSession(session);
  return { success: true, user: session };
}

export async function registerUser(name, username, password, avatar = '🏈', role = 'USER') {
  const cleanUsername = username.trim().toLowerCase();
  if (!cleanUsername || cleanUsername.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters.' };
  }
  if (!password || password.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters.' };
  }

  // Pre-sync check to ensure fresh account list from cloud before checking username availability
  try {
    const cloudRes = await fetch(FIREBASE_REST_ACCOUNTS_URL);
    if (cloudRes.ok) {
      const cloudAccounts = await cloudRes.json();
      if (cloudAccounts) {
        mergeAccountsFromSync(cloudAccounts);
      }
    }
  } catch (err) {
    console.warn('Direct REST cloud fetch notice:', err);
  }

  const accounts = getAccounts();
  if (accounts.some(a => a.username.toLowerCase() === cleanUsername)) {
    return { success: false, error: `Username "${cleanUsername}" is already registered. Please choose another.` };
  }

  const passwordHash = await hashPassword(password);
  const newAccount = {
    id: `u_${Date.now()}`,
    username: cleanUsername,
    name: name.trim() || cleanUsername,
    avatar: avatar || '🏈',
    role: role,
    passwordHash: passwordHash,
    createdAt: Date.now()
  };

  accounts.push(newAccount);
  saveAccounts(accounts);

  // Direct REST PUT to Firebase Realtime Database
  try {
    await fetch(FIREBASE_REST_ACCOUNTS_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accounts)
    });
  } catch (err) {
    console.error('Direct REST register sync error:', err);
  }

  const session = {
    userId: newAccount.id,
    username: newAccount.username,
    name: newAccount.name,
    avatar: newAccount.avatar,
    role: newAccount.role,
    loggedInAt: Date.now()
  };

  setCurrentSession(session);
  return { success: true, user: session };
}

export function logoutUser() {
  setCurrentSession(null);
  return true;
}

export async function adminUpdateUser(userId, updates) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin privileges required.' };
  }

  const accounts = getAccounts();
  const account = accounts.find(a => a.id === userId || a.username === userId);
  if (!account) {
    return { success: false, error: 'User account not found.' };
  }

  if (updates.password) {
    account.passwordHash = await hashPassword(updates.password);
  }
  if (updates.role) {
    account.role = updates.role;
  }
  if (updates.name) {
    account.name = updates.name.trim();
  }

  saveAccounts(accounts);

  // Direct REST PUT to Firebase Database
  try {
    await fetch(FIREBASE_REST_ACCOUNTS_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accounts)
    });
  } catch (err) {
    console.error('Direct REST update user error:', err);
  }

  return { success: true, account };
}

export async function adminDeleteUser(userId) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin privileges required.' };
  }

  let accounts = getAccounts();
  const target = accounts.find(a => a.id === userId || a.userId === userId || a.username === userId);
  if (!target) {
    return { success: false, error: 'User account not found.' };
  }

  if (target.username === 'master') {
    return { success: false, error: 'The Master Admin account cannot be deleted.' };
  }

  const targetId = target.id || target.userId;
  accounts = accounts.filter(a => a.id !== targetId && a.username !== target.username);
  
  saveAccounts(accounts);

  // Direct REST PUT to Firebase Realtime Database
  try {
    await fetch(FIREBASE_REST_ACCOUNTS_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accounts)
    });
  } catch (err) {
    console.error('Direct REST delete user cloud error:', err);
  }

  const session = getCurrentSession();
  if (session && (session.userId === targetId || session.username === target.username)) {
    logoutUser();
  }

  return { success: true, deletedUsername: target.username };
}
