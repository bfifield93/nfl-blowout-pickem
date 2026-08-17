/**
 * gameEngine.js
 * Core scoring logic and strict single-use survivor rules for NFL Blowout Pick'em.
 */

/**
 * Calculates points scored for a specific team pick in a given game.
 * Rule: 
 * - WINNER pick: Player gets points equal to Margin of Victory if team wins (0 if loss).
 * - LOSER pick: Player gets points equal to Margin of Defeat if team loses (0 if win).
 */
export function calculatePickScore(teamId, pickType, game) {
  if (!game || game.status !== 'FINAL' || game.homeScore === null || game.awayScore === null) {
    return {
      points: 0,
      margin: 0,
      status: 'PENDING',
      isCorrect: null,
      teamScore: null,
      oppScore: null
    };
  }

  const isHome = game.home === teamId;
  const isAway = game.away === teamId;

  if (!isHome && !isAway) {
    return { points: 0, margin: 0, status: 'INVALID', isCorrect: false, teamScore: 0, oppScore: 0 };
  }

  const teamScore = isHome ? game.homeScore : game.awayScore;
  const oppScore = isHome ? game.awayScore : game.homeScore;
  const margin = Math.abs(teamScore - oppScore);
  
  if (pickType === 'WINNER') {
    const isWin = teamScore > oppScore;
    const isTie = teamScore === oppScore;
    const points = isTie ? 0 : (isWin ? margin : -margin);

    return {
      points,
      margin,
      status: 'COMPLETED',
      isCorrect: isWin,
      teamScore,
      oppScore
    };
  } else if (pickType === 'LOSER') {
    const isLoss = teamScore < oppScore;
    const isTie = teamScore === oppScore;
    const points = isTie ? 0 : (isLoss ? margin : -margin);

    return {
      points,
      margin,
      status: 'COMPLETED',
      isCorrect: isLoss,
      teamScore,
      oppScore
    };
  }

  return { points: 0, margin: 0, status: 'INVALID', isCorrect: false, teamScore, oppScore };
}

/**
 * Returns a map of all teams selected by a player across all weeks,
 * enforcing the strict Survivor Rule (each team can only be selected ONCE total).
 */
export function getPlayerUsedTeamsMap(playerPicks) {
  // playerPicks structure: { week1: { winnerTeamId, loserTeamId }, week2: ... }
  const usedMap = {}; // teamId -> { week: number, type: 'WINNER'|'LOSER' }

  if (!playerPicks) return usedMap;

  Object.entries(playerPicks).forEach(([weekKey, pickData]) => {
    const weekNum = parseInt(weekKey.replace('week', ''), 10);
    if (pickData?.winnerTeamId) {
      usedMap[pickData.winnerTeamId] = { week: weekNum, type: 'WINNER' };
    }
    if (pickData?.loserTeamId) {
      usedMap[pickData.loserTeamId] = { week: weekNum, type: 'LOSER' };
    }
  });

  return usedMap;
}

/**
 * Checks if a specific team is already burnt/used by a player in any other week.
 */
export function isTeamUsedByPlayer(playerPicks, teamId, currentWeek) {
  if (!playerPicks || !teamId) return false;

  const usedMap = getPlayerUsedTeamsMap(playerPicks);
  const entry = usedMap[teamId];

  if (!entry) return false;

  // If used in another week, it is unavailable
  return entry.week !== currentWeek;
}

/**
 * Calculates complete season standings and weekly stats for all players.
 */
export function calculateStandings(players = [], schedule = []) {
  const safePlayers = Array.isArray(players) ? players : [];
  const safeSchedule = Array.isArray(schedule) ? schedule : [];

  // Map schedule by week and team for fast lookup
  const gameMapByWeekAndTeam = {};
  safeSchedule.forEach(wData => {
    if (!wData) return;
    const weekNum = wData.week;
    gameMapByWeekAndTeam[weekNum] = {};
    const gamesList = Array.isArray(wData.games) ? wData.games : [];
    gamesList.forEach(g => {
      if (!g) return;
      if (g.home) gameMapByWeekAndTeam[weekNum][g.home] = g;
      if (g.away) gameMapByWeekAndTeam[weekNum][g.away] = g;
    });
  });

  const standings = safePlayers.filter(Boolean).map(player => {
    let totalPoints = 0;
    let totalCorrectPicks = 0;
    let totalPicksMade = 0;
    let maxBlowoutPoints = 0;
    const weeklyBreakdown = [];

    for (let w = 1; w <= 18; w++) {
      const weekPicks = player.picks?.[`week${w}`] || {};
      const weekGames = gameMapByWeekAndTeam[w] || {};

      let weekWinnerResult = null;
      let weekLoserResult = null;
      let weekPoints = 0;

      // Calculate Winner Pick
      if (weekPicks.winnerTeamId) {
        const game = weekGames[weekPicks.winnerTeamId];
        weekWinnerResult = calculatePickScore(weekPicks.winnerTeamId, 'WINNER', game);
        if (weekWinnerResult.status === 'COMPLETED') {
          totalPicksMade++;
          if (weekWinnerResult.isCorrect) totalCorrectPicks++;
          weekPoints += weekWinnerResult.points;
          if (weekWinnerResult.points > maxBlowoutPoints) {
            maxBlowoutPoints = weekWinnerResult.points;
          }
        }
      }

      // Calculate Loser Pick
      if (weekPicks.loserTeamId) {
        const game = weekGames[weekPicks.loserTeamId];
        weekLoserResult = calculatePickScore(weekPicks.loserTeamId, 'LOSER', game);
        if (weekLoserResult.status === 'COMPLETED') {
          totalPicksMade++;
          if (weekLoserResult.isCorrect) totalCorrectPicks++;
          weekPoints += weekLoserResult.points;
          if (weekLoserResult.points > maxBlowoutPoints) {
            maxBlowoutPoints = weekLoserResult.points;
          }
        }
      }

      totalPoints += weekPoints;

      weeklyBreakdown.push({
        week: w,
        winnerTeamId: weekPicks.winnerTeamId || null,
        winnerResult: weekWinnerResult,
        loserTeamId: weekPicks.loserTeamId || null,
        loserResult: weekLoserResult,
        totalWeekPoints: weekPoints
      });
    }

    const accuracyPct = totalPicksMade > 0 ? Math.round((totalCorrectPicks / totalPicksMade) * 100) : 0;

    return {
      id: player.id,
      name: player.name,
      avatar: player.avatar || '🏈',
      totalPoints,
      totalCorrectPicks,
      totalPicksMade,
      accuracyPct,
      maxBlowoutPoints,
      weeklyBreakdown
    };
  });

  // Sort by Total Points descending, then accuracyPct descending
  standings.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return b.accuracyPct - a.accuracyPct;
  });

  // Assign ranks
  standings.forEach((p, index) => {
    p.rank = index + 1;
  });

  return standings;
}
