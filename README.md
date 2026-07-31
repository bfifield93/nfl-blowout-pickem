# 🏈 NFL Blowout of the Week Pick'em

An NFL Pick'em web application centered around **Margin of Victory ("Blowout Score")**. Compete against friends across all 18 weeks of the NFL season!

---

## 🏆 League Rules

1. **Blowout Winner Pick**
   - Select **1 winning team** each week predicted to achieve a blowout victory.
   - **Scoring**: You earn points equal to the **Margin of Victory** ($Winner\ Score - Loser\ Score$).
   - *Example*: If your team wins 35-10, you earn **+25 points**. If your team loses, you earn **0 points**.

2. **Blowout Loser Pick**
   - Select **1 losing team** each week predicted to get blown out.
   - **Scoring**: You earn points equal to the **Margin of Defeat** ($Opponent\ Score - Your\ Team\ Score$).
   - *Example*: If your picked team loses 40-10, you earn **+30 points**. If your team wins, you earn **0 points**.

3. **Strict Single-Use Team Constraint ("Survivor Rule")**
   - Each NFL team can only be selected **ONCE per season** by a player, regardless of whether you pick them as a Winner or a Loser!
   - Once a team is picked in any week, they are **locked/burnt** for the rest of the year.

4. **Season Champion**
   - The player with the highest cumulative total points across Weeks 1–18 wins the championship!

---

## 🚀 How to Host on GitHub Pages (Free Setup)

This web application is built with vanilla HTML5, modern CSS3, and ES6 JavaScript. It requires **no build tools, Node.js, or server infrastructure**.

### 1-Click Deployment Steps:
1. Create a new GitHub repository (e.g. `nfl-blowout-pickem`).
2. Push all files from this folder to your repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - NFL Blowout Pick'em"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/nfl-blowout-pickem.git
   git push -u origin main
   ```
3. In your GitHub repository:
   - Go to **Settings** $\rightarrow$ **Pages**.
   - Under **Build and deployment** $\rightarrow$ **Branch**, select `main` and `/ (root)`.
   - Click **Save**.
4. Your site will be live at `https://YOUR_USERNAME.github.io/nfl-blowout-pickem/` in less than a minute!

---

## ✨ Features Included

- **🌐 Live Real 2026 NFL Data Sync**: Integrated ESPN live public scoreboard API engine! Click **🌐 Live NFL Sync** anytime to automatically fetch real 2026 NFL kickoff times, match dates, live game clocks, and final scores for any week.
- **🤖 GitHub Action Automated Score Bot**: Includes `.github/workflows/update-nfl-scores.yml` which runs automatically on GitHub Pages during game days to fetch and commit the latest 2026 scores without manual intervention.
- **NFL Stadium Dark Mode Aesthetic**: Glassmorphic panels, glowing turf green badges, and responsive layouts for mobile and desktop.
- **18-Week Matchup Browser**: 32 NFL Teams with official colors, SVG badges, and week-by-week game schedules.
- **Survivor Used Teams Matrix**: Visual grid showing which teams each player has burnt and remaining available teams.
- **Leaderboard & Breakdown**: Real-time standings with Gold/Silver/Bronze rank medals, total points, pick accuracy %, and max blowout score.
- **Game Score Simulator & Manager**: Commissioner tool to simulate outcomes or input real NFL game scores.
- **Data Sync & JSON Import/Export**: Save and share full league state with friends or copy text summaries directly into group chats!
