@echo off
cd /d "c:\All\works\nexus-media-vortex\engine"
call ..\venv\Scripts\activate.bat
echo 🚀 Starting Nexus Daemon...
python -u nexus_daemon.py
