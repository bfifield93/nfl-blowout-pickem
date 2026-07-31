/**
 * nflApi.js
 * Integration with ESPN's public live NFL Scoreboard API.
 * Automatically fetches real 2026 NFL schedules, live game clocks, and final scores.
 */

// ESPN Abbreviation Normalizer Map
const TEAM_ABBR_MAP = {
  WSH: 'WAS',
  WLB: 'WAS',
  OAK: 'LV',
  SD: 'LAC',
  STL: 'LAR'
};

export async function fetchLiveNflScores(weekNum = 1, year = 2026, seasonType = 2) {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=${seasonType}&week=${weekNum}&dates=${year}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const events = data.events || [];

    const games = events.map(evt => {
      const competition = evt.competitions[0];
      const homeComp = competition.competitors.find(c => c.homeAway === 'home');
      const awayComp = competition.competitors.find(c => c.homeAway === 'away');

      let homeAbbr = homeComp?.team?.abbreviation || '';
      let awayAbbr = awayComp?.team?.abbreviation || '';

      if (TEAM_ABBR_MAP[homeAbbr]) homeAbbr = TEAM_ABBR_MAP[homeAbbr];
      if (TEAM_ABBR_MAP[awayAbbr]) awayAbbr = TEAM_ABBR_MAP[awayAbbr];

      const homeScore = homeComp?.score ? parseInt(homeComp.score, 10) : null;
      const awayScore = awayComp?.score ? parseInt(awayComp.score, 10) : null;

      const state = evt.status?.type?.state;
      let status = 'SCHEDULED';
      if (state === 'post') {
        status = 'FINAL';
      } else if (state === 'in') {
        status = 'LIVE';
      }

      return {
        id: evt.id || `espn_${weekNum}_${homeAbbr}_${awayAbbr}`,
        home: homeAbbr,
        away: awayAbbr,
        homeScore,
        awayScore,
        status,
        clock: evt.status?.type?.detail || '',
        name: evt.name || `${awayAbbr} at ${homeAbbr}`
      };
    });

    return { success: true, week: weekNum, games };
  } catch (err) {
    console.warn(`Could not fetch live ESPN scores for Week ${weekNum}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Merges live fetched games from ESPN API into the current schedule object.
 * Replaces placeholder games with official real 2026 NFL matchups.
 */
export function mergeLiveGamesIntoSchedule(schedule, weekNum, liveGames) {
  const weekData = schedule.find(w => w.week === weekNum);
  if (!weekData || !liveGames || liveGames.length === 0) return schedule;

  // Replace week games with official real ESPN matchups
  weekData.games = liveGames.map(g => ({
    id: g.id,
    home: g.home,
    away: g.away,
    homeScore: g.homeScore ?? 0,
    awayScore: g.awayScore ?? 0,
    status: g.status,
    clock: g.clock || ''
  }));

  return schedule;
}
