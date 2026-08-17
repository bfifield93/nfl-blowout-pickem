/**
 * app.js
 * Main UI Controller and Event Handler for NFL Blowout Pick'em.
 */

import { NFL_TEAMS } from './nflData.js';
import {
  calculatePickScore,
  getPlayerUsedTeamsMap,
  isTeamUsedByPlayer,
  calculateStandings
} from './gameEngine.js';
import {
  loadLeagueData,
  saveLeagueData,
  getAllLeagues,
  getActiveLeagueId,
  setActiveLeagueId,
  createNewLeague,
  joinLeagueByCode,
  getUserLeagues,
  isLeagueAdmin,
  mergeLeaguesFromSync,
  exportLeagueJson,
  importLeagueJson,
  resetToDefaultLeague
} from './storage.js';
import { simulateWeekScores, updateGameScore } from './mockScores.js';
import { fetchLiveNflScores, mergeLiveGamesIntoSchedule } from './nflApi.js';
import {
  getAccounts,
  getCurrentUser,
  loginUser,
  registerUser,
  logoutUser,
  isAdmin,
  adminUpdateUser,
  adminDeleteUser,
  mergeAccountsFromSync
} from './auth.js';
import {
  initCloudDatabase,
  initBroadcastSync,
  getSavedFirebaseConfig,
  saveFirebaseConfig,
  subscribeToRealtimeCloudUpdates,
  fetchAccountsFromCloud,
  fetchLeaguesFromCloud,
  isCloudActive
} from './cloudDb.js';

// Application State
let state = {
  league: loadLeagueData(),
  currentWeek: 1,
  selectedAvatar: '🏈',
  selectedRegAvatar: '🏈'
};

// Dynamic DOM Element Resolver (Proxy guarantees live DOM binding)
const elements = new Proxy({}, {
  get(target, prop) {
    return document.getElementById(prop);
  }
});

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  populateScoreWeekDropdown();

  // Multi-Browser / Multi-Tab Realtime Broadcast Sync
  initBroadcastSync((eventData) => {
    if (eventData.type === 'LEAGUE_UPDATE' && eventData.payload) {
      mergeLeaguesFromSync(eventData.payload);
      state.league = loadLeagueData();
      renderAll();
    } else if (eventData.type === 'ACCOUNTS_UPDATE' && eventData.payload) {
      mergeAccountsFromSync(eventData.payload);
      renderAll();
    }
  });

  // RENDER IMMEDIATELY: Ensures 0ms instant UI rendering and button interactivity!
  renderAll();

  // Non-blocking background schedule sync
  autoSyncWeekSchedule(state.currentWeek);

  // Non-blocking background cloud database sync
  initCloudDatabase().then(async (cloudRes) => {
    try {
      const [initialAccounts, initialLeagues] = await Promise.all([
        fetchAccountsFromCloud(),
        fetchLeaguesFromCloud()
      ]);

      let updated = false;
      if (initialAccounts) {
        mergeAccountsFromSync(initialAccounts);
        updated = true;
      }
      if (initialLeagues) {
        mergeLeaguesFromSync(initialLeagues);
        updated = true;
      }

      if (updated) {
        state.league = loadLeagueData();
        renderAll();
      }

      if (cloudRes.success && cloudRes.mode === 'CUSTOM_FIREBASE') {
        subscribeToRealtimeCloudUpdates(
          (updatedLeagues) => {
            if (updatedLeagues) {
              mergeLeaguesFromSync(updatedLeagues);
              state.league = loadLeagueData();
              renderAll();
            }
          },
          (updatedAccounts) => {
            if (updatedAccounts) {
              mergeAccountsFromSync(updatedAccounts);
              renderAll();
            }
          }
        );
      }
    } catch (err) {
      console.warn('Background cloud sync notice:', err);
    }
  });
});

async function autoSyncWeekSchedule(weekNum) {
  const res = await fetchLiveNflScores(weekNum, 2026);
  if (res.success && res.games.length > 0) {
    state.league.schedule = mergeLiveGamesIntoSchedule(state.league.schedule, weekNum, res.games);
    saveLeagueData(state.league);
    renderMatchups();
    renderPicksSummary();
    renderScoreManager();
  }
}

function getActivePlayer() {
  syncAccountsWithPlayers();
  const currentUser = getCurrentUser();
  
  if (currentUser && !isAdmin()) {
    state.league.activePlayerId = currentUser.userId;
  }

  const activeId = state.league.activePlayerId;
  let player = state.league.players.find(p => p.id === activeId);

  if (!player && currentUser) {
    player = { id: currentUser.userId, name: currentUser.name, avatar: currentUser.avatar, picks: {} };
    state.league.players.push(player);
    state.league.activePlayerId = currentUser.userId;
  }

  return player || state.league.players[0];
}

function syncAccountsWithPlayers() {
  const accounts = getAccounts();
  const players = state.league.players;

  accounts.forEach(acc => {
    let player = players.find(p => p.id === acc.id);
    if (!player) {
      player = { id: acc.id, name: acc.name, avatar: acc.avatar, picks: {} };
      players.push(player);
    } else {
      player.name = acc.name;
      player.avatar = acc.avatar;
    }
  });

  const currentUser = getCurrentUser();
  if (currentUser && !isAdmin()) {
    state.league.activePlayerId = currentUser.userId;
  } else if (!state.league.activePlayerId && players.length > 0) {
    state.league.activePlayerId = players[0].id;
  }
}

function renderAuthHeader() {
  const currentUser = getCurrentUser();

  if (currentUser) {
    if (elements.userProfileBadge) elements.userProfileBadge.style.display = 'flex';
    if (elements.userAvatar) elements.userAvatar.textContent = currentUser.avatar || '🏈';
    if (elements.userNameText) elements.userNameText.textContent = currentUser.name;
    if (elements.userRoleBadge) {
      elements.userRoleBadge.textContent = currentUser.role;
      elements.userRoleBadge.style.color = currentUser.role === 'ADMIN' ? 'var(--color-gold)' : 'var(--color-green)';
    }

    if (elements.btnSignIn) elements.btnSignIn.style.display = 'none';
    if (elements.btnRegister) elements.btnRegister.style.display = 'none';
    if (elements.btnSignOut) elements.btnSignOut.style.display = 'inline-flex';
    if (elements.leagueSelectContainer) elements.leagueSelectContainer.style.display = 'flex';
    if (elements.btnOpenLeagueHub) elements.btnOpenLeagueHub.style.display = 'inline-flex';
    if (elements.btnLiveSync) elements.btnLiveSync.style.display = 'inline-flex';
    if (elements.btnExportImport) elements.btnExportImport.style.display = 'inline-flex';
    if (elements.btnRules) elements.btnRules.style.display = 'inline-flex';

    if (elements.btnAdminPanel) {
      elements.btnAdminPanel.style.display = currentUser.role === 'ADMIN' ? 'inline-flex' : 'none';
    }
  } else {
    if (elements.userProfileBadge) elements.userProfileBadge.style.display = 'none';
    if (elements.btnSignIn) elements.btnSignIn.style.display = 'inline-flex';
    if (elements.btnRegister) elements.btnRegister.style.display = 'inline-flex';
    if (elements.btnRules) elements.btnRules.style.display = 'inline-flex';

    if (elements.btnSignOut) elements.btnSignOut.style.display = 'none';
    if (elements.btnAdminPanel) elements.btnAdminPanel.style.display = 'none';
    if (elements.leagueSelectContainer) elements.leagueSelectContainer.style.display = 'none';
    if (elements.btnOpenLeagueHub) elements.btnOpenLeagueHub.style.display = 'none';
    if (elements.btnLiveSync) elements.btnLiveSync.style.display = 'none';
    if (elements.btnExportImport) elements.btnExportImport.style.display = 'none';
  }
}

function renderLeagueDropdown() {
  if (!elements.leagueDropdown) return;
  const currentUser = getCurrentUser();
  const userLeagues = getUserLeagues(currentUser?.userId);

  elements.leagueDropdown.innerHTML = userLeagues.map(l => {
    return `<option value="${l.id}" ${l.id === state.league.id ? 'selected' : ''}>🏆 ${l.leagueName}</option>`;
  }).join('');
}

function renderMyLeaguesList() {
  if (!elements.myLeaguesList) return;
  const currentUser = getCurrentUser();
  const userLeagues = getUserLeagues(currentUser?.userId);

  elements.myLeaguesList.innerHTML = userLeagues.map(l => {
    const isCreator = l.adminUserId === currentUser?.userId || isAdmin();
    const isActive = l.id === state.league.id;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
        <div>
          <div style="font-weight: 800; font-size: 1rem; color: #FFF;">
            ${l.leagueName}
            ${isActive ? '<span style="font-size: 0.7rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: rgba(0,255,135,0.15); color: var(--color-green); margin-left: 6px;">ACTIVE</span>' : ''}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
            Invite Code: <strong style="color: var(--color-gold);">${l.joinCode}</strong> • Members: ${l.players?.length || 1}
            ${isCreator ? ' • <span style="color: var(--color-green); font-weight: 800;">COMMISSIONER</span>' : ''}
          </div>
        </div>

        <button class="btn btn-secondary btn-switch-league" data-league-id="${l.id}" style="padding: 6px 12px; font-size: 0.8rem;" ${isActive ? 'disabled' : ''}>
          ${isActive ? 'Selected' : 'Switch'}
        </button>
      </div>
    `;
  }).join('');
}

function renderLandingScores() {
  const weekData = state.league.schedule.find(w => w.week === state.currentWeek);
  if (!weekData) return;

  if (elements.landingScoresTitle) {
    elements.landingScoresTitle.textContent = `⚡ Real-Time NFL Scores (Week ${state.currentWeek})`;
  }

  if (!weekData.games || weekData.games.length === 0) {
    if (elements.landingScoresGrid) {
      elements.landingScoresGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 30px; text-align: center; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
          <div style="font-size: 2rem; margin-bottom: 8px;">🌐</div>
          <h3 style="font-size: 1rem; font-weight: 800;">Fetching Real 2026 NFL Schedule...</h3>
          <p style="color: var(--text-muted); font-size: 0.8rem;">Click Sync Live ESPN Scores above to load games.</p>
        </div>
      `;
    }
    return;
  }

  if (elements.landingScoresGrid) {
    elements.landingScoresGrid.innerHTML = weekData.games.map(game => {
      const homeTeam = NFL_TEAMS[game.home] || { name: game.home, city: '', primaryColor: '#333', logoSvg: '' };
      const awayTeam = NFL_TEAMS[game.away] || { name: game.away, city: '', primaryColor: '#333', logoSvg: '' };

      const homeScoreDisplay = game.status === 'FINAL' ? game.homeScore : '-';
      const awayScoreDisplay = game.status === 'FINAL' ? game.awayScore : '-';

      return `
        <div class="matchup-card" style="padding: 16px;">
          <div class="matchup-header">
            <span>${awayTeam.city} @ ${homeTeam.city}</span>
            <span class="game-status-badge ${game.status === 'FINAL' ? 'final' : 'scheduled'}">${game.status}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div class="team-logo-badge" style="width: 32px; height: 32px; background: ${awayTeam.primaryColor}22;">
                  ${awayTeam.logoSvg}
                </div>
                <div>
                  <span style="font-weight: 800; font-size: 0.95rem;">${awayTeam.name}</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">${awayTeam.city}</span>
                </div>
              </div>
              <span style="font-size: 1.2rem; font-weight: 900; color: #FFF;">${awayScoreDisplay}</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div class="team-logo-badge" style="width: 32px; height: 32px; background: ${homeTeam.primaryColor}22;">
                  ${homeTeam.logoSvg}
                </div>
                <div>
                  <span style="font-weight: 800; font-size: 0.95rem;">${homeTeam.name}</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">${homeTeam.city}</span>
                </div>
              </div>
              <span style="font-size: 1.2rem; font-weight: 900; color: #FFF;">${homeScoreDisplay}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function renderAll() {
  syncAccountsWithPlayers();
  renderAuthHeader();

  const currentUser = getCurrentUser();

  if (currentUser) {
    if (elements.landingView) elements.landingView.style.display = 'none';
    if (elements.appWorkspace) elements.appWorkspace.style.display = 'block';

    renderLeagueDropdown();
    renderPlayerDropdowns();
    renderWeekCarousel();
    renderMatchups();
    renderPicksSummary();
    renderStandings();
    renderMatrix();
    renderScoreManager();
  } else {
    if (elements.landingView) elements.landingView.style.display = 'block';
    if (elements.appWorkspace) elements.appWorkspace.style.display = 'none';

    renderLandingScores();
  }
}

/* -------------------------------------------------------------------------- */
/* Player & Week Renderers                                                    */
/* -------------------------------------------------------------------------- */

function renderPlayerDropdowns() {
  const players = state.league.players;
  const activeId = state.league.activePlayerId;

  if (elements.playerDropdown) {
    elements.playerDropdown.innerHTML = players
      .map(p => `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${p.avatar} ${p.name}</option>`)
      .join('');
  }

  if (elements.matrixPlayerSelect) {
    elements.matrixPlayerSelect.innerHTML = players
      .map(p => `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${p.avatar} ${p.name}</option>`)
      .join('');
  }
}

function renderWeekCarousel() {
  const activePlayer = getActivePlayer();
  const playerPicks = activePlayer?.picks || {};
  let html = '';

  for (let w = 1; w <= 18; w++) {
    const hasPick = !!(playerPicks[`week${w}`]?.winnerTeamId || playerPicks[`week${w}`]?.loserTeamId);
    const isActive = w === state.currentWeek;
    html += `
      <div class="week-pill ${isActive ? 'active' : ''} ${hasPick ? 'has-picks' : ''}" data-week="${w}">
        <span>Week ${w}</span>
        <div class="week-status-dot"></div>
      </div>
    `;
  }

  if (elements.weekCarousel) {
    elements.weekCarousel.innerHTML = html;
    const activePill = elements.weekCarousel.querySelector('.week-pill.active');
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Matchups & Pick Buttons Renderer                                          */
/* -------------------------------------------------------------------------- */

function renderMatchups() {
  const weekData = state.league.schedule.find(w => w.week === state.currentWeek);
  if (!weekData) return;

  if (elements.weekTitle) elements.weekTitle.textContent = `Week ${state.currentWeek} Matchups`;
  
  if (!weekData.games || weekData.games.length === 0) {
    if (elements.weekStatusBadge) {
      elements.weekStatusBadge.textContent = 'FETCHING ESPN SCHEDULE';
      elements.weekStatusBadge.className = 'game-status-badge scheduled';
    }
    if (elements.matchupsGrid) {
      elements.matchupsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
          <div style="font-size: 2.2rem; margin-bottom: 12px; animation: pulse 1.5s infinite;">🌐</div>
          <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 6px;">Fetching Real 2026 NFL Schedule...</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem;">Loading official matchups directly from ESPN API...</p>
        </div>
      `;
    }
    return;
  }

  const allFinal = weekData.games.every(g => g.status === 'FINAL');
  if (elements.weekStatusBadge) {
    elements.weekStatusBadge.textContent = allFinal ? 'FINAL SCORES' : 'SCHEDULED';
    elements.weekStatusBadge.className = `game-status-badge ${allFinal ? 'final' : 'scheduled'}`;
  }

  const activePlayer = getActivePlayer();
  const currentWeekPicks = activePlayer.picks?.[`week${state.currentWeek}`] || {};
  const usedTeamsMap = getPlayerUsedTeamsMap(activePlayer.picks);

  if (elements.matchupsGrid) {
    elements.matchupsGrid.innerHTML = weekData.games.map(game => {
      const homeTeam = NFL_TEAMS[game.home] || { name: game.home, city: '', primaryColor: '#333', logoSvg: '' };
      const awayTeam = NFL_TEAMS[game.away] || { name: game.away, city: '', primaryColor: '#333', logoSvg: '' };

      return `
        <div class="matchup-card" data-game-id="${game.id}">
          <div class="matchup-header">
            <span>${awayTeam.city} @ ${homeTeam.city}</span>
            <span class="game-status-badge ${game.status === 'FINAL' ? 'final' : 'scheduled'}">${game.status}</span>
          </div>

          <!-- Away Team Row -->
          ${renderTeamRow(game.away, awayTeam, game.awayScore, game.homeScore, game.status, currentWeekPicks, usedTeamsMap)}

          <!-- Home Team Row -->
          ${renderTeamRow(game.home, homeTeam, game.homeScore, game.awayScore, game.status, currentWeekPicks, usedTeamsMap)}
        </div>
      `;
    }).join('');
  }
}

function renderTeamRow(teamId, teamData, score, oppScore, status, currentWeekPicks, usedTeamsMap) {
  const isWinnerSelected = currentWeekPicks.winnerTeamId === teamId;
  const isLoserSelected = currentWeekPicks.loserTeamId === teamId;

  const burntEntry = usedTeamsMap[teamId];
  let isBurnt = false;
  let burntLabel = '';

  if (burntEntry) {
    if (burntEntry.week !== state.currentWeek) {
      isBurnt = true;
      burntLabel = `Used Wk ${burntEntry.week}`;
    }
  }

  const scoreDisplay = status === 'FINAL' ? score : '-';

  return `
    <div class="team-row">
      <div class="team-info">
        <div class="team-logo-badge" style="background: ${teamData.primaryColor}22;">
          ${teamData.logoSvg}
        </div>
        <div>
          <div class="team-name">${teamData.name}</div>
          <div class="team-city">${teamData.city}</div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 14px;">
        <div class="team-score">${scoreDisplay}</div>

        <div class="pick-actions">
          ${isBurnt ? `
            <span class="burnt-badge">${burntLabel}</span>
          ` : `
            <button class="btn-pick winner ${isWinnerSelected ? 'selected' : ''}" 
                    data-team="${teamId}" data-type="WINNER">
              ${isWinnerSelected ? '✓ WINNER' : '+ WIN'}
            </button>
            <button class="btn-pick loser ${isLoserSelected ? 'selected' : ''}" 
                    data-team="${teamId}" data-type="LOSER">
              ${isLoserSelected ? '✓ LOSER' : '+ LOSS'}
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Sidebar Summary Renderer                                                  */
/* -------------------------------------------------------------------------- */

function renderPicksSummary() {
  const activePlayer = getActivePlayer();
  if (elements.activePlayerBadge) {
    elements.activePlayerBadge.textContent = `${activePlayer.avatar} ${activePlayer.name}`;
  }

  const currentWeekPicks = activePlayer.picks?.[`week${state.currentWeek}`] || {};
  const weekData = state.league.schedule.find(w => w.week === state.currentWeek);

  let totalPts = 0;

  if (currentWeekPicks.winnerTeamId) {
    const team = NFL_TEAMS[currentWeekPicks.winnerTeamId] || { name: currentWeekPicks.winnerTeamId, city: '' };
    const game = weekData?.games?.find(g => g.home === team.id || g.away === team.id);
    const scoreRes = calculatePickScore(team.id, 'WINNER', game);

    if (elements.singlePickSummaryBox) elements.singlePickSummaryBox.className = 'summary-pick-item active-winner';
    if (elements.pickTypeTag) {
      elements.pickTypeTag.className = 'pick-type-tag winner';
      elements.pickTypeTag.textContent = 'BLOWOUT WINNER PICK';
    }
    if (elements.singlePickTeam) elements.singlePickTeam.textContent = `${team.city} ${team.name}`;

    if (scoreRes.status === 'COMPLETED') {
      const ptsPrefix = scoreRes.points > 0 ? '+' : '';
      if (elements.singlePickPts) {
        elements.singlePickPts.textContent = `${ptsPrefix}${scoreRes.points} pts`;
        elements.singlePickPts.style.color = scoreRes.points < 0 ? 'var(--color-red)' : 'var(--color-gold)';
      }
      totalPts = scoreRes.points;
    } else {
      if (elements.singlePickPts) {
        elements.singlePickPts.textContent = 'Pending';
        elements.singlePickPts.style.color = 'var(--color-gold)';
      }
    }
  } else if (currentWeekPicks.loserTeamId) {
    const team = NFL_TEAMS[currentWeekPicks.loserTeamId] || { name: currentWeekPicks.loserTeamId, city: '' };
    const game = weekData?.games?.find(g => g.home === team.id || g.away === team.id);
    const scoreRes = calculatePickScore(team.id, 'LOSER', game);

    if (elements.singlePickSummaryBox) elements.singlePickSummaryBox.className = 'summary-pick-item active-loser';
    if (elements.pickTypeTag) {
      elements.pickTypeTag.className = 'pick-type-tag loser';
      elements.pickTypeTag.textContent = 'BLOWOUT LOSER PICK';
    }
    if (elements.singlePickTeam) elements.singlePickTeam.textContent = `${team.city} ${team.name}`;

    if (scoreRes.status === 'COMPLETED') {
      const ptsPrefix = scoreRes.points > 0 ? '+' : '';
      if (elements.singlePickPts) {
        elements.singlePickPts.textContent = `${ptsPrefix}${scoreRes.points} pts`;
        elements.singlePickPts.style.color = scoreRes.points < 0 ? 'var(--color-red)' : 'var(--color-gold)';
      }
      totalPts = scoreRes.points;
    } else {
      if (elements.singlePickPts) {
        elements.singlePickPts.textContent = 'Pending';
        elements.singlePickPts.style.color = 'var(--color-gold)';
      }
    }
  } else {
    if (elements.singlePickSummaryBox) elements.singlePickSummaryBox.className = 'summary-pick-item';
    if (elements.pickTypeTag) {
      elements.pickTypeTag.className = 'pick-type-tag winner';
      elements.pickTypeTag.textContent = 'WEEK SELECTION';
    }
    if (elements.singlePickTeam) elements.singlePickTeam.textContent = 'None Selected';
    if (elements.singlePickPts) {
      elements.singlePickPts.textContent = '0 pts';
      elements.singlePickPts.style.color = 'var(--color-gold)';
    }
  }

  const totalPrefix = totalPts > 0 ? '+' : '';
  if (elements.totalWeekPts) {
    elements.totalWeekPts.textContent = `${totalPrefix}${totalPts} PTS`;
    elements.totalWeekPts.style.color = totalPts < 0 ? 'var(--color-red)' : 'var(--color-green)';
  }
}

/* -------------------------------------------------------------------------- */
/* Standings & Leaderboard Renderer                                          */
/* -------------------------------------------------------------------------- */

function renderStandings() {
  const standings = calculateStandings(state.league.players, state.league.schedule);

  if (elements.standingsTableBody) {
    elements.standingsTableBody.innerHTML = standings.map(p => {
      let rankBadgeClass = '';
      if (p.rank === 1) rankBadgeClass = 'rank-1';
      else if (p.rank === 2) rankBadgeClass = 'rank-2';
      else if (p.rank === 3) rankBadgeClass = 'rank-3';

      return `
        <tr class="leaderboard-row">
          <td>
            <div class="rank-badge ${rankBadgeClass}">
              ${p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank}
            </div>
          </td>
          <td>
            <div class="player-info-cell">
              <span class="player-avatar">${p.avatar}</span>
              <span class="player-name-text">${p.name}</span>
            </div>
          </td>
          <td class="total-pts-text" style="color: ${p.totalPoints < 0 ? 'var(--color-red)' : 'var(--color-green)'};">${p.totalPoints > 0 ? '+' : ''}${p.totalPoints} pts</td>
          <td style="font-weight: 700;">${p.totalCorrectPicks} / ${p.totalPicksMade}</td>
          <td style="color: var(--color-cyan); font-weight: 700;">${p.accuracyPct}%</td>
          <td style="color: var(--color-gold); font-weight: 700;">+${p.maxBlowoutPoints} pts</td>
        </tr>
      `;
    }).join('');
  }
}

/* -------------------------------------------------------------------------- */
/* Used Teams Matrix Renderer                                                */
/* -------------------------------------------------------------------------- */

function renderMatrix() {
  const selectedPlayerId = elements.matrixPlayerSelect?.value || state.league.activePlayerId;
  const player = state.league.players.find(p => p.id === selectedPlayerId);

  if (!player) return;

  const usedMap = getPlayerUsedTeamsMap(player.picks);

  if (elements.teamsGrid) {
    elements.teamsGrid.innerHTML = Object.values(NFL_TEAMS).map(team => {
      const usedEntry = usedMap[team.id];
      const isUsed = !!usedEntry;

      return `
        <div class="matrix-team-card ${isUsed ? 'used' : 'available'}">
          ${isUsed ? `
            <span class="matrix-used-tag ${usedEntry.type.toLowerCase()}">
              Wk ${usedEntry.week} ${usedEntry.type}
            </span>
          ` : ''}
          <div class="team-logo-badge" style="width: 44px; height: 44px; margin-bottom: 8px;">
            ${team.logoSvg}
          </div>
          <div style="font-weight: 800; font-size: 0.9rem;">${team.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${team.id}</div>
        </div>
      `;
    }).join('');
  }
}

/* -------------------------------------------------------------------------- */
/* Score Manager Renderer                                                     */
/* -------------------------------------------------------------------------- */

function populateScoreWeekDropdown() {
  if (elements.scoreWeekDropdown) {
    elements.scoreWeekDropdown.innerHTML = Array.from({ length: 18 }, (_, i) => i + 1)
      .map(w => `<option value="${w}">Week ${w}</option>`).join('');
  }
}

function renderScoreManager() {
  const editWeek = parseInt(elements.scoreWeekDropdown?.value || '1', 10);
  const weekData = state.league.schedule.find(w => w.week === editWeek);

  if (!weekData || !elements.scoreEditorGrid) return;

  elements.scoreEditorGrid.innerHTML = weekData.games.map(game => {
    const homeTeam = NFL_TEAMS[game.home] || { name: game.home, id: game.home };
    const awayTeam = NFL_TEAMS[game.away] || { name: game.away, id: game.away };

    return `
      <div class="matchup-card" style="padding: 14px;">
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">
          ${awayTeam.name} @ ${homeTeam.name}
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
          <div>
            <label style="font-size: 0.75rem; color: var(--text-muted);">${awayTeam.id} Score:</label>
            <input type="number" value="${game.awayScore ?? ''}" data-game-id="${game.id}" data-team="away" class="score-input" style="width: 100%; padding: 6px; border-radius: 6px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); color: #FFF; font-weight: 800;">
          </div>
          <div>
            <label style="font-size: 0.75rem; color: var(--text-muted);">${homeTeam.id} Score:</label>
            <input type="number" value="${game.homeScore ?? ''}" data-game-id="${game.id}" data-team="home" class="score-input" style="width: 100%; padding: 6px; border-radius: 6px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); color: #FFF; font-weight: 800;">
          </div>
        </div>

        <button class="btn btn-secondary btn-save-score" data-game-id="${game.id}" style="width: 100%; justify-content: center; padding: 6px; font-size: 0.75rem;">
          💾 Save Game Score
        </button>
      </div>
    `;
  }).join('');
}

/* -------------------------------------------------------------------------- */
/* Admin Control Panel Renderer                                              */
/* -------------------------------------------------------------------------- */

function renderAdminUserList() {
  if (!elements.adminUserList) return;

  const accounts = getAccounts();
  elements.adminUserList.innerHTML = accounts.map(acc => {
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.4rem;">${acc.avatar}</span>
          <div>
            <div style="font-weight: 800; font-size: 0.95rem;">${acc.name} <span style="font-size: 0.75rem; color: var(--text-muted);">(@${acc.username})</span></div>
            <span style="font-size: 0.65rem; font-weight: 800; color: ${acc.role === 'ADMIN' ? 'var(--color-gold)' : 'var(--color-green)'};">${acc.role}</span>
          </div>
        </div>

        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-admin-reset" data-user-id="${acc.id}" style="padding: 4px 10px; font-size: 0.75rem;">
            🔑 Reset Pass
          </button>
          <button class="btn btn-secondary btn-admin-role" data-user-id="${acc.id}" style="padding: 4px 10px; font-size: 0.75rem;">
            ${acc.role === 'ADMIN' ? 'Demote User' : 'Promote Admin'}
          </button>
          <button class="btn btn-secondary btn-admin-delete" data-user-id="${acc.id}" style="color: var(--color-red); border-color: rgba(239,68,68,0.3); padding: 4px 10px; font-size: 0.75rem;">
            🗑️ Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/* -------------------------------------------------------------------------- */
/* Event Listeners Setup                                                     */
/* -------------------------------------------------------------------------- */

function setupEventListeners() {
  // League Hub Event Handlers
  elements.leagueDropdown?.addEventListener('change', (e) => {
    const selectedLeagueId = e.target.value;
    setActiveLeagueId(selectedLeagueId);
    state.league = loadLeagueData();
    renderAll();
    showToast(`Switched to league: ${state.league.leagueName}`);
  });

  elements.btnOpenLeagueHub?.addEventListener('click', () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      showToast('🔐 Please sign in to create or join leagues!', 'error');
      elements.modalAuth?.classList.add('active');
      return;
    }
    renderMyLeaguesList();
    elements.modalLeagueHub?.classList.add('active');
  });

  elements.tabLeagueCreate?.addEventListener('click', () => {
    if (elements.formCreateLeague) elements.formCreateLeague.style.display = 'block';
    if (elements.formJoinLeague) elements.formJoinLeague.style.display = 'none';
    if (elements.containerMyLeagues) elements.containerMyLeagues.style.display = 'none';
    elements.tabLeagueCreate?.classList.add('active');
    elements.tabLeagueJoin?.classList.remove('active');
    elements.tabLeagueMy?.classList.remove('active');
  });

  elements.tabLeagueJoin?.addEventListener('click', () => {
    if (elements.formCreateLeague) elements.formCreateLeague.style.display = 'none';
    if (elements.formJoinLeague) elements.formJoinLeague.style.display = 'block';
    if (elements.containerMyLeagues) elements.containerMyLeagues.style.display = 'none';
    elements.tabLeagueJoin?.classList.add('active');
    elements.tabLeagueCreate?.classList.remove('active');
    elements.tabLeagueMy?.classList.remove('active');
  });

  elements.tabLeagueMy?.addEventListener('click', () => {
    if (elements.formCreateLeague) elements.formCreateLeague.style.display = 'none';
    if (elements.formJoinLeague) elements.formJoinLeague.style.display = 'none';
    if (elements.containerMyLeagues) elements.containerMyLeagues.style.display = 'block';
    elements.tabLeagueMy?.classList.add('active');
    elements.tabLeagueCreate?.classList.remove('active');
    elements.tabLeagueJoin?.classList.remove('active');
    renderMyLeaguesList();
  });

  elements.formCreateLeague?.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentUser = getCurrentUser();
    if (!currentUser) {
      showToast('🔐 Please sign in first!', 'error');
      elements.modalAuth?.classList.add('active');
      return;
    }

    const name = document.getElementById('createLeagueName').value;
    const code = document.getElementById('createLeagueCode').value;

    const res = createNewLeague(name, code, currentUser);
    if (res.success) {
      state.league = res.league;
      elements.modalLeagueHub?.classList.remove('active');
      document.getElementById('createLeagueName').value = '';
      document.getElementById('createLeagueCode').value = '';
      renderAll();
      showToast(`🏆 Created & launched "${res.league.leagueName}"! You are Commissioner.`);
    } else {
      showToast(res.error, 'error');
    }
  });

  elements.formJoinLeague?.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentUser = getCurrentUser();
    if (!currentUser) {
      showToast('🔐 Please sign in first!', 'error');
      elements.modalAuth?.classList.add('active');
      return;
    }

    const code = document.getElementById('joinLeagueCode').value;
    const res = joinLeagueByCode(code, currentUser);
    if (res.success) {
      state.league = res.league;
      elements.modalLeagueHub?.classList.remove('active');
      document.getElementById('joinLeagueCode').value = '';
      renderAll();
      showToast(`🏆 Joined "${res.league.leagueName}"!`);
    } else {
      showToast(res.error, 'error');
    }
  });

  elements.containerMyLeagues?.addEventListener('click', (e) => {
    const switchBtn = e.target.closest('.btn-switch-league');
    if (!switchBtn) return;

    const leagueId = switchBtn.dataset.leagueId;
    setActiveLeagueId(leagueId);
    state.league = loadLeagueData();
    elements.modalLeagueHub?.classList.remove('active');
    renderAll();
    showToast(`Switched to league: ${state.league.leagueName}`);
  });

  // Navigation Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.style.display = 'block';

      if (targetId === 'tabStandings') renderStandings();
      if (targetId === 'tabMatrix') renderMatrix();
      if (targetId === 'tabScores') renderScoreManager();
    });
  });

  // Week Pill Selection
  elements.weekCarousel?.addEventListener('click', async (e) => {
    const pill = e.target.closest('.week-pill');
    if (pill) {
      state.currentWeek = parseInt(pill.dataset.week, 10);
      renderWeekCarousel();
      renderMatchups();
      renderPicksSummary();
      await autoSyncWeekSchedule(state.currentWeek);
    }
  });

  elements.btnPrevWeek?.addEventListener('click', async () => {
    if (state.currentWeek > 1) {
      state.currentWeek--;
      renderWeekCarousel();
      renderMatchups();
      renderPicksSummary();
      await autoSyncWeekSchedule(state.currentWeek);
    }
  });

  elements.btnNextWeek?.addEventListener('click', async () => {
    if (state.currentWeek < 18) {
      state.currentWeek++;
      renderWeekCarousel();
      renderMatchups();
      renderPicksSummary();
      await autoSyncWeekSchedule(state.currentWeek);
    }
  });

  // Active Player Switcher
  elements.playerDropdown?.addEventListener('change', (e) => {
    state.league.activePlayerId = e.target.value;
    saveLeagueData(state.league);
    renderAll();
    showToast(`Switched active player to ${getActivePlayer().name}`);
  });

  elements.matrixPlayerSelect?.addEventListener('change', () => {
    renderMatrix();
  });

  elements.scoreWeekDropdown?.addEventListener('change', () => {
    renderScoreManager();
  });

  // Pick Button Click Delegation (Single Pick Per Week & Survivor Rule Enforced)
  elements.matchupsGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-pick');
    if (!btn || btn.disabled) return;

    const currentUser = getCurrentUser();
    if (!currentUser) {
      showToast('🔐 Please sign in to your account to make picks!', 'error');
      elements.modalAuth?.classList.add('active');
      return;
    }

    if (!isAdmin()) {
      state.league.activePlayerId = currentUser.userId;
    }
    const activePlayer = getActivePlayer();

    const teamId = btn.dataset.team;
    const pickType = btn.dataset.type; // 'WINNER' or 'LOSER'

    if (!activePlayer.picks) activePlayer.picks = {};
    if (!activePlayer.picks[`week${state.currentWeek}`]) {
      activePlayer.picks[`week${state.currentWeek}`] = { winnerTeamId: null, loserTeamId: null };
    }

    const weekPicks = activePlayer.picks[`week${state.currentWeek}`];

    if (pickType === 'WINNER') {
      if (weekPicks.winnerTeamId === teamId) {
        weekPicks.winnerTeamId = null;
      } else {
        if (isTeamUsedByPlayer(activePlayer.picks, teamId, state.currentWeek)) {
          showToast(`Cannot pick ${teamId}: Team has already been used in another week!`, 'error');
          return;
        }
        weekPicks.winnerTeamId = teamId;
        weekPicks.loserTeamId = null;
      }
    } else if (pickType === 'LOSER') {
      if (weekPicks.loserTeamId === teamId) {
        weekPicks.loserTeamId = null;
      } else {
        if (isTeamUsedByPlayer(activePlayer.picks, teamId, state.currentWeek)) {
          showToast(`Cannot pick ${teamId}: Team has already been used in another week!`, 'error');
          return;
        }
        weekPicks.loserTeamId = teamId;
        weekPicks.winnerTeamId = null;
      }
    }

    saveLeagueData(state.league);
    renderMatchups();
    renderPicksSummary();
    renderWeekCarousel();
    showToast(`Week ${state.currentWeek} pick updated for ${activePlayer.name}`);
  });

  // Clear Week Picks
  elements.btnClearPicks?.addEventListener('click', () => {
    const activePlayer = getActivePlayer();
    if (activePlayer.picks?.[`week${state.currentWeek}`]) {
      activePlayer.picks[`week${state.currentWeek}`] = { winnerTeamId: null, loserTeamId: null };
      saveLeagueData(state.league);
      renderMatchups();
      renderPicksSummary();
      renderWeekCarousel();
      showToast('Cleared week picks');
    }
  });

  // Score Simulation Button
  elements.btnSimulateWeek?.addEventListener('click', () => {
    const editWeek = parseInt(elements.scoreWeekDropdown.value, 10);
    state.league.schedule = simulateWeekScores(state.league.schedule, editWeek);
    saveLeagueData(state.league);
    renderAll();
    showToast(`Simulated Week ${editWeek} game scores!`);
  });

  // Save Game Score in Manager
  elements.scoreEditorGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-save-score');
    if (!btn) return;

    const gameId = btn.dataset.gameId;
    const card = btn.closest('.matchup-card');
    const awayInput = card.querySelector('input[data-team="away"]');
    const homeInput = card.querySelector('input[data-team="home"]');

    const editWeek = parseInt(elements.scoreWeekDropdown.value, 10);
    state.league.schedule = updateGameScore(
      state.league.schedule,
      editWeek,
      gameId,
      homeInput.value,
      awayInput.value,
      true
    );

    saveLeagueData(state.league);
    renderAll();
    showToast('Score updated!');
  });

  // Live Real NFL Data Sync via ESPN API
  elements.btnLiveSync?.addEventListener('click', async () => {
    showToast(`Fetching live 2026 NFL data for Week ${state.currentWeek}...`);
    elements.btnLiveSync.disabled = true;
    
    const res = await fetchLiveNflScores(state.currentWeek, 2026);
    elements.btnLiveSync.disabled = false;

    if (res.success && res.games.length > 0) {
      state.league.schedule = mergeLiveGamesIntoSchedule(state.league.schedule, state.currentWeek, res.games);
      saveLeagueData(state.league);
      renderAll();
      showToast(`Successfully synced ${res.games.length} real NFL games for Week ${state.currentWeek}!`);
    } else {
      showToast(`Could not fetch live scores: ${res.error || 'No games found for this week'}`, 'error');
    }
  });

  // Global Event Delegation for 100% reliable button click handling
  document.addEventListener('click', (e) => {
    const target = e.target;
    
    // Sign In Button Click
    const signInBtn = target.closest('#btnSignIn, #btnLandingSignIn');
    if (signInBtn) {
      e.preventDefault();
      if (elements.formLogin) elements.formLogin.style.display = 'block';
      if (elements.formRegister) elements.formRegister.style.display = 'none';
      elements.tabAuthLogin?.classList.add('active');
      elements.tabAuthRegister?.classList.remove('active');
      elements.modalAuth?.classList.add('active');
      return;
    }

    // Register Button Click
    const regBtn = target.closest('#btnRegister, #btnLandingRegister');
    if (regBtn) {
      e.preventDefault();
      if (elements.formLogin) elements.formLogin.style.display = 'none';
      if (elements.formRegister) elements.formRegister.style.display = 'block';
      elements.tabAuthRegister?.classList.add('active');
      elements.tabAuthLogin?.classList.remove('active');
      elements.modalAuth?.classList.add('active');
      return;
    }

    // Rules Button Click
    const rulesBtn = target.closest('#btnRules');
    if (rulesBtn) {
      e.preventDefault();
      elements.modalRules?.classList.add('active');
      return;
    }

    // Export / Import Sync Button Click
    const exportBtn = target.closest('#btnExportImport');
    if (exportBtn) {
      e.preventDefault();
      const config = getSavedFirebaseConfig();
      if (config) {
        if (document.getElementById('fbApiKey')) document.getElementById('fbApiKey').value = config.apiKey || '';
        if (document.getElementById('fbDatabaseUrl')) document.getElementById('fbDatabaseUrl').value = config.databaseURL || '';
        if (document.getElementById('fbProjectId')) document.getElementById('fbProjectId').value = config.projectId || '';
      }
      elements.modalExportImport?.classList.add('active');
      return;
    }

    // League Hub Button Click
    const leagueHubBtn = target.closest('#btnOpenLeagueHub');
    if (leagueHubBtn) {
      e.preventDefault();
      elements.modalLeagueHub?.classList.add('active');
      return;
    }

    // Close Modal Button Click
    const closeBtn = target.closest('.close-modal');
    if (closeBtn) {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      return;
    }

    // Modal Backdrop Click
    if (target.classList.contains('modal-overlay')) {
      target.classList.remove('active');
      return;
    }
  });

  elements.btnLandingLiveSync?.addEventListener('click', async () => {
    showToast(`Fetching live 2026 NFL scores for Week ${state.currentWeek}...`);
    if (elements.btnLandingLiveSync) elements.btnLandingLiveSync.disabled = true;
    const res = await fetchLiveNflScores(state.currentWeek, 2026);
    if (elements.btnLandingLiveSync) elements.btnLandingLiveSync.disabled = false;

    if (res.success && res.games.length > 0) {
      state.league.schedule = mergeLiveGamesIntoSchedule(state.league.schedule, state.currentWeek, res.games);
      saveLeagueData(state.league);
      renderLandingScores();
      showToast(`Synced ${res.games.length} real NFL scores!`);
    } else {
      showToast(`Could not fetch live scores: ${res.error || 'No games found'}`, 'error');
    }
  });

  elements.tabAuthLogin?.addEventListener('click', () => {
    if (elements.formLogin) elements.formLogin.style.display = 'block';
    if (elements.formRegister) elements.formRegister.style.display = 'none';
    elements.tabAuthLogin?.classList.add('active');
    elements.tabAuthRegister?.classList.remove('active');
  });

  elements.tabAuthRegister?.addEventListener('click', () => {
    if (elements.formLogin) elements.formLogin.style.display = 'none';
    if (elements.formRegister) elements.formRegister.style.display = 'block';
    elements.tabAuthRegister?.classList.add('active');
    elements.tabAuthLogin?.classList.remove('active');
  });

  elements.formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value;
    const p = document.getElementById('loginPassword').value;
    const res = await loginUser(u, p);
    if (res.success) {
      elements.modalAuth?.classList.remove('active');
      renderAll();
      showToast(`Welcome back, ${res.user.name}!`);
    } else {
      showToast(res.error, 'error');
    }
  });

  elements.formRegister?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const u = document.getElementById('regUsername').value;
    const p = document.getElementById('regPassword').value;
    const avatar = state.selectedRegAvatar || '🏈';
    const res = await registerUser(name, u, p, avatar);
    if (res.success) {
      elements.modalAuth?.classList.remove('active');
      renderAll();
      showToast(`Account created! Welcome, ${res.user.name}!`);
    } else {
      showToast(res.error, 'error');
    }
  });

  elements.btnSignOut?.addEventListener('click', () => {
    logoutUser();
    renderAll();
    showToast('Signed out of account.');
  });

  // Admin Control Panel Handlers
  elements.btnAdminPanel?.addEventListener('click', () => {
    if (!isAdmin()) {
      showToast('Admin privileges required.', 'error');
      return;
    }
    renderAdminUserList();
    elements.modalAdmin?.classList.add('active');
  });

  elements.adminUserList?.addEventListener('click', async (e) => {
    const resetBtn = e.target.closest('.btn-admin-reset');
    const roleBtn = e.target.closest('.btn-admin-role');
    const deleteBtn = e.target.closest('.btn-admin-delete');

    if (resetBtn) {
      const userId = resetBtn.dataset.userId;
      const newPass = prompt('Enter new password for this user:');
      if (newPass && newPass.length >= 4) {
        const res = await adminUpdateUser(userId, { password: newPass });
        if (res.success) showToast('Password reset successfully!');
        else showToast(res.error, 'error');
      }
    } else if (roleBtn) {
      const userId = roleBtn.dataset.userId;
      const accounts = getAccounts();
      const target = accounts.find(a => a.id === userId);
      const newRole = target.role === 'ADMIN' ? 'USER' : 'ADMIN';
      const res = await adminUpdateUser(userId, { role: newRole });
      if (res.success) {
        renderAdminUserList();
        renderAll();
        showToast(`User role updated to ${newRole}`);
      } else {
        showToast(res.error, 'error');
      }
    } else if (deleteBtn) {
      const userId = deleteBtn.dataset.userId;
      if (confirm('Are you sure you want to delete this user account?')) {
        const res = adminDeleteUser(userId);
        if (res.success) {
          state.league.players = state.league.players.filter(p => p.id !== userId);
          saveLeagueData(state.league);
          renderAdminUserList();
          renderAll();
          showToast('User account deleted.');
        } else {
          showToast(res.error, 'error');
        }
      }
    }
  });

  elements.formAdminAddUser?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('adminNewName').value;
    const u = document.getElementById('adminNewUsername').value;
    const p = document.getElementById('adminNewPassword').value;
    const role = document.getElementById('adminNewRole').value;

    const res = await registerUser(name, u, p, '🏈', role);
    if (res.success) {
      document.getElementById('adminNewName').value = '';
      document.getElementById('adminNewUsername').value = '';
      document.getElementById('adminNewPassword').value = '';
      renderAdminUserList();
      renderAll();
      showToast(`User account created for ${name}!`);
    } else {
      showToast(res.error, 'error');
    }
  });

  document.getElementById('regAvatarOptions')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('reg-avatar-opt')) {
      document.querySelectorAll('.reg-avatar-opt').forEach(opt => opt.style.transform = 'scale(1)');
      e.target.style.transform = 'scale(1.4)';
      state.selectedRegAvatar = e.target.textContent;
    }
  });

  // Modal Triggers
  elements.btnRules?.addEventListener('click', () => elements.modalRules?.classList.add('active'));
  elements.btnExportImport?.addEventListener('click', () => {
    const config = getSavedFirebaseConfig();
    if (config) {
      if (document.getElementById('fbApiKey')) document.getElementById('fbApiKey').value = config.apiKey || '';
      if (document.getElementById('fbDatabaseUrl')) document.getElementById('fbDatabaseUrl').value = config.databaseURL || '';
      if (document.getElementById('fbProjectId')) document.getElementById('fbProjectId').value = config.projectId || '';
    }
    elements.modalExportImport?.classList.add('active');
  });

  elements.formFirebaseConfig?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const apiKey = document.getElementById('fbApiKey').value.trim();
    const databaseURL = document.getElementById('fbDatabaseUrl').value.trim();
    const projectId = document.getElementById('fbProjectId').value.trim();

    if (!apiKey || !databaseURL) {
      showToast('Please enter apiKey and databaseURL.', 'error');
      return;
    }

    const config = { apiKey, databaseURL, projectId };
    saveFirebaseConfig(config);
    const res = await initCloudDatabase();
    if (res.success) {
      elements.modalExportImport?.classList.remove('active');
      saveLeagueData(state.league);
      showToast('🔥 Firebase connected! Synced live across all computers.');
    } else {
      showToast('Firebase connection failed. Check your keys.', 'error');
    }
  });

  elements.btnClearFirebase?.addEventListener('click', () => {
    saveFirebaseConfig(null);
    if (document.getElementById('fbApiKey')) document.getElementById('fbApiKey').value = '';
    if (document.getElementById('fbDatabaseUrl')) document.getElementById('fbDatabaseUrl').value = '';
    if (document.getElementById('fbProjectId')) document.getElementById('fbProjectId').value = '';
    showToast('Disconnected Firebase database.');
  });

  elements.btnShareLeaderboard?.addEventListener('click', () => {
    const standings = calculateStandings(state.league.players, state.league.schedule);
    let summaryText = `🏆 ${state.league.leagueName} Standings 🏆\n\n`;
    standings.forEach(p => {
      summaryText += `${p.rank}. ${p.avatar} ${p.name} - ${p.totalPoints} pts (${p.accuracyPct}% acc)\n`;
    });
    summaryText += `\nPlay NFL Blowout Pick'em on GitHub Pages!`;

    navigator.clipboard.writeText(summaryText).then(() => {
      showToast('Standings copied to clipboard!');
    });
  });

  elements.btnExportFile?.addEventListener('click', () => {
    exportLeagueJson(state.league);
  });

  elements.inputImportFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const res = importLeagueJson(event.target.result);
      if (res.success) {
        state.league = res.data;
        renderAll();
        showToast('League data successfully imported!');
        elements.modalExportImport?.classList.remove('active');
      } else {
        showToast(`Import error: ${res.error}`, 'error');
      }
    };
    reader.readAsText(file);
  });

  elements.btnResetLeague?.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset the league to default settings?')) {
      state.league = resetToDefaultLeague();
      renderAll();
      showToast('League reset to defaults!');
      elements.modalExportImport?.classList.remove('active');
    }
  });

  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });
}
