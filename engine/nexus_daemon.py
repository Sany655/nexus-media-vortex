import asyncio
import os
import sys
import datetime
from dotenv import load_dotenv

# Force UTF-8 for background logging on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Ensure engine directory in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modules.firebase_db import FirebaseDBManager
from modules.tray_manager import SystemTrayManager
import socket_server

load_dotenv()

async def run_daemon():
    print("\n" + "="*55)
    print("🚀 NEXUS MEDIA VORTEX — EVENT-DRIVEN ENGINE & SOCKET SERVER")
    print("📡 Mode: Event-Driven / Deterministic Scheduling (Zero Busy-Polling)")
    print(f"⏰ Startup Time: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*55 + "\n")

    # 1. Start OS System Tray Badge Icon
    try:
        tray = SystemTrayManager(
            on_sync_callback=lambda: socket_server.db_manager.check_and_update_all_analytics() if socket_server.db_manager else None
        )
        tray.start()
    except Exception as e:
        print(f"⚠️ [TRAY ICON WARNING] Could not start system tray icon: {e}")

    # 2. Start Socket.IO Server & Deterministic Scheduler
    await socket_server.start_server(host="0.0.0.0", port=5001)

    # 3. Keep event loop active
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    try:
        asyncio.run(run_daemon())
    except (KeyboardInterrupt, SystemExit):
        print("\n👋 Nexus Daemon shutting down cleanly.")
