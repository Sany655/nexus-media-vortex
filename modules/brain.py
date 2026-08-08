import os
import json
from google import genai
from dotenv import load_dotenv

# Load API Key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

from modules.database import DatabaseManager

class ContentBrain:
    def __init__(self, channel_id="neuron_buster"):
        self.channel_id = channel_id
        self.db = DatabaseManager(channel_id=self.channel_id)
        
        # Load channel configuration from DB
        channel_data = self.db.get_channel_config(self.channel_id)
        if channel_data:
            self.config = channel_data
            try:
                self.api_keys = json.loads(channel_data.get('api_keys_json', '{}'))
            except:
                self.api_keys = {}
        else:
            print(f"⚠️ Warning: No config found in DB for channel '{self.channel_id}'. Using fallbacks.")
            self.config = {
                "niche": "Tech",
                "target_audience": "US/UK",
                "topic_prompt": "Focus on high-ticket tech topics.",
                "script_prompt": "You are writing a viral tech YouTube Shorts script.",
                "visual_prompt": "Visuals must be highly realistic stock footage keywords.",
                "metadata_prompt": "You are an elite tech marketer.",
                "cta_template": "🚀 Get the exact workflow here: [LINK IN BIO]",
                "hashtags_template": "#tech #business #viral"
            }
            self.api_keys = {}
            
        # Override Gemini API key if present in DB
        custom_gemini_key = self.api_keys.get('gemini_api_key')
        if custom_gemini_key:
            global client
            client = genai.Client(api_key=custom_gemini_key)

    def get_trending_topic(self):
        """
        Uses Gemini to pick a topic based on the channel's config, checking SQLite history for Serialized Continuity.
        """
        import sqlite3
        import os
        
        db_path = os.path.join(os.getcwd(), "nexus_media_vortex.db")
        past_topics = []
        last_topic = None
        
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            try:
                cursor.execute('SELECT topic FROM content_log WHERE channel_id = ? ORDER BY id DESC', (self.channel_id,))
                rows = cursor.fetchall()
                past_topics = [row[0] for row in rows]
                if rows:
                    last_topic = rows[0][0] # The very last topic we uploaded
            except sqlite3.OperationalError:
                pass
            conn.close()

        history_context = ""
        if past_topics:
            history_context = f"DO NOT use these past topics: {', '.join(past_topics[:20])}. "

        serialized_logic = ""
        if last_topic and "(Part" in last_topic:
            # We are in the middle of a series.
            import re
            match = re.search(r'\(Part (\d+)\)', last_topic)
            if match:
                next_part = int(match.group(1)) + 1
                base_topic = last_topic.split("(Part")[0].strip()
                serialized_logic = f"CRITICAL PRIORITY: Your LAST generated video was '{last_topic}'. You MUST continue the story by outputting exactly: '{base_topic} (Part {next_part})'."
        else:
            # Start a new series
            serialized_logic = f"Start a NEW multi-part series by outputting a topic ending in '(Part 1)'. For example: 'The Secret AI Tool (Part 1)'."

        prompt = f"""
        You are an elite marketer targeting the '{self.config.get('niche')}' niche for the {self.config.get('target_audience')} demographic.
        Your goal is to select a highly monetizable, viral topic.
        {self.config.get('topic_prompt')}
        
        {history_context}
        {serialized_logic}
        
        Output ONLY the raw string of the topic, nothing else. Maximum 8 words. Example: 'The Secret AI Tool for SEO (Part 1)'
        """
        
        print(f"🧠 Brain is querying memory and selecting a {self.config.get('niche')} topic...")
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text.strip()

    def generate_script(self, topic, content_type="video"):
        """
        Generates a structured JSON script with visual cues based on channel config and content type.
        """
        print(f"📝 Writing script for: {topic} (Type: {content_type})...")
        
        if content_type == "post":
            prompt = f"""
            {self.config.get('script_prompt')} You are writing a highly engaging text-only post for social media (X/LinkedIn) about: {topic}.
            Write a 3-4 paragraph engaging post. No video cues. No JSON formatting needed, just the text.
            """
            try:
                response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
                return [{"text": response.text.strip(), "visual_1": "", "visual_2": "", "mood": ""}]
            except Exception as e:
                print(f"❌ Error generating post: {e}")
                return None
        elif content_type == "image":
            prompt = f"""
            {self.config.get('script_prompt')} You are designing an engaging image post about: {topic}.
            Write a short 1-2 sentence caption for the image, and a highly detailed image generation prompt (visual description) for DALL-E/Stable Diffusion.
            Output strict JSON: {{"caption": "...", "image_prompt": "..."}}
            """
            try:
                response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
                clean_text = response.text.replace('```json', '').replace('```', '').strip()
                return [json.loads(clean_text)]
            except Exception as e:
                print(f"❌ Error generating image prompt: {e}")
                return None
                
        prompt = f"""
        {self.config.get('script_prompt')} You are writing about: {topic}.
        
        CRITICAL LENGTH RULE:
        You MUST write exactly 140 to 160 words. This ensures the generated audio will be between 65 and 85 seconds long to qualify for monetization. Break the script into exactly 10 to 12 scenes.
        
        CRITICAL NARRATIVE STRUCTURE:
        - SCENE 1 (The Hook): 0:00 - 0:03. Start with an aggressive, curiosity-gap statement or counter-intuitive claim. No slow intros.
        - SCENES 2 to 8 (Value Density): 0:03 - 0:45. Deliver high-paced, structured information. Keep sentences punchy.
        - SCENE 9 (The Bridge): 0:45 - 1:00. Introduce a "secret" element, advanced tip, or unexpected twist to ensure they watch past the critical 60-second drop-off point.
        - SCENES 10 to 12 (The CTA): Last 5-10 seconds. Execute a direct, verbal, and visual Call-To-Action. Example: "Click the link in my bio..."

        VISUAL RULES:
        1. For EVERY sentence, provide exactly TWO distinct visual keywords for stock footage.
        2. {self.config.get('visual_prompt')}
        3. NO text overlays. NO AI-generated avatar descriptions.
        
        Output strict JSON matching this schema exactly:
        [
            {{
                "id": 1,
                "text": "Your hook here...",
                "visual_1": "abstract descriptive keyword",
                "visual_2": "abstract descriptive keyword",
                "mood": "suspense"
            }}
        ]
        """
    
        try:
            response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
            clean_text = response.text.replace('```json', '').replace('```', '').strip()
            script_data = json.loads(clean_text)
            return script_data
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg or "Quota exceeded" in error_msg:
                print("❌ Brain Error: Gemini API Rate Limit Exceeded.")
                print("   You have hit your free-tier quota (20 requests/day).")
                print("   Please wait 24 hours before trying again, or upgrade your API billing plan.")
            else:
                print(f"❌ Error generating script: {e}")
            return None

    def generate_metadata(self, script_data, topic):
        """
        Generates SEO-optimized caption, hashtags, and a pinned comment dynamically.
        """
        print(f"🧠 Generating Engagement Metadata for: {topic}...")
        script_text = " ".join([scene["text"] for scene in script_data]) if script_data else f"A viral short documentary about {topic}."
        
        prompt = f"""
        {self.config.get('metadata_prompt')}
        I have created a highly converting YouTube Shorts/TikTok video about: {topic}
        Here is the script of the video:
        "{script_text}"

        Generate the following in strict JSON format:
        1. "caption": A long-form, SEO-optimized description. 
           CRITICAL: The VERY FIRST LINE must be exactly this: "{self.config.get('cta_template')}". 
           Then, write a 3-4 sentence SEO description targeting long-tail keywords.
        2. "hashtags": A string of 5 highly targeted, high-CPM hashtags related to the niche. Include: {self.config.get('hashtags_template')}.
        3. "pinned_comment": A conversion-focused comment to pin at the top (e.g., "What's the #1 bottleneck right now? 👇 P.S. Grab the free guide in my bio!").
        
        Return ONLY valid JSON. No markdown, no quotes outside JSON.
        {{
            "caption": "...",
            "hashtags": "...",
            "pinned_comment": "..."
        }}
        """
        
        try:
            response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
            clean_text = response.text.replace('```json', '').replace('```', '').strip()
            metadata = json.loads(clean_text)
            return metadata
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg or "Quota exceeded" in error_msg:
                print("⚠️ Warning: Gemini API Rate Limit Exceeded during metadata generation. Using fallback metadata.")
            else:
                print(f"❌ Error generating metadata: {e}. Using defaults.")
            
            return {
                "caption": f"{self.config.get('cta_template')}\n\n{topic} - Watch until the end...",
                "hashtags": self.config.get('hashtags_template'),
                "pinned_comment": "What are your thoughts on this? Let me know below 👇"
            }