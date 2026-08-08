import time
import os
import sqlite3
from datetime import datetime
from croniter import croniter
import subprocess

DB_PATH = os.path.join(os.getcwd(), "nexus_media_vortex.db")

def check_schedules():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, channel_key, content_type, cron_expression, next_run FROM schedules WHERE is_active = 1")
    schedules = cursor.fetchall()
    
    now = datetime.now()
    
    for schedule in schedules:
        sched_id, channel_key, content_type, cron_expr, next_run_str = schedule
        
        # Parse next_run if available
        next_run = None
        if next_run_str:
            try:
                next_run = datetime.fromisoformat(next_run_str)
            except:
                pass
                
        # If no next_run is set, calculate it
        if not next_run:
            try:
                cron = croniter(cron_expr, now)
                next_run = cron.get_next(datetime)
                cursor.execute("UPDATE schedules SET next_run = ? WHERE id = ?", (next_run.isoformat(), sched_id))
                conn.commit()
            except Exception as e:
                print(f"Invalid cron expression for schedule {sched_id}: {e}")
            continue
            
        # Check if it's time to run
        if now >= next_run:
            print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] ⏰ Triggering Schedule ID {sched_id}: Channel '{channel_key}', Type '{content_type}'")
            
            # Execute the engine
            lock_path = os.path.join(os.getcwd(), "engine.lock")
            if not os.path.exists(lock_path):
                args = f"--channel {channel_key} --type {content_type}"
                # We spawn the process and don't block
                subprocess.Popen(["run_genesis.bat", "--channel", channel_key, "--type", content_type])
            else:
                print("Engine is already running. Skipping this cycle.")
                
            # Calculate next run
            try:
                cron = croniter(cron_expr, now)
                new_next_run = cron.get_next(datetime)
                cursor.execute("UPDATE schedules SET next_run = ?, last_run = ? WHERE id = ?", (new_next_run.isoformat(), now.isoformat(), sched_id))
                conn.commit()
            except Exception as e:
                print(f"Error calculating next run for schedule {sched_id}: {e}")
                
    conn.close()

if __name__ == "__main__":
    print("🚀 Background Scheduler Started. Polling every 60 seconds...")
    while True:
        try:
            check_schedules()
        except Exception as e:
            print(f"Scheduler error: {e}")
        time.sleep(60)
