/**
 * mockScores.js
 * Helpers to simulate game outcomes, edit scores, and reset schedule.
 */

export function simulateWeekScores(schedule, weekNum) {
  const weekData = schedule.find(w => w.week === weekNum);
  if (!weekData) return schedule;

  weekData.games.forEach(g => {
    // Generate realistic NFL score differentials (e.g. 3 to 35 pt spreads)
    const margin = Math.floor(Math.random() * 28) + 3;
    const winnerScore = Math.floor(Math.random() * 21) + 20; // 20 - 40 pts
    const loserScore = Math.max(0, winnerScore - margin);

    if (Math.random() > 0.5) {
      g.homeScore = winnerScore;
      g.awayScore = loserScore;
    } else {
      g.homeScore = loserScore;
      g.awayScore = winnerScore;
    }
    g.status = 'FINAL';
  });

  return schedule;
}

export function updateGameScore(schedule, weekNum, gameId, homeScore, awayScore, isFinal = true) {
  const weekData = schedule.find(w => w.week === weekNum);
  if (!weekData) return schedule;

  const game = weekData.games.find(g => g.id === gameId);
  if (game) {
    game.homeScore = parseInt(homeScore, 10);
    game.awayScore = parseInt(awayScore, 10);
    game.status = isFinal ? 'FINAL' : 'SCHEDULED';
  }

  return schedule;
}
