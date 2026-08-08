import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import os
import json
import time
import datetime
from croniter import croniter
import subprocess
from google import genai
from modules.firebase_db import FirebaseDBManager
from dotenv import load_dotenv

# Load API Key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

def get_channel_state(channel):
    """Ensure state fields exist on the channel document from Firebase."""
    state = {
        "next_analysis_timestamp": channel.get("next_analysis_timestamp", datetime.datetime.now().isoformat()),
        "shadowban_levels": channel.get("shadowban_levels", {"yt": 0, "ig": 0, "tk": 0}),
        "cooldown_end": channel.get("cooldown_end", {"yt": None, "ig": None, "tk": None})
    }
    return state

def apply_shadowban_protocol(db, channel_key, config, state, shadowbanned_platforms):
    platforms = ["yt", "ig", "tk"]
    now = datetime.datetime.now()
    force_1_day = False
    
    for plat in platforms:
        cooldown_str = state["cooldown_end"].get(plat)
        if cooldown_str:
            cooldown_end_time = datetime.datetime.fromisoformat(cooldown_str)
            if now >= cooldown_end_time:
                print(f"❄️ [{channel_key}] {plat.upper()}: 14-Day Cooldown has ended. Unpausing...")
                state["cooldown_end"][plat] = None
                config[f"pause_{plat}"] = False
                state["shadowban_levels"][plat] = 2.5
        
        if plat in shadowbanned_platforms:
            current_level = state["shadowban_levels"][plat]
            if current_level == 0:
                print(f"⚠️ [{channel_key}] SHADOWBAN WARNING [Level 1]: {plat.upper()} is flatlining.")
                state["shadowban_levels"][plat] = 1
                force_1_day = True
            elif current_level == 1:
                print(f"❄️ [{channel_key}] SHADOWBAN COOLDOWN [Level 2]: Initiating 14-day pause.")
                state["shadowban_levels"][plat] = 2
                state["cooldown_end"][plat] = (now + datetime.timedelta(days=14)).isoformat()
                config[f"pause_{plat}"] = True
            elif current_level == 2.5:
                print(f"💀 [{channel_key}] SHADOWBAN PERMANENT [Level 3]: {plat.upper()} blacklisted.")
                state["shadowban_levels"][plat] = 3
                config[f"disable_{plat}"] = True
                config[f"pause_{plat}"] = False
        else:
            if state["shadowban_levels"].get(plat) in [1, 2.5]:
                print(f"✅ [{channel_key}] {plat.upper()}: Views recovering. Resetting shadowban.")
                state["shadowban_levels"][plat] = 0

    # Persist the shadowban state to Firebase
    for plat in platforms:
        db.update_channel_shadowban(channel_key, plat, state["shadowban_levels"][plat], state["cooldown_end"][plat])
        
    return state, force_1_day

def analyze_and_pivot(db, channel_key, current_config, report, state):
    print(f"🧠 [{channel_key}] Initiating Strategy Brain Analysis...")
    if not client:
        print("❌ Gemini API Key missing. Skipping analysis.")
        return 1, state

    prompt = f"""
    You are an elite, AI-driven channel manager for '{channel_key}'. 
    Here is the CURRENT strategy configuration: {json.dumps(current_config, indent=2)}
    Here is the recent performance report: {json.dumps(report, indent=2)}
    
    TASK:
    1. Identify which topics/hooks perform best.
    2. Generate a NEW config JSON that pivots the strategy to maximize income based on their Objective.
    3. SHADOWBAN DETECTION: If the last 3 videos for a platform (yt, ig, tk) have EXACTLY 0 views, add it to `shadowbanned_platforms`.
    4. Determine `next_analysis_days` (1 to 7).
    
    Return ONLY valid JSON:
    {{
        "config": {{ "topic_prompt": "...", "script_prompt": "...", "pause_yt": false }},
        "shadowbanned_platforms": [],
        "next_analysis_days": 3,
        "reasoning": "Brief explanation"
    }}
    """
    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        clean_text = response.text.replace('```json', '').replace('```', '').strip()
        analysis_result = json.loads(clean_text)
        
        print(f"🚀 [{channel_key}] PIVOT SUCCESS! Reasoning: {analysis_result.get('reasoning')}")
        
        new_config = analysis_result["config"]
        shadowbanned_list = analysis_result.get("shadowbanned_platforms", [])
        state, force_1_day = apply_shadowban_protocol(db, channel_key, new_config, state, shadowbanned_list)
        
        # Save new config to Firebase
        docs = db.db.collection('channels').where('channel_key', '==', channel_key).limit(1).stream()
        for doc in docs:
            # We preserve Objective Node and other constants
            doc.reference.update({
                "topic_prompt": new_config.get("topic_prompt", current_config.get("topic_prompt")),
                "script_prompt": new_config.get("script_prompt", current_config.get("script_prompt")),
                "api_keys_json": json.dumps(new_config) # Store pause states here
            })
            
        days = 1 if force_1_day else analysis_result.get("next_analysis_days", 3)
        return days, state
        
    except Exception as e:
        print(f"❌ [{channel_key}] Analysis Failed: {e}")
        return 1, state

def check_schedules(db):
    schedules = db.get_active_schedules()
    now = datetime.datetime.now()
    
    for schedule in schedules:
        sched_id = schedule['id']
        channel_key = schedule['channel_key']
        cron_expr = schedule['cron_expression']
        content_type = schedule['content_type']
        next_run_str = schedule.get('next_run')
        
        next_run = None
        if next_run_str:
            try:
                next_run = datetime.datetime.fromisoformat(next_run_str)
            except: pass
                
        if not next_run:
            try:
                cron = croniter(cron_expr, now)
                next_run = cron.get_next(datetime.datetime)
                db.update_schedule_run(sched_id, next_run.isoformat(), None)
            except: pass
            continue
            
        if now >= next_run:
            print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] ⏰ Triggering Schedule for {channel_key} ({content_type})")
            
            lock_path = os.path.join(os.getcwd(), "engine.lock")
            if not os.path.exists(lock_path):
                subprocess.Popen(["run_genesis.bat", "--channel", channel_key, "--type", content_type])
            else:
                print("Engine is already running. Skipping this cycle.")
                
            try:
                cron = croniter(cron_expr, now)
                new_next_run = cron.get_next(datetime.datetime)
                db.update_schedule_run(sched_id, new_next_run.isoformat(), now.isoformat())
            except Exception as e:
                print(f"Error calculating next run: {e}")

def main_loop():
    print("🚀 Unified Nexus Daemon Started. (Cloud-Connected via Firebase)")
    try:
        db = FirebaseDBManager()
    except Exception as e:
        print(f"FAILED TO CONNECT TO FIREBASE: {e}")
        return
        
    while True:
        try:
            # 1. Trigger Content Generation Schedules
            check_schedules(db)
            
            # 2. Strategy Brain Analysis
            channels = db.get_all_channels()
            now = datetime.datetime.now()
            
            for ch in channels:
                channel_key = ch["channel_key"]
                state = get_channel_state(ch)
                next_analysis = datetime.datetime.fromisoformat(state["next_analysis_timestamp"])
                
                if now >= next_analysis:
                    print(f"\n⏰ [{channel_key}] Time for Strategy Review! ({now.strftime('%Y-%m-%d %H:%M')})")
                    report = db.get_performance_report(channel_key)
                    days_to_wait, state = analyze_and_pivot(db, channel_key, ch, report, state)
                    
                    new_time = now + datetime.timedelta(days=days_to_wait)
                    docs = db.db.collection('channels').where('channel_key', '==', channel_key).limit(1).stream()
                    for doc in docs:
                        doc.reference.update({"next_analysis_timestamp": new_time.isoformat()})
                        
        except Exception as e:
            print(f"Daemon Error: {e}")
            
        time.sleep(60)

if __name__ == "__main__":
    main_loop()
