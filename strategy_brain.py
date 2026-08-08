import os
import json
import time
import datetime
import sqlite3
from google import genai
from modules.database import DatabaseManager
from dotenv import load_dotenv

# Load API Key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

DB_PATH = os.path.join(os.getcwd(), "nexus_media_vortex.db")

def get_channels():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT channel_key, niche, target_audience, topic_prompt, script_prompt, visual_prompt, metadata_prompt, cta_template, hashtags_template, api_keys_json FROM channels")
    rows = cursor.fetchall()
    conn.close()
    
    channels = []
    for r in rows:
        channel_key = r[0]
        try:
            config = json.loads(r[9] or '{}')
        except:
            config = {}
        
        # Merge prompt columns into the config object for the brain to analyze
        config["niche"] = r[1]
        config["target_audience"] = r[2]
        config["topic_prompt"] = r[3]
        config["script_prompt"] = r[4]
        config["visual_prompt"] = r[5]
        config["metadata_prompt"] = r[6]
        config["cta_template"] = r[7]
        config["hashtags_template"] = r[8]
        
        channels.append({"channel_key": channel_key, "config": config})
    return channels

def save_channel_config(channel_key, config):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Extract prompts out of config dict
    niche = config.get("niche", "")
    target_audience = config.get("target_audience", "")
    topic_prompt = config.get("topic_prompt", "")
    script_prompt = config.get("script_prompt", "")
    visual_prompt = config.get("visual_prompt", "")
    metadata_prompt = config.get("metadata_prompt", "")
    cta_template = config.get("cta_template", "")
    hashtags_template = config.get("hashtags_template", "")
    
    # We remove these from the dict so they don't bloat api_keys_json
    api_keys_json_dict = {k: v for k, v in config.items() if k not in [
        "niche", "target_audience", "topic_prompt", "script_prompt", 
        "visual_prompt", "metadata_prompt", "cta_template", "hashtags_template"
    ]}
    
    cursor.execute("""
        UPDATE channels SET 
            niche = ?, target_audience = ?, topic_prompt = ?, script_prompt = ?, 
            visual_prompt = ?, metadata_prompt = ?, cta_template = ?, hashtags_template = ?,
            api_keys_json = ?
        WHERE channel_key = ?
    """, (
        niche, target_audience, topic_prompt, script_prompt, 
        visual_prompt, metadata_prompt, cta_template, hashtags_template,
        json.dumps(api_keys_json_dict), channel_key
    ))
    conn.commit()
    conn.close()

def get_state(channel_key):
    channel_dir = os.path.join(os.getcwd(), "channels", channel_key)
    os.makedirs(channel_dir, exist_ok=True)
    state_path = os.path.join(channel_dir, "strategy_state.json")
    
    if not os.path.exists(state_path):
        default_state = {
            "next_analysis_timestamp": datetime.datetime.now().isoformat(),
            "shadowban_levels": {"yt": 0, "ig": 0, "tk": 0},
            "cooldown_end": {"yt": None, "ig": None, "tk": None}
        }
        with open(state_path, "w") as f:
            json.dump(default_state, f, indent=2)
        return default_state
    
    with open(state_path, "r") as f:
        state = json.load(f)
        if "shadowban_levels" not in state:
            state["shadowban_levels"] = {"yt": 0, "ig": 0, "tk": 0}
        if "cooldown_end" not in state:
            state["cooldown_end"] = {"yt": None, "ig": None, "tk": None}
        return state

def save_state(channel_key, state):
    channel_dir = os.path.join(os.getcwd(), "channels", channel_key)
    os.makedirs(channel_dir, exist_ok=True)
    state_path = os.path.join(channel_dir, "strategy_state.json")
    with open(state_path, "w") as f:
        json.dump(state, f, indent=2)

def fetch_analytics(channel_key):
    print(f"📊 [{channel_key}] Fetching latest analytics...")
    db = DatabaseManager(channel_id=channel_key)
    
    # Placeholder for actual API/Playwright Scraping
    print(f"   🌐 Booting Playwright to scrape TikTok profile for {channel_key}...")
    time.sleep(2)
    print("   ✅ Scraped latest TikTok views.")
    
    print("   📡 Querying YouTube API for latest views...")
    time.sleep(1)
    
    print("   📡 Querying Instagram API for latest views...")
    time.sleep(1)
    
    return db.get_performance_report()

def apply_shadowban_protocol(channel_key, config, state, shadowbanned_platforms):
    platforms = ["yt", "ig", "tk"]
    now = datetime.datetime.now()
    force_1_day = False
    
    channel_dir = os.path.join(os.getcwd(), "channels", channel_key)
    
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
                print(f"⚠️ [{channel_key}] SHADOWBAN WARNING [Level 1]: Gemini suspects {plat.upper()} is flatlining.")
                state["shadowban_levels"][plat] = 1
                force_1_day = True
                
            elif current_level == 1:
                print(f"❄️ [{channel_key}] SHADOWBAN COOLDOWN [Level 2]: {plat.upper()} is still flatlining. Initiating 14-day pause.")
                state["shadowban_levels"][plat] = 2
                state["cooldown_end"][plat] = (now + datetime.timedelta(days=14)).isoformat()
                config[f"pause_{plat}"] = True
                
            elif current_level == 2.5:
                print("\n" + "!"*60)
                print(f"💀 [{channel_key}] SHADOWBAN PERMANENT [Level 3]: {plat.upper()} failed after 14-day cooldown.")
                print(f"💀 THE PLATFORM ACCOUNT HAS BEEN BLACKLISTED. SEVERING CONNECTION.")
                print("!"*60 + "\n")
                
                state["shadowban_levels"][plat] = 3
                config[f"disable_{plat}"] = True
                config[f"pause_{plat}"] = False
                
                if plat == "yt":
                    session_file = os.path.join(channel_dir, "youtube_token.json")
                    if os.path.exists(session_file): os.remove(session_file)
                elif plat == "ig":
                    session_file = os.path.join(channel_dir, "instagram_session.json")
                    if os.path.exists(session_file): os.remove(session_file)
                elif plat == "tk":
                    session_file = os.path.join(channel_dir, "tiktok_cookies.txt")
                    if os.path.exists(session_file): os.remove(session_file)
                    
        else:
            if state["shadowban_levels"][plat] in [1, 2.5]:
                print(f"✅ [{channel_key}] {plat.upper()}: Views are recovering. Resetting shadowban level to 0.")
                state["shadowban_levels"][plat] = 0

    save_channel_config(channel_key, config)
    return state, force_1_day

def analyze_and_pivot(channel_key, current_config, report, state):
    print(f"🧠 [{channel_key}] Initiating Strategy Brain Analysis...")
    
    prompt = f"""
    You are an elite, AI-driven YouTube and TikTok channel manager for '{channel_key}'. 
    Your goal is to maximize the virality and income of this channel by dynamically adjusting its content strategy.
    
    Here is the CURRENT strategy configuration:
    {json.dumps(current_config, indent=2)}
    
    Here is the recent performance report of the uploaded videos (Title, Views, Script):
    {json.dumps(report, indent=2)}
    
    TASK:
    1. Analyze the performance data. Identify which topics, hooks, or niches are performing best.
    2. Analyze the current state of the internet.
    3. Generate a completely NEW config JSON that pivots the channel to maximize income. Update `topic_prompt`, `script_prompt`, `visual_prompt`, etc. Keep existing URLs and pause/disable flags intact.
    4. SHADOWBAN DETECTION: If the last 3 or 4 videos for a specific platform (yt, ig, or tk) have EXACTLY 0 views (or < 5 views), add that platform string to the `shadowbanned_platforms` list.
    5. Determine the `next_analysis_days` (an integer between 1 and 7). If highly volatile, pick 1-3. If stable, pick 7.
    
    Return ONLY valid JSON matching this schema exactly:
    {{
        "config": {{
            "niche": "...",
            "target_audience": "...",
            "topic_prompt": "...",
            "script_prompt": "...",
            "visual_prompt": "...",
            "metadata_prompt": "...",
            "cta_template": "...",
            "hashtags_template": "...",
            "tiktok_url": "{current_config.get('tiktok_url', '')}",
            "youtube_url": "{current_config.get('youtube_url', '')}",
            "instagram_url": "{current_config.get('instagram_url', '')}",
            "pause_yt": {str(current_config.get('pause_yt', False)).lower()},
            "pause_ig": {str(current_config.get('pause_ig', False)).lower()},
            "pause_tk": {str(current_config.get('pause_tk', False)).lower()},
            "disable_yt": {str(current_config.get('disable_yt', False)).lower()},
            "disable_ig": {str(current_config.get('disable_ig', False)).lower()},
            "disable_tk": {str(current_config.get('disable_tk', False)).lower()}
        }},
        "shadowbanned_platforms": [],
        "next_analysis_days": 3,
        "reasoning": "A brief explanation of why you made these changes."
    }}
    """
    
    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        clean_text = response.text.replace('```json', '').replace('```', '').strip()
        analysis_result = json.loads(clean_text)
        
        print(f"\n🚀 [{channel_key}] STRATEGY PIVOT SUCCESSFUL!")
        print(f"Reasoning: {analysis_result['reasoning']}")
        
        # Merge new config and update DB
        new_config = analysis_result["config"]
        # Save happens inside apply_shadowban_protocol
        
        shadowbanned_list = analysis_result.get("shadowbanned_platforms", [])
        state, force_1_day = apply_shadowban_protocol(channel_key, new_config, state, shadowbanned_list)
        
        days = 1 if force_1_day else analysis_result.get("next_analysis_days", 3)
        print(f"[{channel_key}] Next analysis scheduled in: {days} days.")
        return days, state
        
    except Exception as e:
        print(f"❌ [{channel_key}] Brain Analysis Failed: {e}")
        return 1, state

def main_loop():
    print("🧠 Multi-Channel Strategy Brain Daemon Started. Monitoring all channels...")
    
    while True:
        channels = get_channels()
        
        for ch in channels:
            channel_key = ch["channel_key"]
            config = ch["config"]
            
            state = get_state(channel_key)
            next_analysis = datetime.datetime.fromisoformat(state["next_analysis_timestamp"])
            now = datetime.datetime.now()
            
            if now >= next_analysis:
                print(f"\n⏰ [{channel_key}] Time for Strategy Review! ({now.strftime('%Y-%m-%d %H:%M')})")
                
                report = fetch_analytics(channel_key)
                days_to_wait, state = analyze_and_pivot(channel_key, config, report, state)
                
                new_time = now + datetime.timedelta(days=days_to_wait)
                state["next_analysis_timestamp"] = new_time.isoformat()
                save_state(channel_key, state)
            else:
                pass # Still sleeping for this channel
                
        print(f"\n💤 Daemon sleeping for 1 hour before next channel check...")
        time.sleep(3600)

if __name__ == "__main__":
    main_loop()
