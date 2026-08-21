import os
import sys
import json
import socketio

class PipelineEmitter:
    """
    Lightweight Socket.IO client emitter for main.py / pipeline steps
    to emit real-time progress, logs, and stage transitions to the dashboard.
    """
    def __init__(self, server_url="http://localhost:5001"):
        self.server_url = server_url
        self.sio = socketio.SimpleClient()
        self.connected = False
        try:
            self.sio.connect(self.server_url, wait_timeout=1)
            self.connected = True
        except Exception:
            self.connected = False

    def emit_progress(self, stage, percent, details=""):
        """
        Emits live progress percentage and current stage.
        Stages: 'ideation', 'audio', 'assets', 'composer', 'uploader', 'done', 'error'
        """
        payload = {
            "stage": stage,
            "percent": int(percent),
            "details": str(details)
        }
        if self.connected:
            try:
                self.sio.emit("pipeline:progress", payload)
            except Exception:
                pass
        print(f"📡 [LIVE {percent}%] {stage.upper()}: {details}")

    def emit_log(self, message, level="INFO"):
        """
        Emits a log line to live UI terminal / console.
        """
        payload = {
            "level": level,
            "message": str(message)
        }
        if self.connected:
            try:
                self.sio.emit("pipeline:log", payload)
            except Exception:
                pass

    def close(self):
        if self.connected:
            try:
                self.sio.disconnect()
            except Exception:
                pass
