/**
 * auth.js
 * User Authentication, Password Hashing, Session Management & Admin Control Engine.
 */

const STORAGE_KEY_ACCOUNTS = 'nfl_pickem_accounts_v2';
const STORAGE_KEY_SESSION = 'nfl_pickem_session_v2';

// Helper: Hash password string using SHA-256
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const DEFAULT_ACCOUNTS = [
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
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(DEFAULT_ACCOUNTS));
      return DEFAULT_ACCOUNTS;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading accounts:', err);
    return DEFAULT_ACCOUNTS;
  }
}

import { syncAccountsToCloud } from './cloudDb.js';

export function saveAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
    syncAccountsToCloud(accounts);
  } catch (err) {
    console.error('Error saving accounts:', err);
  }
}

export function mergeAccountsFromSync(incomingAccounts) {
  if (!incomingAccounts || !Array.isArray(incomingAccounts)) return;
  const currentAccounts = getAccounts();

  incomingAccounts.forEach(inc => {
    const existingIdx = currentAccounts.findIndex(a => a.id === inc.id || a.username.toLowerCase() === inc.username.toLowerCase());
    if (existingIdx >= 0) {
      currentAccounts[existingIdx] = { ...currentAccounts[existingIdx], ...inc };
    } else {
      currentAccounts.push(inc);
    }
  });

  try {
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(currentAccounts));
  } catch (err) {
    console.error('Error saving merged accounts:', err);
  }
}

export function getCurrentSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function setCurrentSession(sessionData) {
  if (!sessionData) {
    localStorage.removeItem(STORAGE_KEY_SESSION);
  } else {
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(sessionData));
  }
}

export async function loginUser(username, password) {
  const cleanUsername = username.trim().toLowerCase();
  let accounts = getAccounts();
  let account = accounts.find(a => a.username.toLowerCase() === cleanUsername);

  if (!account) {
    const cloudAccounts = await fetchAccountsFromCloud();
    if (cloudAccounts && Array.isArray(cloudAccounts)) {
      mergeAccountsFromSync(cloudAccounts);
      accounts = getAccounts();
      account = accounts.find(a => a.username.toLowerCase() === cleanUsername);
    }
  }

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

  const accounts = getAccounts();
  if (accounts.some(a => a.username.toLowerCase() === cleanUsername)) {
    return { success: false, error: 'Username is already taken.' };
  }

  const passwordHash = await hashPassword(password);
  const newAccount = {
    id: `u_${Date.now()}`,
    username: cleanUsername,
    name: name.trim() || cleanUsername,
    avatar,
    role,
    passwordHash
  };

  accounts.push(newAccount);
  saveAccounts(accounts);

  // Auto sign-in
  const session = {
    userId: newAccount.id,
    username: newAccount.username,
    name: newAccount.name,
    avatar: newAccount.avatar,
    role: newAccount.role,
    loggedInAt: Date.now()
  };
  setCurrentSession(session);

  return { success: true, user: session, account: newAccount };
}

export function logoutUser() {
  setCurrentSession(null);
}

export function getCurrentUser() {
  const session = getCurrentSession();
  if (!session) return null;
  const accounts = getAccounts();
  return accounts.find(a => a.id === session.userId) || session;
}

export function isAdmin() {
  const currentUser = getCurrentUser();
  return currentUser?.role === 'ADMIN';
}

export async function adminUpdateUser(userId, { name, username, password, avatar, role }) {
  const accounts = getAccounts();
  const account = accounts.find(a => a.id === userId);
  if (!account) return { success: false, error: 'Account not found.' };

  if (name) account.name = name.trim();
  if (avatar) account.avatar = avatar;
  if (role) account.role = role;

  if (username && username.trim().toLowerCase() !== account.username) {
    const newUsername = username.trim().toLowerCase();
    if (accounts.some(a => a.id !== userId && a.username === newUsername)) {
      return { success: false, error: 'Username already in use.' };
    }
    account.username = newUsername;
  }

  if (password && password.length >= 4) {
    account.passwordHash = await hashPassword(password);
  }

  saveAccounts(accounts);

  // Update current session if editing active user
  const session = getCurrentSession();
  if (session && session.userId === userId) {
    session.name = account.name;
    session.username = account.username;
    session.avatar = account.avatar;
    session.role = account.role;
    setCurrentSession(session);
  }

  return { success: true, account };
}

export function adminDeleteUser(userId) {
  let accounts = getAccounts();
  const target = accounts.find(a => a.id === userId);

  if (!target) return { success: false, error: 'Account not found.' };
  if (target.role === 'ADMIN' && accounts.filter(a => a.role === 'ADMIN').length <= 1) {
    return { success: false, error: 'Cannot delete the only Admin account!' };
  }

  accounts = accounts.filter(a => a.id !== userId);
  saveAccounts(accounts);

  // If deleted user was signed in, sign out
  const session = getCurrentSession();
  if (session && session.userId === userId) {
    logoutUser();
  }

  return { success: true };
}
