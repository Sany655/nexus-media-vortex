# Nexus Media Vortex: Cloud Pipeline Architecture

This document breaks down the end-to-end flow of the Nexus Media Vortex system, outlining how the Next.js Dashboard and the Python Daemon coordinate via Firebase Firestore to handle autonomous and manual content generation across platforms.

---

## 1. The High-Level Architecture

The system operates using a **"Frontend-First, Server-Enhanced"** architecture. It consists of two active layers connected through a real-time Firestore database.

```mermaid
flowchart TD
    %% Users and Inputs
    U(["👤 User (Browser)"]) --> DB_UI
    
    %% Dashboard (Frontend)
    subgraph Dashboard (Next.js)
        DB_UI["🖥️ Dashboard UI"]
        FB["🧠 Frontend Brain\n(Gemini API)"]
        DB_UI <--> FB
    end
    
    %% Firestore
    subgraph Cloud (Firebase)
        FS_Q["📝 content_queue"]
        FS_T["⚡ trigger_queue"]
        FS_S["📅 schedules"]
        FS_C["📺 channels"]
    end
    
    %% Frontend to Cloud
    FB -- "Text/Image Content" --> FS_Q
    DB_UI -- "Generate/Publish Requests" --> FS_T
    DB_UI <--> FS_S & FS_C
    
    %% Engine (Backend)
    subgraph Engine (Python Daemon)
        D{"Nexus Daemon"}
        SB["🧠 Strategy Brain"]
        V["🎬 Video Composer\n(FFmpeg)"]
        UP["📤 Uploader Node"]
        
        D <--> SB
        D --> V --> UP
    end
    
    %% Cloud to Backend
    FS_T --> D
    FS_S --> D
    D -- "Ready for Review / Uploaded" --> FS_Q
```

---

## 2. Core Operational Modes

Each channel can operate in one of two **Pipeline Modes** defined in settings:

### A. Autonomous Mode
- The system handles the entire lifecycle end-to-end.
- Topics are generated, scripts are written, videos are rendered, and they are automatically uploaded to platforms like YouTube, Instagram, and TikTok without user intervention.
- The Engine reads the channel's `schedules` collection and triggers automatically.

### B. Manual Review Mode
- The system handles generation and rendering but **stops before uploading**.
- Content is saved to Firestore with the status `Ready for Review`.
- The user logs into the dashboard, reviews the script, caption, and hashtags, and manually initiates the upload process using the **Publish** buttons.

---

## 3. The Dual-Brain System

To account for periods when the local PC/Server running the Daemon might be offline, the system utilizes a **Dual-Brain approach**.

### The Frontend Brain (Browser-Side)
- Located in `src/lib/frontendBrain.ts`.
- Executes directly in the user's browser using the Gemini API.
- Capable of instantly generating text posts (X, LinkedIn, Facebook) and image posts (Instagram, Pinterest).
- Since these formats do not require heavy video compositing, they are instantly added to the `content_queue` as `Ready for Review`, allowing the user to copy/paste them directly without needing the Python daemon to be online.

### The Backend Brain & Engine (Server-Side)
- Located in the `engine/` directory (`main.py`, `nexus_daemon.py`).
- Required for heavy video tasks (Audio synthesis, asset downloading, FFmpeg video compositing).
- The Daemon continuously listens to `trigger_queue` for manual video generation requests or runs autonomously via scheduled cron jobs.
- If a scheduled generation is missed because the PC was off, the Dashboard detects the missed schedule and presents an alert, allowing the user to manually queue or generate it instantly.

---

## 4. The Database Schema (Firestore)

The system relies 100% on Firebase Firestore (SQLite has been fully removed) ensuring total synchronization across multiple devices. Data is isolated by `user_id` for multi-tenant security.

| Collection | Purpose | Key Fields |
| :--- | :--- | :--- |
| `users` | Admin authentication and user-level config | `uid`, `email`, `gemini_api_key` |
| `channels` | Channel settings, prompts, and platform limits | `channel_key`, `user_id`, `api_keys_json`, `topic_prompt`, `script_prompt` |
| `schedules` | Automated cron triggers per channel | `channel_key`, `user_id`, `cron_expression`, `next_run`, `content_type` |
| `content_queue` | Content history, analytics, and pending reviews | `topic`, `user_id`, `status`, `pipeline_mode`, `generated_caption`, `uploaded_ig`, `youtube_views` |
| `trigger_queue` | Real-time command bus | `type` (e.g. `PUBLISH_CONTENT`, `GENERATE_PIPELINE`), `status`, `channel_key`, `platform` |

---

## 5. End-to-End Workflows

### Text/Image Generation (Frontend)
1. User clicks **"Generate Now"** in the UI.
2. The `Frontend Brain` queries Firestore to ensure no recent topics are duplicated.
3. The browser securely calls Gemini to generate the content, caption, and hashtags.
4. The document is saved directly into `content_queue`.
5. The UI updates instantly via `onSnapshot` real-time listeners. User copies the content and clicks the platform link to manually post.

### Video Generation (Engine)
1. User clicks **"Queue Server"** or the cron schedule triggers automatically.
2. The `Nexus Daemon` spots the event in `trigger_queue` or `schedules`.
3. The Daemon launches the `run_genesis.bat` script which runs `main.py` in the background.
4. The Engine generates the script via Gemini, fetches assets, synthesizes audio, and stitches the video using FFmpeg.
5. Depending on the `pipeline_mode`, it either:
   - **Uploads** the video immediately and sets status to `Uploaded`.
   - **Skips upload**, setting status to `Ready for Review` so the user can review it in the Dashboard.
6. The user can click a specific platform's **Publish** button in the UI, dropping a `PUBLISH_CONTENT` job into the `trigger_queue` which the Daemon instantly executes to upload the specific video file.

