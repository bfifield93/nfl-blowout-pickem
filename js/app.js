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
  exportLeagueJson,
  importLeagueJson,
  resetToDefaultLeague
} from './storage.js';
import { simulateWeekScores, updateGameScore } from './mockScores.js';
import { fetchLiveNflScores, mergeLiveGamesIntoSchedule } from './nflApi.js';

// Application State
let state = {
  league: loadLeagueData(),
  currentWeek: 1,
  selectedAvatar: '🏈'
};

// DOM Element Selectors
const elements = {
  playerDropdown: document.getElementById('playerDropdown'),
  matrixPlayerSelect: document.getElementById('matrixPlayerSelect'),
  scoreWeekDropdown: document.getElementById('scoreWeekDropdown'),
  weekCarousel: document.getElementById('weekCarousel'),
  matchupsGrid: document.getElementById('matchupsGrid'),
  weekTitle: document.getElementById('weekTitle'),
  weekStatusBadge: document.getElementById('weekStatusBadge'),
  activePlayerBadge: document.getElementById('activePlayerBadge'),
  winnerSummaryBox: document.getElementById('winnerSummaryBox'),
  winnerSummaryTeam: document.getElementById('winnerSummaryTeam'),
  winnerSummaryPts: document.getElementById('winnerSummaryPts'),
  loserSummaryBox: document.getElementById('loserSummaryBox'),
  loserSummaryTeam: document.getElementById('loserSummaryTeam'),
  loserSummaryPts: document.getElementById('loserSummaryPts'),
  totalWeekPts: document.getElementById('totalWeekPts'),
  standingsTableBody: document.getElementById('standingsTableBody'),
  teamsGrid: document.getElementById('teamsGrid'),
  scoreEditorGrid: document.getElementById('scoreEditorGrid'),
  toastContainer: document.getElementById('toastContainer'),
  
  // Modals
  modalAddPlayer: document.getElementById('modalAddPlayer'),
  modalRules: document.getElementById('modalRules'),
  modalExportImport: document.getElementById('modalExportImport'),
  
  // Buttons
  btnAddPlayer: document.getElementById('btnAddPlayer'),
  btnRules: document.getElementById('btnRules'),
  btnLiveSync: document.getElementById('btnLiveSync'),
  btnExportImport: document.getElementById('btnExportImport'),
  btnClearPicks: document.getElementById('btnClearPicks'),
  btnPrevWeek: document.getElementById('btnPrevWeek'),
  btnNextWeek: document.getElementById('btnNextWeek'),
  btnSimulateWeek: document.getElementById('btnSimulateWeek'),
  btnShareLeaderboard: document.getElementById('btnShareLeaderboard'),
  btnExportFile: document.getElementById('btnExportFile'),
  btnResetLeague: document.getElementById('btnResetLeague'),
  inputImportFile: document.getElementById('inputImportFile')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  populateScoreWeekDropdown();
  renderAll();
});

function getActivePlayer() {
  const activeId = state.league.activePlayerId;
  return state.league.players.find(p => p.id === activeId) || state.league.players[0];
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') {
    toast.style.borderColor = 'var(--color-red)';
  }
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function renderAll() {
  renderPlayerDropdowns();
  renderWeekCarousel();
  renderMatchups();
  renderPicksSummary();
  renderStandings();
  renderMatrix();
  renderScoreManager();
}

/* -------------------------------------------------------------------------- */
/* Player & Week Renderers                                                    */
/* -------------------------------------------------------------------------- */

function renderPlayerDropdowns() {
  const players = state.league.players;
  const activeId = state.league.activePlayerId;

  // Header Dropdown
  elements.playerDropdown.innerHTML = players
    .map(p => `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${p.avatar} ${p.name}</option>`)
    .join('');

  // Matrix Filter Dropdown
  elements.matrixPlayerSelect.innerHTML = players
    .map(p => `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${p.avatar} ${p.name}</option>`)
    .join('');
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

  elements.weekCarousel.innerHTML = html;

  // Scroll active pill into view
  const activePill = elements.weekCarousel.querySelector('.week-pill.active');
  if (activePill) {
    activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

/* -------------------------------------------------------------------------- */
/* Matchups & Pick Buttons Renderer                                          */
/* -------------------------------------------------------------------------- */

function renderMatchups() {
  const weekData = state.league.schedule.find(w => w.week === state.currentWeek);
  if (!weekData) return;

  elements.weekTitle.textContent = `Week ${state.currentWeek} Matchups`;
  
  const allFinal = weekData.games.every(g => g.status === 'FINAL');
  elements.weekStatusBadge.textContent = allFinal ? 'FINAL SCORES' : 'GAMES SCHEDULED';
  elements.weekStatusBadge.className = `game-status-badge ${allFinal ? 'final' : 'scheduled'}`;

  const activePlayer = getActivePlayer();
  const currentWeekPicks = activePlayer.picks?.[`week${state.currentWeek}`] || {};
  const usedTeamsMap = getPlayerUsedTeamsMap(activePlayer.picks);

  elements.matchupsGrid.innerHTML = weekData.games.map(game => {
    const homeTeam = NFL_TEAMS[game.home] || { name: game.home, city: '' };
    const awayTeam = NFL_TEAMS[game.away] || { name: game.away, city: '' };

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

function renderTeamRow(teamId, teamData, score, oppScore, status, currentWeekPicks, usedTeamsMap) {
  const isWinnerSelected = currentWeekPicks.winnerTeamId === teamId;
  const isLoserSelected = currentWeekPicks.loserTeamId === teamId;

  // Survivor check: is team used in another week or opposite pick type?
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
                    data-team="${teamId}" data-type="WINNER" 
                    ${isLoserSelected ? 'disabled' : ''}>
              ${isWinnerSelected ? '✓ WINNER' : '+ WIN'}
            </button>
            <button class="btn-pick loser ${isLoserSelected ? 'selected' : ''}" 
                    data-team="${teamId}" data-type="LOSER" 
                    ${isWinnerSelected ? 'disabled' : ''}>
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
  elements.activePlayerBadge.textContent = `${activePlayer.avatar} ${activePlayer.name}`;

  const currentWeekPicks = activePlayer.picks?.[`week${state.currentWeek}`] || {};
  const weekData = state.league.schedule.find(w => w.week === state.currentWeek);

  let totalPts = 0;

  // Winner Pick Summary
  if (currentWeekPicks.winnerTeamId) {
    const team = NFL_TEAMS[currentWeekPicks.winnerTeamId];
    const game = weekData.games.find(g => g.home === team.id || g.away === team.id);
    const scoreRes = calculatePickScore(team.id, 'WINNER', game);

    elements.winnerSummaryBox.className = 'summary-pick-item active-winner';
    elements.winnerSummaryTeam.textContent = `${team.city} ${team.name}`;
    
    if (scoreRes.status === 'COMPLETED') {
      elements.winnerSummaryPts.textContent = `+${scoreRes.points} pts`;
      totalPts += scoreRes.points;
    } else {
      elements.winnerSummaryPts.textContent = 'Pending';
    }
  } else {
    elements.winnerSummaryBox.className = 'summary-pick-item';
    elements.winnerSummaryTeam.textContent = 'None Selected';
    elements.winnerSummaryPts.textContent = '0 pts';
  }

  // Loser Pick Summary
  if (currentWeekPicks.loserTeamId) {
    const team = NFL_TEAMS[currentWeekPicks.loserTeamId];
    const game = weekData.games.find(g => g.home === team.id || g.away === team.id);
    const scoreRes = calculatePickScore(team.id, 'LOSER', game);

    elements.loserSummaryBox.className = 'summary-pick-item active-loser';
    elements.loserSummaryTeam.textContent = `${team.city} ${team.name}`;

    if (scoreRes.status === 'COMPLETED') {
      elements.loserSummaryPts.textContent = `+${scoreRes.points} pts`;
      totalPts += scoreRes.points;
    } else {
      elements.loserSummaryPts.textContent = 'Pending';
    }
  } else {
    elements.loserSummaryBox.className = 'summary-pick-item';
    elements.loserSummaryTeam.textContent = 'None Selected';
    elements.loserSummaryPts.textContent = '0 pts';
  }

  elements.totalWeekPts.textContent = `${totalPts} PTS`;
}

/* -------------------------------------------------------------------------- */
/* Standings & Leaderboard Renderer                                          */
/* -------------------------------------------------------------------------- */

function renderStandings() {
  const standings = calculateStandings(state.league.players, state.league.schedule);

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
        <td class="total-pts-text">${p.totalPoints} pts</td>
        <td style="font-weight: 700;">${p.totalCorrectPicks} / ${p.totalPicksMade}</td>
        <td style="color: var(--color-cyan); font-weight: 700;">${p.accuracyPct}%</td>
        <td style="color: var(--color-gold); font-weight: 700;">+${p.maxBlowoutPoints} pts</td>
      </tr>
    `;
  }).join('');
}

/* -------------------------------------------------------------------------- */
/* Used Teams Matrix Renderer                                                */
/* -------------------------------------------------------------------------- */

function renderMatrix() {
  const selectedPlayerId = elements.matrixPlayerSelect.value || state.league.activePlayerId;
  const player = state.league.players.find(p => p.id === selectedPlayerId);

  if (!player) return;

  const usedMap = getPlayerUsedTeamsMap(player.picks);

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

/* -------------------------------------------------------------------------- */
/* Score Manager Renderer                                                     */
/* -------------------------------------------------------------------------- */

function populateScoreWeekDropdown() {
  elements.scoreWeekDropdown.innerHTML = Array.from({ length: 18 }, (_, i) => i + 1)
    .map(w => `<option value="${w}">Week ${w}</option>`).join('');
}

function renderScoreManager() {
  const editWeek = parseInt(elements.scoreWeekDropdown.value || '1', 10);
  const weekData = state.league.schedule.find(w => w.week === editWeek);

  if (!weekData) return;

  elements.scoreEditorGrid.innerHTML = weekData.games.map(game => {
    const homeTeam = NFL_TEAMS[game.home];
    const awayTeam = NFL_TEAMS[game.away];

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
/* Event Listeners Setup                                                     */
/* -------------------------------------------------------------------------- */

function setupEventListeners() {
  // Tab Switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
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
  elements.weekCarousel.addEventListener('click', (e) => {
    const pill = e.target.closest('.week-pill');
    if (pill) {
      state.currentWeek = parseInt(pill.dataset.week, 10);
      renderWeekCarousel();
      renderMatchups();
      renderPicksSummary();
    }
  });

  elements.btnPrevWeek.addEventListener('click', () => {
    if (state.currentWeek > 1) {
      state.currentWeek--;
      renderWeekCarousel();
      renderMatchups();
      renderPicksSummary();
    }
  });

  elements.btnNextWeek.addEventListener('click', () => {
    if (state.currentWeek < 18) {
      state.currentWeek++;
      renderWeekCarousel();
      renderMatchups();
      renderPicksSummary();
    }
  });

  // Active Player Switcher
  elements.playerDropdown.addEventListener('change', (e) => {
    state.league.activePlayerId = e.target.value;
    saveLeagueData(state.league);
    renderAll();
    showToast(`Switched active player to ${getActivePlayer().name}`);
  });

  elements.matrixPlayerSelect.addEventListener('change', () => {
    renderMatrix();
  });

  elements.scoreWeekDropdown.addEventListener('change', () => {
    renderScoreManager();
  });

  // Pick Button Click Delegation (Survivor Check Enforced)
  elements.matchupsGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-pick');
    if (!btn || btn.disabled) return;

    const teamId = btn.dataset.team;
    const pickType = btn.dataset.type; // 'WINNER' or 'LOSER'
    const activePlayer = getActivePlayer();

    if (!activePlayer.picks) activePlayer.picks = {};
    if (!activePlayer.picks[`week${state.currentWeek}`]) {
      activePlayer.picks[`week${state.currentWeek}`] = { winnerTeamId: null, loserTeamId: null };
    }

    const weekPicks = activePlayer.picks[`week${state.currentWeek}`];

    // Toggle Pick
    if (pickType === 'WINNER') {
      if (weekPicks.winnerTeamId === teamId) {
        weekPicks.winnerTeamId = null;
      } else {
        // Enforce Survivor Rule
        if (isTeamUsedByPlayer(activePlayer.picks, teamId, state.currentWeek, 'WINNER')) {
          showToast(`Cannot pick ${teamId}: Team has already been used this season!`, 'error');
          return;
        }
        weekPicks.winnerTeamId = teamId;
      }
    } else if (pickType === 'LOSER') {
      if (weekPicks.loserTeamId === teamId) {
        weekPicks.loserTeamId = null;
      } else {
        // Enforce Survivor Rule
        if (isTeamUsedByPlayer(activePlayer.picks, teamId, state.currentWeek, 'LOSER')) {
          showToast(`Cannot pick ${teamId}: Team has already been used this season!`, 'error');
          return;
        }
        weekPicks.loserTeamId = teamId;
      }
    }

    saveLeagueData(state.league);
    renderMatchups();
    renderPicksSummary();
    renderWeekCarousel();
    showToast(`Picks updated for ${activePlayer.name}`);
  });

  // Clear Week Picks
  elements.btnClearPicks.addEventListener('click', () => {
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
  elements.btnSimulateWeek.addEventListener('click', () => {
    const editWeek = parseInt(elements.scoreWeekDropdown.value, 10);
    state.league.schedule = simulateWeekScores(state.league.schedule, editWeek);
    saveLeagueData(state.league);
    renderAll();
    showToast(`Simulated Week ${editWeek} game scores!`);
  });

  // Save Game Score in Manager
  elements.scoreEditorGrid.addEventListener('click', (e) => {
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

  // Copy Leaderboard Summary to Clipboard
  elements.btnShareLeaderboard.addEventListener('click', () => {
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

  // Live Real NFL Data Sync via ESPN API
  if (elements.btnLiveSync) {
    elements.btnLiveSync.addEventListener('click', async () => {
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
  }

  // Export / Import Data
  elements.btnExportFile.addEventListener('click', () => {
    exportLeagueJson(state.league);
  });

  elements.inputImportFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const res = importLeagueJson(event.target.result);
      if (res.success) {
        state.league = res.data;
        renderAll();
        showToast('League data successfully imported!');
        elements.modalExportImport.classList.remove('active');
      } else {
        showToast(`Import error: ${res.error}`, 'error');
      }
    };
    reader.readAsText(file);
  });

  elements.btnResetLeague.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset the league to default settings?')) {
      state.league = resetToDefaultLeague();
      renderAll();
      showToast('League reset to defaults!');
      elements.modalExportImport.classList.remove('active');
    }
  });

  // Modal Triggers
  elements.btnAddPlayer.addEventListener('click', () => elements.modalAddPlayer.classList.add('active'));
  elements.btnRules.addEventListener('click', () => elements.modalRules.classList.add('active'));
  elements.btnExportImport.addEventListener('click', () => elements.modalExportImport.classList.add('active'));

  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  // Avatar Selection in Modal
  document.getElementById('avatarOptions').addEventListener('click', (e) => {
    if (e.target.classList.contains('avatar-opt')) {
      document.querySelectorAll('.avatar-opt').forEach(opt => opt.style.transform = 'scale(1)');
      e.target.style.transform = 'scale(1.4)';
      state.selectedAvatar = e.target.textContent;
    }
  });

  // Add Player Form Submit
  document.getElementById('formAddPlayer').addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('inputPlayerName');
    const name = nameInput.value.trim();
    if (!name) return;

    const newPlayer = {
      id: `p_${Date.now()}`,
      name,
      avatar: state.selectedAvatar || '🏈',
      picks: {}
    };

    state.league.players.push(newPlayer);
    state.league.activePlayerId = newPlayer.id;
    saveLeagueData(state.league);

    nameInput.value = '';
    elements.modalAddPlayer.classList.remove('active');
    renderAll();
    showToast(`Added ${newPlayer.name} to the league!`);
  });
}
