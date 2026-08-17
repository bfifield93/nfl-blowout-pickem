/**
 * storage.js
 * Multi-League Management & Direct Firebase Realtime Database Persistence Engine.
 */

import { DEFAULT_SCHEDULE } from './nflData.js';

const STORAGE_KEY_LEAGUES = 'nfl_pickem_leagues_v3';
const STORAGE_KEY_ACTIVE_LEAGUE_ID = 'nfl_pickem_active_league_id_v3';
const FIREBASE_REST_LEAGUES_URL = 'https://nfl-blowout-pickem-default-rtdb.firebaseio.com/leagues.json';
const FIREBASE_REST_BASE_URL = 'https://nfl-blowout-pickem-default-rtdb.firebaseio.com/leagues';

const DEFAULT_LEAGUE_DATA = {
  id: 'league_default',
  leagueName: 'Blowout Champions League 2026',
  joinCode: 'BLOWOUT2026',
  adminUserId: 'p_admin',
  currentWeek: 1,
  activePlayerId: 'p_admin',
  players: [
    { id: 'p_admin', userId: 'p_admin', name: 'Commissioner Admin', avatar: '👑', picks: {} },
    { id: 'p1', userId: 'p1', name: 'Player 1', avatar: '⚡', picks: {} },
    { id: 'p2', userId: 'p2', name: 'Player 2', avatar: '🔥', picks: {} }
  ],
  schedule: DEFAULT_SCHEDULE
};

export function sanitizeJoinCode(code) {
  if (!code) return '';
  return code.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function getAllLeagues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEAGUES);
    if (!raw) {
      const initialMap = { [DEFAULT_LEAGUE_DATA.id]: DEFAULT_LEAGUE_DATA };
      localStorage.setItem(STORAGE_KEY_LEAGUES, JSON.stringify(initialMap));
      return initialMap;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading leagues:', err);
    return { [DEFAULT_LEAGUE_DATA.id]: DEFAULT_LEAGUE_DATA };
  }
}

export function saveAllLeagues(leaguesMap) {
  try {
    localStorage.setItem(STORAGE_KEY_LEAGUES, JSON.stringify(leaguesMap));
  } catch (err) {
    console.error('Error saving leagues map:', err);
  }
}

export function mergeLeaguesFromSync(incomingData) {
  if (!incomingData) return;
  const currentMap = getAllLeagues();
  let changed = false;

  if (incomingData.id && incomingData.joinCode) {
    currentMap[incomingData.id] = incomingData;
    changed = true;
  } else if (typeof incomingData === 'object') {
    Object.keys(incomingData).forEach(key => {
      const lg = incomingData[key];
      if (lg && typeof lg === 'object' && lg.joinCode) {
        const id = lg.id || key;
        lg.id = id;
        if (!lg.players || !Array.isArray(lg.players)) {
          lg.players = [];
        }
        currentMap[id] = lg;
        changed = true;
      }
    });
  }

  saveAllLeagues(currentMap);
  return changed;
}

export function getActiveLeagueId() {
  try {
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_LEAGUE_ID);
    const leaguesMap = getAllLeagues();
    if (activeId && leaguesMap[activeId]) {
      return activeId;
    }
    const firstKey = Object.keys(leaguesMap)[0] || DEFAULT_LEAGUE_DATA.id;
    localStorage.setItem(STORAGE_KEY_ACTIVE_LEAGUE_ID, firstKey);
    return firstKey;
  } catch (err) {
    return DEFAULT_LEAGUE_DATA.id;
  }
}

export function setActiveLeagueId(leagueId) {
  localStorage.setItem(STORAGE_KEY_ACTIVE_LEAGUE_ID, leagueId);
}

export function loadLeagueData(userOrId = null) {
  const leaguesMap = getAllLeagues();
  const activeId = getActiveLeagueId();

  if (activeId && leaguesMap[activeId]) {
    return leaguesMap[activeId];
  }

  if (userOrId) {
    const userLeagues = getUserLeagues(userOrId);
    if (userLeagues.length > 0) {
      setActiveLeagueId(userLeagues[0].id);
      return userLeagues[0];
    }
  }

  const firstLeague = Object.values(leaguesMap)[0] || DEFAULT_LEAGUE_DATA;
  setActiveLeagueId(firstLeague.id);
  return firstLeague;
}

export async function saveLeagueData(leagueData) {
  if (!leagueData || !leagueData.id) return;
  const leaguesMap = getAllLeagues();
  leaguesMap[leagueData.id] = leagueData;
  saveAllLeagues(leaguesMap);
  setActiveLeagueId(leagueData.id);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('leagueUpdated', { detail: leagueData }));
  }

  // Direct REST PUT to Firebase Realtime Database
  try {
    await fetch(`${FIREBASE_REST_BASE_URL}/${leagueData.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leagueData)
    });
  } catch (err) {
    console.warn('Direct REST league save notice:', err);
  }
}

export function createNewLeague(name, joinCode, creatorUser) {
  const cleanName = (name || '').trim();
  let cleanCode = sanitizeJoinCode(joinCode);

  if (!cleanName || cleanName.length < 3) {
    return { success: false, error: 'League name must be at least 3 characters long.' };
  }

  // If join code is missing or short, auto-generate one
  if (!cleanCode || cleanCode.length < 2) {
    cleanCode = `${cleanName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'LEAGUE')}${Math.floor(100 + Math.random() * 900)}`;
  }

  const leaguesMap = getAllLeagues();
  
  // If join code collision occurs, auto-resolve with unique suffix
  if (Object.values(leaguesMap).some(l => l.joinCode && sanitizeJoinCode(l.joinCode) === cleanCode)) {
    cleanCode = `${cleanCode}${Math.floor(10 + Math.random() * 90)}`;
  }

  const newLeagueId = `lg_${Date.now()}`;
  const creatorId = creatorUser ? (creatorUser.userId || creatorUser.id) : 'p_admin';
  const creatorName = creatorUser ? creatorUser.name : 'Commissioner';
  const creatorAvatar = creatorUser ? (creatorUser.avatar || '👑') : '👑';

  const creatorPlayer = {
    id: creatorId,
    userId: creatorId,
    name: creatorName,
    avatar: creatorAvatar,
    picks: {}
  };

  const newLeague = {
    id: newLeagueId,
    leagueName: cleanName,
    joinCode: cleanCode,
    adminUserId: creatorId,
    currentWeek: 1,
    activePlayerId: creatorId,
    players: [creatorPlayer],
    schedule: DEFAULT_SCHEDULE,
    createdAt: Date.now()
  };

  leaguesMap[newLeagueId] = newLeague;
  saveAllLeagues(leaguesMap);
  setActiveLeagueId(newLeagueId);

  // Non-blocking background push to Firebase Realtime Database
  fetch(`${FIREBASE_REST_BASE_URL}/${newLeagueId}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newLeague)
  }).catch(err => console.warn('Background league push notice:', err));

  return { success: true, league: newLeague };
}

export async function joinLeagueByCode(joinCode, user) {
  const targetCode = sanitizeJoinCode(joinCode);
  if (!targetCode || targetCode.length < 2) {
    return { success: false, error: 'Please enter a valid Join Code (at least 2 characters).' };
  }

  // 1. Pre-fetch latest leagues directly from Firebase REST
  try {
    const cloudRes = await fetch(FIREBASE_REST_LEAGUES_URL);
    if (cloudRes.ok) {
      const cloudLeagues = await cloudRes.json();
      if (cloudLeagues) mergeLeaguesFromSync(cloudLeagues);
    }
  } catch (err) {
    console.warn('Pre-join league cloud fetch notice:', err);
  }

  const leaguesMap = getAllLeagues();
  const allLeagues = Object.values(leaguesMap);

  // 2. Search exact or fuzzy code match
  let league = allLeagues.find(l => l && l.joinCode && sanitizeJoinCode(l.joinCode) === targetCode);

  if (!league) {
    league = allLeagues.find(l => l && l.joinCode && sanitizeJoinCode(l.joinCode).startsWith(targetCode));
  }

  if (!league) {
    league = allLeagues.find(l => l && l.joinCode && targetCode.startsWith(sanitizeJoinCode(l.joinCode)));
  }

  if (!league) {
    return { success: false, error: `League not found for Join Code "${joinCode.trim()}". Please verify code with Commissioner.` };
  }

  const userId = user ? (user.userId || user.id) : 'p_user';
  if (!league.players || !Array.isArray(league.players)) {
    league.players = [];
  }

  let player = league.players.find(p => (p.id === userId || p.userId === userId));

  if (!player) {
    player = {
      id: userId,
      userId: userId,
      name: user ? user.name : 'Player',
      avatar: user ? (user.avatar || '🏈') : '🏈',
      picks: {}
    };
    league.players.push(player);
  }

  league.activePlayerId = userId;
  leaguesMap[league.id] = league;
  saveAllLeagues(leaguesMap);
  setActiveLeagueId(league.id);

  // 3. Direct REST PUT to Firebase Realtime Database
  try {
    await fetch(`${FIREBASE_REST_BASE_URL}/${league.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(league)
    });
  } catch (err) {
    console.error('Direct REST join league sync error:', err);
  }

  return { success: true, league };
}

export function getUserLeagues(userOrId, allowGlobalAdmin = false) {
  const leaguesMap = getAllLeagues();
  const allLeagues = Object.values(leaguesMap);

  const uid = typeof userOrId === 'object' ? (userOrId?.userId || userOrId?.id) : userOrId;

  if (!uid) {
    return [];
  }

  if (allowGlobalAdmin) {
    return allLeagues;
  }

  return allLeagues.filter(l => {
    if (!l) return false;
    const isCreator = (l.adminUserId && l.adminUserId === uid);
    const isMember = (l.players && Array.isArray(l.players) && l.players.some(p => (p.id === uid || p.userId === uid)));
    return isCreator || isMember;
  });
}

export function isLeagueAdmin(league, userOrId) {
  if (!league || !userOrId) return false;
  const uid = typeof userOrId === 'object' ? (userOrId.userId || userOrId.id) : userOrId;
  return league.adminUserId === uid;
}

export function exportLeagueJson(leagueData) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(leagueData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `${leagueData.leagueName.toLowerCase().replace(/\s+/g, '_')}_data.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function importLeagueJson(jsonString) {
  try {
    const imported = JSON.parse(jsonString);
    if (!imported.id || !imported.leagueName || !imported.players || !imported.schedule) {
      return { success: false, error: 'Invalid league data JSON structure.' };
    }
    const leaguesMap = getAllLeagues();
    leaguesMap[imported.id] = imported;
    saveAllLeagues(leaguesMap);
    setActiveLeagueId(imported.id);
    return { success: true, data: imported };
  } catch (err) {
    return { success: false, error: 'Failed to parse JSON file.' };
  }
}

export async function deleteLeague(leagueId, requestingUser = null) {
  const user = requestingUser || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('nfl_pickem_session_v2') || '{}') : null);
  const isMaster = user && (user.username === 'master');

  if (!isMaster) {
    return { success: false, error: 'Only the single Master account (master) can delete leagues.' };
  }

  const leaguesMap = getAllLeagues();
  if (!leaguesMap[leagueId]) {
    return { success: false, error: 'League not found.' };
  }

  delete leaguesMap[leagueId];
  saveAllLeagues(leaguesMap);

  const activeId = getActiveLeagueId();
  if (activeId === leagueId) {
    const remainingKeys = Object.keys(leaguesMap);
    if (remainingKeys.length > 0) {
      setActiveLeagueId(remainingKeys[0]);
    } else {
      resetToDefaultLeague();
    }
  }

  // Delete from Firebase REST Database
  try {
    await fetch(`${FIREBASE_REST_BASE_URL}/${leagueId}.json`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.warn('Direct REST delete league notice:', err);
  }

  return { success: true };
}

export function resetToDefaultLeague() {
  const leaguesMap = { [DEFAULT_LEAGUE_DATA.id]: DEFAULT_LEAGUE_DATA };
  saveAllLeagues(leaguesMap);
  setActiveLeagueId(DEFAULT_LEAGUE_DATA.id);
  return DEFAULT_LEAGUE_DATA;
}
