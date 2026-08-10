import sys
import io
# sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', write_through=True)
# sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', write_through=True)

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
    """
    Uses Gemini to analyze performance and suggest a new strategy.
    Returns (days_to_wait, updated_state)
    """
    client = genai.Client(api_key=api_key) if api_key else None
    if not client:
        print("❌ GEMINI_API_KEY missing. Cannot perform strategy analysis.")
        return 3, state

    prompt = f"""
    You are an elite, AI-driven channel manager for '{channel_key}'. 
    Here is the CURRENT strategy configuration: {json.dumps(current_config, indent=2)}
    Here is the recent performance report: {json.dumps(report, indent=2)}
    
    TASK:
    1. Identify which topics/hooks perform best.
    2. Generate a NEW config JSON that pivots the strategy to maximize income based on their Objective.
    3. SHADOWBAN DETECTION: If the last 3 videos for a platform (yt, ig, tk) have EXACTLY 0 views, add it to `shadowbanned_platforms`.
    4. Determine `next_analysis_days` (1 to 7).
    5. MrBeast Mentality Scheduling: Determine the ABSOLUTE BEST daily posting time for this specific target audience based on their demographics/region. Provide it as a standard CRON expression (e.g., '0 15 * * *' for 3 PM).
    
    Return ONLY valid JSON:
    {{
        "config": {{ "topic_prompt": "...", "script_prompt": "...", "pause_yt": false }},
        "shadowbanned_platforms": [],
        "next_analysis_days": 3,
        "recommended_cron": "0 15 * * *",
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
            
        # AI-Driven Scheduling: Apply MrBeast Mentality schedule
        recommended_cron = analysis_result.get("recommended_cron")
        if recommended_cron:
            print(f"⏰ [AI Schedule] AI recommends posting at: {recommended_cron} (Auto-schedule disabled for testing)")
            # db.set_schedule(channel_key, "video", recommended_cron)
            
        days = 1 if force_1_day else analysis_result.get("next_analysis_days", 3)
        return days, state
        
    except Exception as e:
        print(f"❌ [{channel_key}] Analysis Failed: {e}")
        return 1, state

def trigger_engine(db, channel_key, content_type="video"):
    print(f"\n🚀 [DAEMON] Initiating Engine Pipeline for {channel_key} ({content_type})")
    
    # 1. Sync Analytics (Ensures brain has latest data)
    print(f"🔄 Syncing analytics for {channel_key} before generation...")
    # This runs the analytics check before creating new content
    db.check_and_update_all_analytics()
    
    # 2. Strategy Review
    print(f"🧠 Running strategy pivot before generation...")
    ch = db.get_channel_config(channel_key)
    if ch:
        state = get_channel_state(ch)
        report = db.get_performance_report(channel_key)
        analyze_and_pivot(db, channel_key, ch, report, state)
    
    # 3. Launch Engine
    lock_path = os.path.join(os.getcwd(), "engine.lock")
    if not os.path.exists(lock_path):
        args = ["run_genesis.bat", "--channel", channel_key, "--type", content_type]
        if os.path.exists("override.json"):
            args.extend(["--override", "override.json"])
        subprocess.Popen(args)
    else:
        print("Engine is already running. Skipping this cycle.")

def process_trigger_queue(db):
    try:
        docs = db.db.collection('trigger_queue').where('status', '==', 'Pending').stream()
        for doc in docs:
            job = doc.to_dict()
            channel_key = job.get('channel_key')
            retry_topic = job.get('retryTopic')
            job_type = job.get('type')
            
            # Delete the trigger document so we don't pick it up again
            doc.reference.delete()
            
            if job_type == 'SYNC_ANALYTICS':
                print("🔄 [DAEMON] Received Analytics Sync Trigger from Dashboard...")
                db.check_and_update_all_analytics()
                continue
            
            if retry_topic:
                with open("override.json", "w") as f:
                    json.dump({"retryTopic": retry_topic}, f)
            elif os.path.exists("override.json"):
                os.remove("override.json") # Ensure it's clean for normal generations
            
            trigger_engine(db, channel_key, "video")
    except Exception as e:
        print(f"Queue Error: {e}")

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
            except Exception as e:
                print(f"⚠️ Invalid CRON expression for {schedule['channel_key']}: '{cron_expr}' - {e}")
            continue
            
        if now >= next_run:
            print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] ⏰ Triggering Schedule for {channel_key} ({content_type})")
            
            trigger_engine(db, channel_key, content_type)
                
            try:
                cron = croniter(cron_expr, now)
                new_next_run = cron.get_next(datetime.datetime)
                db.update_schedule_run(sched_id, new_next_run.isoformat(), now.isoformat())
            except Exception as e:
                print(f"Error calculating next run: {e}")

def check_tiktok_retries(db):
    try:
        now = datetime.datetime.now()
        
        # We query for anything that is fully uploaded_yt and uploaded_ig but not tk
        docs = db.db.collection('content_queue').where('uploaded_tk', '==', False).stream()
        for doc in docs:
            data = doc.to_dict()
            status = data.get('status', '')
            
            # Skip if it hit the 3 strikes or was completely marked failed
            if status == "TK_AUTH_SUSPENDED" or "FATAL" in status:
                continue 
                
            retry_count = data.get('tk_retry_count', 0)
            
            # Only auto-retry if it has failed at least once but hasn't hit 3 strikes
            if 0 < retry_count < 3:
                last_retry_str = data.get('last_tk_retry_time')
                if last_retry_str:
                    try:
                        last_retry = datetime.datetime.fromisoformat(last_retry_str)
                        diff = now - last_retry
                        if diff.total_seconds() > 1800: # 30 minutes
                            topic = data.get('topic')
                            print(f"\n🔄 [DAEMON] Auto-retrying TikTok upload for '{topic}' (Strike {retry_count})...")
                            
                            db.db.collection('trigger_queue').add({
                                'channel_key': data.get('channel_key'),
                                'status': 'Pending',
                                'retryTopic': topic,
                                'created_at': now
                            })
                            # Update timestamp so we don't double-queue it in the next 60s
                            doc.reference.update({'last_tk_retry_time': now.isoformat()})
                    except Exception as e:
                        pass
    except Exception as e:
        print(f"TK Retry Sweep Error: {e}")

def main_loop():
    print("🚀 Unified Nexus Daemon Started. (Cloud-Connected via Firebase)")
    try:
        db = FirebaseDBManager()
    except Exception as e:
        print(f"FAILED TO CONNECT TO FIREBASE: {e}")
        return
        
    while True:
        try:
            # 0. Check Manual Trigger Queue
            process_trigger_queue(db)

            # 1. Trigger Content Generation Schedules
            check_schedules(db)
            
            # 1.5 Check Auto-Retries for failed TikTok Uploads
            check_tiktok_retries(db)
            
            # 2. Strategy Brain Analysis (Routine check, independent of generation)
            channels = db.get_all_channels()
            now = datetime.datetime.now()
            
            for ch in channels:
                channel_key = ch.get("channel_key", ch.get("id"))
                if not channel_key:
                    continue
                    
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
            
        # Optional: Print a subtle heartbeat so the user knows it's alive
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 💤 Daemon listening for triggers... (sleeping 60s)")
        time.sleep(60)

if __name__ == "__main__":
    main_loop()
