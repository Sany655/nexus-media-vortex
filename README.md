# 🎬 Nexus Media Vortex: The Automated AI Creator Studio

**Nexus Media Vortex** is a modern, fully automated production studio that orchestrates content generation across multiple platforms (YouTube, Instagram, TikTok, Facebook, X). It operates on a **"Frontend-First, Server-Enhanced"** architecture using a Next.js real-time Dashboard, Google Gemini AI, and an always-on Python Daemon.

---

## ✨ Key Features

- **🧠 Dual-Brain AI Generation:**
  - **Browser Brain:** Instantly generates text posts (X, Facebook) and image captions directly in your browser using Gemini, completely decoupled from the server.
  - **Server Brain:** Synthesizes voiceovers, downloads assets, and edits full Faceless videos (Shorts/Long-form) via FFmpeg in the background.
- **⚡ Real-Time Cloud Sync:** 100% powered by Firebase Firestore. No local SQLite. Changes in the dashboard or daemon update instantly across all your devices via `onSnapshot` listeners.
- **🛠️ Pipeline Modes:**
  - **Autonomous:** Generates and auto-publishes content directly to your connected channels based on cron schedules.
  - **Manual Review:** Generates content and pauses. You review the script/video in the Dashboard, copy hashtags, and manually hit "Publish".
- **⏰ Missed Schedule Recovery:** If your PC is off and misses a scheduled generation, the dashboard alerts you instantly upon login, allowing you to generate the missed content with one click.
- **✂️ Advanced Video Editor:** FFmpeg-based composer that uses A/B scene splitting, pro-transitions (`xfade`), silence trimming, and random avatar injection to keep viewers hooked.

---

## 📂 Project Architecture

```text
nexus-media-vortex/
│
├── dashboard/               # 🖥️ The Next.js 15 UI (Control Center)
│   ├── src/app/             # Real-time dashboard, settings, review panel
│   ├── src/lib/             # firebase.ts, frontendBrain.ts (In-Browser Gemini)
│   └── package.json         # React/Next.js dependencies
│
├── engine/                  # ⚙️ The Python Backend (Heavy Lifter)
│   ├── nexus_daemon.py      # Always-on orchestrator (listens to Firestore)
│   ├── main.py              # The Video Genesis engine (Script -> Audio -> FFmpeg)
│   ├── modules/             # Downloader, Composer, Firebase DB logic
│   └── assets/              # Where generated videos are saved
│
├── pipeline_architecture.md # Detailed system workflow document
└── README.md                # This file
```

---

## 🛠️ Prerequisites

1. **Node.js (v18+)** - Required for the Next.js Dashboard.
2. **Python 3.10+** - Required for the Daemon.
3. **FFmpeg** - Must be installed and added to your system PATH for video rendering.
4. **Firebase Account** - A Firebase project with Firestore enabled.
5. **API Keys:**
   - Google Gemini API Key
   - Pexels API Key (for stock footage)
   - AssemblyAI / Bark (for voiceover generation)

---

## 🚀 Setup & Installation

### 1. Setup the Cloud (Firebase)
1. Create a Firebase project and enable Firestore.
2. Update `dashboard/.env.local` with your Firebase client config.
3. Place your `firebase_credentials.json` (Service Account Key) inside the `engine/` folder for the Python daemon.

### 2. Start the Dashboard (Frontend)
```bash
cd dashboard
npm install
npm run dev
```
Navigate to `http://localhost:3000` to access the Control Center.

### 3. Start the Engine (Backend)
The Python Daemon needs to run in the background to handle video rendering and auto-publishing.
```bash
python -m venv venv
venv\Scripts\activate
cd engine
pip install -r requirements.txt
python nexus_daemon.py
```
*(Windows Users: The system includes a `start_daemon_hidden.vbs` script that can be added to your Windows Startup folder to boot the engine silently when you turn on your PC.)*

---

## 🎮 Operational Workflows

### Generating Text & Image Posts
When you request a text or image post via the Dashboard, the **Frontend Brain** takes over. It talks directly to Gemini via your browser, creates the content, and pushes it to Firestore as "Ready for Review". The Python server doesn't even need to be running!

### Generating Videos
When a video is queued (manually or via schedule), the **Nexus Daemon** spots the request in Firestore. It runs `main.py` in the background to fetch assets and composite the video. 
- If your channel is set to **Autonomous**, it uploads the video immediately.
- If set to **Manual Review**, it saves the `.mp4` and flags the UI. You can watch the video, tweak the caption, and hit "Publish" straight from the dashboard.

---

## ⚠️ Troubleshooting

**Q: The Engine didn't auto-start on Windows boot.**
- **Fix:** Ensure the shortcut in `Win+R -> shell:startup` points to `engine/start_daemon_hidden.vbs` and that the VBS script correctly targets the `engine/start_daemon.bat` file.

**Q: Video fails with `0x80004005` error on Windows Media Player.**
- **Fix:** FFmpeg handles this automatically by forcing `pix_fmt='yuv420p'` in the composer. If you still encounter issues, try playing the output file in VLC Media Player.

**Q: Dashboard shows "Missed Scheduled Generation".**
- **Fix:** This happens if your PC was off during a scheduled cron tick. Click "Generate Now" in the dashboard banner to instantly fire the missed job.

Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%nexus_daemon%'" | Select-Object ProcessId, CommandLine, CreationDate
