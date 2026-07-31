/**
 * storage.js
 * Persistence engine using LocalStorage & JSON Export/Import.
 */

import { DEFAULT_SCHEDULE } from './nflData.js';

const STORAGE_KEY_LEAGUE = 'nfl_blowout_pickem_league_v1';

const DEFAULT_LEAGUE_DATA = {
  leagueName: 'Blowout Champions League 2026',
  currentWeek: 1,
  activePlayerId: 'p1',
  players: [
    {
      id: 'p1',
      name: 'Player 1 (You)',
      avatar: '👑',
      picks: {}
    },
    {
      id: 'p2',
      name: 'Friend 1',
      avatar: '⚡',
      picks: {}
    }
  ],
  schedule: DEFAULT_SCHEDULE
};

export function loadLeagueData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEAGUE);
    if (!raw) {
      saveLeagueData(DEFAULT_LEAGUE_DATA);
      return DEFAULT_LEAGUE_DATA;
    }
    const parsed = JSON.parse(raw);

    // If existing cached schedule contains mock/placeholder games, reset schedule to clean ESPN 2026 structure
    if (parsed.schedule && parsed.schedule.some(w => w.games.some(g => g.id.startsWith('w1g') || g.id.startsWith('w2g')))) {
      parsed.schedule = DEFAULT_SCHEDULE;
      saveLeagueData(parsed);
    }

    return parsed;
  } catch (err) {
    console.error('Error loading league data, reverting to defaults:', err);
    return DEFAULT_LEAGUE_DATA;
  }
}

export function saveLeagueData(data) {
  try {
    localStorage.setItem(STORAGE_KEY_LEAGUE, JSON.stringify(data));
  } catch (err) {
    console.error('Error saving league data:', err);
  }
}

export function exportLeagueJson(data) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_data.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importLeagueJson(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed.players || !Array.isArray(parsed.players)) {
      throw new Error('Invalid league file format: missing players list.');
    }
    saveLeagueData(parsed);
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function resetToDefaultLeague() {
  const freshData = JSON.parse(JSON.stringify(DEFAULT_LEAGUE_DATA));
  saveLeagueData(freshData);
  return freshData;
}
