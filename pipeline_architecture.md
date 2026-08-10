# Nexus Media Vortex: Cloud Pipeline Architecture

This document breaks down the complete, end-to-end flow of your newly cloud-connected Nexus Media Vortex system. It traces exactly how a simple click on the Dashboard UI travels through the cloud to automatically generate and upload a video.

---

## 1. The High-Level Flow

```mermaid
flowchart TD
    %% Triggers
    T1(["⏰ Scheduled Time Reached"]) --> D
    T2(["🖱️ Manual Override (UI)"]) --> D

    %% Daemon Hub
    D{"Nexus Daemon\n(Always Running)"} --> A

    %% Pre-Generation Phase
    subgraph Pre-Generation
        A["📊 Analytics Sync\n(Fetches latest views)"] --> B
        B["🧠 AI Strategy Brain\n(Analyzes views & trends)"] --> C{Pivot Strategy?}
        C -- "Yes" --> P1["Update Prompts & Schedule"] --> E
        C -- "No" --> E["🚀 Spawn Genesis Engine\n(Background Process)"]
    end

    %% Engine Phase
    subgraph Genesis Engine (main.py)
        E --> G1["📝 Generate Script\n(Using AI Prompts)"]
        G1 --> G2["🎙️ Synthesize Audio\n(Edge TTS)"]
        G2 --> G3["🎬 Download Assets\n(Stock Footage/Images)"]
        G3 --> G4["🎞️ Render Final Video\n(Merge Audio + Visuals)"]
    end

    %% Distribution Phase
    subgraph Distribution
        G4 --> U{Upload Platforms}
        U --> U1["📺 Upload to YouTube"]
        U --> U2["📸 Upload to Instagram\n(Uses saved session)"]
        U --> U3["🎵 Upload to TikTok\n(Uses browser cookies)"]
    end

    %% Post-Generation Phase
    U1 & U2 & U3 --> S1["💾 Save IDs to Firebase\n(yt_id, ig_id)"]
    S1 --> F(["🎉 Pipeline Complete\n(Awaits next trigger)"])

    %% Styling
    style D fill:#f9f,stroke:#333,stroke-width:2px
    style E fill:#bbf,stroke:#333,stroke-width:2px
    style F fill:#bfb,stroke:#333,stroke-width:2px
```

---

## 2. Component Breakdown

### A. Next.js Dashboard UI (The Control Center)
Your UI is now **100% decoupled** from the local SQLite database. It communicates strictly with Firebase via your `/api/` routes using the `firebase-admin` SDK.

*   **Channels (`api/channels`)**: Saves API keys, AI prompts, and toggle states (e.g., `pause_yt`) to the `channels` collection.
*   **Schedules (`api/schedules`)**: When you set a time in the UI, it converts it to a standard CRON expression (e.g., `0 18 * * *`) and saves it to the `schedules` collection.
*   **Manual Trigger (`api/pipeline/generate`)**: Clicking the Manual Override button drops a `Pending` job into the `trigger_queue` collection.

### B. The Nexus Daemon (`nexus_daemon.py`)
This is the always-running heart of the automation. It runs an infinite `while True:` loop, sleeping for 60 seconds between ticks.

1.  **Polls Firebase**: It checks `get_active_schedules()` and `trigger_queue`.
2.  **Analytics Sync**: Before generating a video, it calls `analytics.py`, which looks at the `yt_id`, `ig_id`, and `tk_id` fields in Firebase to pull the latest view counts and update your dashboard.
3.  **Strategy Brain**: It passes the analytics to the AI `strategy_brain.py`. The AI analyzes the data and can dynamically update your prompts, shadowban cooldowns, and even the schedule itself.
4.  **Engine Launch**: Once the setup is complete, it executes `subprocess.Popen(["run_genesis.bat", ...])`. By doing this, it throws the heavy video generation into a background process, allowing the Daemon to go back to sleep and monitor other channels.

### C. The Genesis Engine (`run_genesis.bat` & `main.py`)
This is the heavy lifter. Because it is launched in the background by the Daemon, all of its print statements are piped directly into `engine.log`. 

1.  **Preparation**: `main.py` fetches the pending topic from Firebase's `content_queue`.
2.  **Generation**: It uses the AI prompts to generate the script, synthesizes the audio via TTS, downloads stock footage, and compiles the final `.mp4` file.
3.  **Distribution**: It connects to YouTube, Instagram, and TikTok via `modules/uploader.py`.
4.  **Completion**: Upon successful upload, it saves the new `yt_id`, `ig_id`, and `tk_id` back to Firebase so the analytics script can track them tomorrow!

---

## 3. The Firebase Database Structure

Your cloud database acts as the single source of truth connecting the UI and the Python engine. 

| Collection | Purpose | Key Fields |
| :--- | :--- | :--- |
| `channels` | Channel configuration and API keys | `channel_key`, `api_keys_json`, `topic_prompt`, `script_prompt` |
| `schedules` | Automated triggering | `cron_expression`, `next_run`, `last_run`, `is_active` |
| `content_queue` | Video generation history and analytics | `topic`, `status`, `yt_id`, `ig_id`, `tk_id`, `youtube_views`, `ig_views`, `tk_views`, `script` |
| `trigger_queue` | Manual overrides | `status`, `channel_key`, `created_at` |
| `users` | Admin authentication | `uid`, `email` |

> [!TIP]
> **How to Verify the System is Running**
> 1. Set a schedule time in the UI for 2 minutes from now.
> 2. Ensure `python .\nexus_daemon.py` is running in your terminal.
> 3. Watch the terminal. When the time hits, you will see `🚀 [DAEMON] Initiating Engine Pipeline`.
> 4. To see the actual video generation progress, open a second terminal and run `Get-Content engine.log -Wait -Tail 20`. This will stream the background process logs live to your screen!
