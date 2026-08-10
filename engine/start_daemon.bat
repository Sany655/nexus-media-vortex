@echo off
cd /d "c:\All\works\nexus-media-vortex"
call venv\Scripts\activate.bat
python nexus_daemon.py >> daemon_background.log 2>&1
