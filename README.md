# 🏈 NFL Blowout of the Week Pick'em

An NFL Pick'em web application centered around **Margin of Victory ("Blowout Score")**. Compete against friends across all 18 weeks of the NFL season!

---

## 🏆 League Rules

1. **Single Weekly Pick (Winner or Loser)**
   - Select **ONLY 1 team per week**. That selection can be:
     - **Blowout Winner Pick**:
       - If your team **wins**: Earn **+Margin of Victory** ($Winner\ Score - Loser\ Score$).
       - If your team **loses**: Lose **-Margin of Defeat** ($Loser\ Score - Winner\ Score$ deducted from season total).
     - **Blowout Loser Pick**:
       - If your team **loses**: Earn **+Margin of Defeat** ($Loser\ Score - Winner\ Score$).
       - If your team **wins**: Lose **-Margin of Victory** ($Winner\ Score - Loser\ Score$ deducted from season total).

2. **Strict Single-Use Team Constraint ("Survivor Rule")**
   - Each NFL team can only be selected **ONCE per season** by a player, regardless of whether you pick them as a Winner or a Loser!
   - Once a team is picked in any week, they are **locked/burnt** for the rest of the year.

3. **Season Champion**
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

## ⚡ How to Enable Cross-Computer Sync (Free Cloud Database)

To let players log into accounts, join shared leagues, and view real-time picks from **different computers or phones**:

1. Go to [console.firebase.google.com](https://console.firebase.google.com/) and click **Add project** (Free).
2. Click **Build** $\rightarrow$ **Realtime Database** $\rightarrow$ **Create Database**.
3. Choose **Start in test mode** (allows read/write) and click **Enable**.
4. Go to **Project Settings** (⚙️ gear icon) $\rightarrow$ **General** $\rightarrow$ **Web App (`</>`)** $\rightarrow$ Register App.
5. Copy your web configuration object keys (`apiKey`, `databaseURL`, `projectId`).
6. On your live website, click **`💾 Sync / Data`**, paste your Firebase keys into **🔥 Firebase Realtime Database Keys**, and click **Save & Connect**.
7. Now all picks, accounts, and created leagues will automatically sync live across all devices worldwide!

---

## ✨ Features Included

- **⚡ Real-Time Cloud Database**: Seamless Firebase Realtime Database adapter for instant multi-device data persistence across computers.
- **🏆 Multi-League Hub**: Create custom leagues with unique Invite Join Codes and Creator Commissioner Admin privileges.
- **🔐 User Accounts & Privacy**: Secure account registration and login; players can only edit their own picks.
- **🌐 Live Real 2026 NFL Data Sync**: Integrated ESPN live public scoreboard API engine! Click **🌐 Live NFL Sync** anytime to automatically fetch real 2026 NFL kickoff times, match dates, live game clocks, and final scores for any week.
- **🤖 GitHub Action Automated Score Bot**: Includes `.github/workflows/update-nfl-scores.yml` which runs automatically on GitHub Pages during game days to fetch and commit the latest 2026 scores without manual intervention.
- **NFL Stadium Dark Mode Aesthetic**: Glassmorphic panels, glowing turf green badges, and responsive layouts for mobile and desktop.
- **18-Week Matchup Browser**: 32 NFL Teams with official colors, SVG badges, and week-by-week game schedules.
- **Survivor Used Teams Matrix**: Visual grid showing which teams each player has burnt and remaining available teams.
- **Leaderboard & Breakdown**: Real-time standings with Gold/Silver/Bronze rank medals, total points, pick accuracy %, and max blowout score.
- **Game Score Simulator & Manager**: Commissioner tool to simulate outcomes or input real NFL game scores.
- **Data Sync & JSON Import/Export**: Save and share full league state with friends or copy text summaries directly into group chats!
