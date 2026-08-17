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
    { id: 'p_admin', name: 'Commissioner Admin', avatar: '👑', picks: {} },
    { id: 'p1', name: 'Player 1', avatar: '⚡', picks: {} },
    { id: 'p2', name: 'Player 2', avatar: '🔥', picks: {} }
  ],
  schedule: DEFAULT_SCHEDULE
};

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
      if (lg && lg.id && lg.joinCode) {
        currentMap[lg.id] = lg;
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

export function loadLeagueData() {
  const activeId = getActiveLeagueId();
  const leaguesMap = getAllLeagues();
  const activeLeague = leaguesMap[activeId] || DEFAULT_LEAGUE_DATA;

  if (!activeLeague.schedule || activeLeague.schedule.length === 0) {
    activeLeague.schedule = DEFAULT_SCHEDULE;
  }

  return activeLeague;
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

export async function createNewLeague(name, joinCode, creatorUser) {
  const cleanName = name.trim();
  const cleanCode = (joinCode || '').trim().toUpperCase();

  if (!cleanName || cleanName.length < 3) {
    return { success: false, error: 'League name must be at least 3 characters long.' };
  }
  if (!cleanCode || cleanCode.length < 3) {
    return { success: false, error: 'Join code must be at least 3 characters long.' };
  }

  // Pre-sync check from Firebase Database to make sure joinCode is not taken on cloud
  try {
    const cloudRes = await fetch(FIREBASE_REST_LEAGUES_URL);
    if (cloudRes.ok) {
      const cloudLeagues = await cloudRes.json();
      if (cloudLeagues) mergeLeaguesFromSync(cloudLeagues);
    }
  } catch (err) {
    console.warn('Pre-create league cloud fetch notice:', err);
  }

  const leaguesMap = getAllLeagues();
  if (Object.values(leaguesMap).some(l => l.joinCode === cleanCode)) {
    return { success: false, error: 'Join code already in use by another league.' };
  }

  const newLeagueId = `lg_${Date.now()}`;
  const creatorPlayer = creatorUser ? {
    id: creatorUser.userId || creatorUser.id,
    name: creatorUser.name,
    avatar: creatorUser.avatar || '👑',
    picks: {}
  } : { id: 'p_creator', name: 'Commissioner', avatar: '👑', picks: {} };

  const newLeague = {
    id: newLeagueId,
    leagueName: cleanName,
    joinCode: cleanCode,
    adminUserId: creatorUser ? (creatorUser.userId || creatorUser.id) : creatorPlayer.id,
    currentWeek: 1,
    activePlayerId: creatorPlayer.id,
    players: [creatorPlayer],
    schedule: DEFAULT_SCHEDULE,
    createdAt: Date.now()
  };

  leaguesMap[newLeagueId] = newLeague;
  saveAllLeagues(leaguesMap);
  setActiveLeagueId(newLeagueId);

  // Direct REST PUT to Firebase Realtime Database
  try {
    const putRes = await fetch(`${FIREBASE_REST_BASE_URL}/${newLeagueId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLeague)
    });
    console.log('⚡ Direct REST league creation sync status:', putRes.status);
  } catch (err) {
    console.error('Direct REST league create error:', err);
  }

  return { success: true, league: newLeague };
}

export async function joinLeagueByCode(joinCode, user) {
  const cleanCode = (joinCode || '').trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: 'Please enter a valid Join Code.' };
  }

  // Pre-sync check from Firebase Database to fetch latest cloud leagues before checking code
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
  const league = Object.values(leaguesMap).find(l => l.joinCode === cleanCode);

  if (!league) {
    return { success: false, error: 'League not found with that Join Code. Please verify code.' };
  }

  const userId = user ? (user.userId || user.id) : 'p_user';
  let player = league.players.find(p => p.id === userId);

  if (!player) {
    player = {
      id: userId,
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

  // Direct REST PUT to Firebase Realtime Database
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

export function getUserLeagues(userId) {
  const leaguesMap = getAllLeagues();
  const allLeagues = Object.values(leaguesMap);
  if (!userId) return allLeagues;

  return allLeagues.filter(l => {
    return l.adminUserId === userId || (l.players && l.players.some(p => p.id === userId));
  });
}

export function isLeagueAdmin(league, userId) {
  if (!league || !userId) return false;
  return league.adminUserId === userId;
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

export function resetToDefaultLeague() {
  const leaguesMap = { [DEFAULT_LEAGUE_DATA.id]: DEFAULT_LEAGUE_DATA };
  saveAllLeagues(leaguesMap);
  setActiveLeagueId(DEFAULT_LEAGUE_DATA.id);
  return DEFAULT_LEAGUE_DATA;
}
