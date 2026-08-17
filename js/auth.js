/**
 * auth.js
 * User Authentication, Password Hashing, Session Management & Admin Control Engine.
 */

const STORAGE_KEY_ACCOUNTS = 'nfl_pickem_accounts_v2';
const STORAGE_KEY_SESSION = 'nfl_pickem_session_v2';

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
  if (!incomingAccounts || !Array.isArray(incomingAccounts)) return;
  const currentAccounts = getAccounts();
  let changed = false;

  incomingAccounts.forEach(inc => {
    if (!inc || !inc.username) return;
    const existingIdx = currentAccounts.findIndex(a => (a.id && inc.id && a.id === inc.id) || a.username.toLowerCase() === inc.username.toLowerCase());
    if (existingIdx >= 0) {
      currentAccounts[existingIdx] = { ...currentAccounts[existingIdx], ...inc };
    } else {
      currentAccounts.push(inc);
      changed = true;
    }
  });

  if (changed) {
    saveAccounts(currentAccounts);
  } else {
    try {
      localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(currentAccounts));
    } catch (err) {
      console.error('Error saving merged accounts:', err);
    }
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
  const user = getCurrentUser();
  return user && user.role === 'ADMIN';
}

export async function adminUpdateUser(userId, updates) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin privileges required.' };
  }

  const accounts = getAccounts();
  const account = accounts.find(a => a.id === userId);
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
  return { success: true, account };
}

export function adminDeleteUser(userId) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin privileges required.' };
  }

  let accounts = getAccounts();
  const target = accounts.find(a => a.id === userId);
  if (target && target.role === 'ADMIN') {
    const adminCount = accounts.filter(a => a.role === 'ADMIN').length;
    if (adminCount <= 1) {
      return { success: false, error: 'Cannot delete the only Commissioner Admin.' };
    }
  }

  accounts = accounts.filter(a => a.id !== userId);
  saveAccounts(accounts);

  const session = getCurrentSession();
  if (session && session.userId === userId) {
    logoutUser();
  }

  return { success: true };
}
