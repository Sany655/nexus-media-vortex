@echo off
echo Starting Nexus Media Vortex Automation Node...
cd C:\All\works\nexus-media-vortex
set PYTHONIOENCODING=utf-8
call .\venv\Scripts\activate.bat
.\venv\Scripts\python.exe -u main.py %* >> engine.log 2>&1
echo Engine Shutdown. >> engine.log
