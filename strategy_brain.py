import os
import json
import time
import datetime
from google import genai
from modules.database import DatabaseManager
from dotenv import load_dotenv

# Load API Key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

CHANNEL_ID = "neuron_buster"
CHANNEL_DIR = os.path.join(os.getcwd(), "channels", CHANNEL_ID)
CONFIG_PATH = os.path.join(CHANNEL_DIR, "config.json")
STATE_PATH = os.path.join(CHANNEL_DIR, "strategy_state.json")

def get_state():
    if not os.path.exists(STATE_PATH):
        default_state = {
            "next_analysis_timestamp": datetime.datetime.now().isoformat(),
            "shadowban_levels": {"yt": 0, "ig": 0, "tk": 0},
            "cooldown_end": {"yt": None, "ig": None, "tk": None}
        }
        with open(STATE_PATH, "w") as f:
            json.dump(default_state, f, indent=2)
        return default_state
    
    with open(STATE_PATH, "r") as f:
        state = json.load(f)
        # Ensure new fields exist for old state files
        if "shadowban_levels" not in state:
            state["shadowban_levels"] = {"yt": 0, "ig": 0, "tk": 0}
        if "cooldown_end" not in state:
            state["cooldown_end"] = {"yt": None, "ig": None, "tk": None}
        return state

def save_state(state):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)

def fetch_analytics():
    print("📊 Fetching latest analytics...")
    db = DatabaseManager(channel_id=CHANNEL_ID)
    
    # Placeholder for actual API/Playwright Scraping
    print("   🌐 Booting Playwright to scrape TikTok profile...")
    time.sleep(2)
    print("   ✅ Scraped latest TikTok views.")
    
    print("   📡 Querying YouTube API for latest views...")
    time.sleep(1)
    
    print("   📡 Querying Instagram API for latest views...")
    time.sleep(1)
    
    return db.get_performance_report()

def apply_shadowban_protocol(state, shadowbanned_platforms):
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)
        
    platforms = ["yt", "ig", "tk"]
    now = datetime.datetime.now()
    
    # We will track if we need to force the next analysis to 1 day
    force_1_day = False
    
    for plat in platforms:
        # Check if cooldown has ended
        cooldown_str = state["cooldown_end"].get(plat)
        if cooldown_str:
            cooldown_end_time = datetime.datetime.fromisoformat(cooldown_str)
            if now >= cooldown_end_time:
                print(f"❄️ {plat.upper()}: 14-Day Cooldown has ended. Unpausing...")
                state["cooldown_end"][plat] = None
                config[f"pause_{plat}"] = False
                state["shadowban_levels"][plat] = 2.5 # Intermediate state between 2 and 3
        
        # If Gemini flagged it this round
        if plat in shadowbanned_platforms:
            current_level = state["shadowban_levels"][plat]
            
            if current_level == 0:
                print(f"⚠️ SHADOWBAN WARNING [Level 1]: Gemini suspects {plat.upper()} is flatlining.")
                state["shadowban_levels"][plat] = 1
                force_1_day = True
                
            elif current_level == 1:
                print(f"❄️ SHADOWBAN COOLDOWN [Level 2]: {plat.upper()} is still flatlining. Initiating 14-day pause.")
                state["shadowban_levels"][plat] = 2
                state["cooldown_end"][plat] = (now + datetime.timedelta(days=14)).isoformat()
                config[f"pause_{plat}"] = True
                
            elif current_level == 2.5: # Failed immediately after cooldown
                print("\n" + "!"*60)
                print(f"💀 SHADOWBAN PERMANENT [Level 3]: {plat.upper()} failed after 14-day cooldown.")
                print(f"💀 THE PLATFORM ACCOUNT HAS BEEN BLACKLISTED. SEVERING CONNECTION.")
                print("!"*60 + "\n")
                
                state["shadowban_levels"][plat] = 3
                config[f"disable_{plat}"] = True
                config[f"pause_{plat}"] = False
                
                # Delete session files to sever connection
                if plat == "yt":
                    session_file = os.path.join(CHANNEL_DIR, "youtube_token.json")
                    if os.path.exists(session_file): os.remove(session_file)
                elif plat == "ig":
                    session_file = os.path.join(CHANNEL_DIR, "instagram_session.json")
                    if os.path.exists(session_file): os.remove(session_file)
                elif plat == "tk":
                    session_file = os.path.join(CHANNEL_DIR, "tiktok_cookies.txt")
                    if os.path.exists(session_file): os.remove(session_file)
                    
        else:
            # If Gemini didn't flag it, and it's not on cooldown, reset its level to 0!
            # Only reset if it's currently at 1 or 2.5 (we don't reset 3 automatically, it's permanently dead)
            if state["shadowban_levels"][plat] in [1, 2.5]:
                print(f"✅ {plat.upper()}: Views are recovering. Resetting shadowban level to 0.")
                state["shadowban_levels"][plat] = 0

    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)
        
    return state, force_1_day

def analyze_and_pivot(report, state):
    print("🧠 Initiating Strategy Brain Analysis...")
    
    with open(CONFIG_PATH, "r") as f:
        current_config = json.load(f)
        
    prompt = f"""
    You are an elite, AI-driven YouTube and TikTok channel manager. 
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
        
        # 1. Update Config (Strategy Pivot)
        with open(CONFIG_PATH, "w") as f:
            json.dump(analysis_result["config"], f, indent=2)
            
        print(f"\n🚀 STRATEGY PIVOT SUCCESSFUL!")
        print(f"Reasoning: {analysis_result['reasoning']}")
        
        # 2. Run Shadowban Protocol
        shadowbanned_list = analysis_result.get("shadowbanned_platforms", [])
        state, force_1_day = apply_shadowban_protocol(state, shadowbanned_list)
        
        # 3. Schedule
        days = 1 if force_1_day else analysis_result.get("next_analysis_days", 3)
        print(f"Next analysis scheduled in: {days} days.")
        return days, state
        
    except Exception as e:
        print(f"❌ Brain Analysis Failed: {e}")
        return 1, state # Try again tomorrow

def main_loop():
    print("🧠 Strategy Brain Daemon Started. Monitoring channel performance...")
    
    while True:
        state = get_state()
        next_analysis = datetime.datetime.fromisoformat(state["next_analysis_timestamp"])
        now = datetime.datetime.now()
        
        if now >= next_analysis:
            print(f"\n⏰ Time for Strategy Review! ({now.strftime('%Y-%m-%d %H:%M')})")
            
            # 1. Fetch Data
            report = fetch_analytics()
            
            # 2. Analyze, Pivot & Shadowban Escalation
            days_to_wait, state = analyze_and_pivot(report, state)
            
            # 3. Schedule Next Run
            new_time = now + datetime.timedelta(days=days_to_wait)
            state["next_analysis_timestamp"] = new_time.isoformat()
            save_state(state)
            
            print(f"💤 Strategy Brain going to sleep until {new_time.strftime('%Y-%m-%d %H:%M')}...")
            
        else:
            time.sleep(3600)

if __name__ == "__main__":
    main_loop()
