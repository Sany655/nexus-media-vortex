import os
import sys
import json
import re
import urllib.request
from instagrapi import Client as InstaClient

# Ensure we can import from modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.firebase_db import FirebaseDBManager
from modules.uploader import DistributionNode

class AnalyticsEngine:
    def __init__(self, channel_id="neuron_buster"):
        self.channel_id = channel_id
        self.db = FirebaseDBManager()
        self.uploader = DistributionNode(channel_id=self.channel_id)

    def sync_youtube_analytics(self):
        print("\n[Analytics] Starting YouTube Analytics Sync...")
        
        youtube = self.uploader.authenticate_youtube()
        if not youtube:
            print("[Error] Cannot authenticate for analytics. Token missing or invalid.")
            return False

        videos = self.db.get_all_platform_ids("yt_id")
        if not videos:
            print("No YouTube IDs found in database to sync.")
            return True

        batch_size = 50
        for i in range(0, len(videos), batch_size):
            batch = videos[i:i+batch_size]
            ids = ",".join([v["yt_id"] for v in batch])
            
            try:
                request = youtube.videos().list(part="statistics", id=ids)
                response = request.execute()
                
                stats_map = {item["id"]: int(item["statistics"].get("viewCount", 0)) for item in response.get("items", [])}
                
                for v in batch:
                    vid_id = v["yt_id"]
                    if vid_id in stats_map:
                        views = stats_map[vid_id]
                        print(f"   [+] YT - {v['topic'][:30]}... : {views} views")
                        self.db.update_analytics(v["topic"], yt_views=views)
                        
            except Exception as e:
                print(f"[Error] Failed to fetch analytics batch: {e}")

        print("[Success] YouTube Analytics Sync Complete!")
        return True

    def sync_instagram_analytics(self):
        print("\n[Analytics] Starting Instagram Analytics Sync...")
        
        cl = InstaClient()
        config_path = os.path.join(os.getcwd(), 'channels', self.channel_id, 'config.json')
        session_path = os.path.join(os.getcwd(), 'channels', self.channel_id, 'instagram_session.json')
        
        cfg = self.db.get_channel_config(self.channel_id)
        if not cfg:
            print("No Firebase channel config found.")
            return False
            
        ig_user = cfg.get("ig_username")
        ig_pass = cfg.get("ig_password")
            
        if not ig_user or not ig_pass:
            print("[Error] Instagram credentials not configured in Firebase.")
            return False
            
        try:
            if os.path.exists(session_path):
                cl.load_settings(session_path)
                # Try to login with session
                cl.login(ig_user, ig_pass)
            else:
                cl.login(ig_user, ig_pass)
                cl.dump_settings(session_path)
        except Exception as e:
            print(f"[Error] Failed to login to Instagram: {e}")
            return False

        videos = self.db.get_all_platform_ids("ig_id")
        if not videos:
            print("No Instagram IDs found in database to sync.")
            return True
            
        for v in videos:
            try:
                # ig_id in our DB is typically the media PK (e.g. 123456789) or shortcode.
                # Instagrapi uses media PK. 
                # If we saved the shortcode (from URL), we can use cl.media_pk_from_code(shortcode)
                ig_id = v["ig_id"]
                if "_" not in ig_id and not ig_id.isdigit():
                    # It's a shortcode
                    ig_id = cl.media_pk_from_code(ig_id)
                
                media = cl.media_info(ig_id)
                views = media.view_count or 0
                if views == 0 and media.play_count: # Sometimes play_count is used
                    views = media.play_count
                    
                print(f"   [+] IG - {v['topic'][:30]}... : {views} views")
                self.db.update_analytics(v["topic"], ig_views=views)
            except Exception as e:
                print(f"[Error] Failed to fetch IG analytics for {v['topic'][:30]}: {e}")

        print("[Success] Instagram Analytics Sync Complete!")
        return True

    def sync_tiktok_analytics(self):
        print("\n[Analytics] Starting TikTok Analytics Sync (Profile Scraper)...")
        
        cfg = self.db.get_channel_config(self.channel_id)
        if not cfg or not cfg.get("tk_username"):
            print("[Error] TikTok username not configured in Firebase.")
            return False
            
        tk_username = cfg.get("tk_username")
        url = f"https://www.tiktok.com/@{tk_username}"
        
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req, timeout=15) as response:
                html = response.read().decode('utf-8')
                
            # TikTok's DOM changes often. We will try to find video items.
            # Usually they are in SIGI_STATE or __UNIVERSAL_DATA_FOR_REHYDRATION__
            match = re.search(r'__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)</script>', html)
            if not match:
                match = re.search(r'SIGI_STATE"[^>]*>([^<]+)</script>', html)
                
            if not match:
                print(f"[Error] Could not find TikTok JSON data. TikTok may be serving a Captcha or the layout changed.")
                return False
                
            import json
            import difflib
            
            data = json.loads(match.group(1))
            scraped_videos = [] # list of (description, playCount)
            
            # Very basic extraction - will need to adapt if TikTok changes JSON schema
            # We look for all dictionaries with 'playCount' and 'desc'
            def extract_videos(obj):
                if isinstance(obj, dict):
                    if 'playCount' in obj and 'desc' in obj:
                        scraped_videos.append((obj['desc'], int(obj['playCount'])))
                    for k, v in obj.items():
                        extract_videos(v)
                elif isinstance(obj, list):
                    for item in obj:
                        extract_videos(item)
            
            extract_videos(data)
            
            if not scraped_videos:
                print("[Error] Could not parse any videos from the TikTok profile data.")
                return False
                
            videos = self.db.get_all_platform_ids("tk_id") # We'll just get all uploaded videos
            # Wait, get_all_platform_ids("tk_id") filters by tk_id != "". 
            # We need all videos that are uploaded to tk, regardless of tk_id!
            all_queue = self.db.db.collection('content_queue').where(filter=google.cloud.firestore.FieldFilter('status', '==', 'uploaded')).stream()
            db_videos = [doc.to_dict() for doc in all_queue if doc.to_dict().get('uploaded_tk')]
            
            if not db_videos:
                print("No TikTok videos found in database to sync.")
                return True
                
            print(f"   [*] Found {len(scraped_videos)} videos on TikTok profile. Matching...")
            for v in db_videos:
                topic = v.get("topic", "")
                best_match = None
                best_ratio = 0
                
                for desc, views in scraped_videos:
                    ratio = difflib.SequenceMatcher(None, topic.lower(), desc.lower()).ratio()
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_match = (desc, views)
                
                if best_ratio > 0.3 and best_match: # 0.3 is a lenient threshold for topic vs description
                    views = best_match[1]
                    print(f"   [+] TK - {topic[:30]}... : {views} views (Matched: {best_ratio:.2f})")
                    self.db.update_analytics(topic, tk_views=views)
                else:
                    print(f"   [-] TK - Could not confidently match '{topic[:30]}...'")
                    
        except Exception as e:
            print(f"[Error] Failed to fetch TikTok profile for {tk_username}: {e}")
            return False
                
        print("[Success] TikTok Analytics Sync Complete!")
        return True

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--channel", type=str, default="neuron_buster")
    args = parser.parse_args()
    
    engine = AnalyticsEngine(channel_id=args.channel)
    engine.sync_youtube_analytics()
    engine.sync_instagram_analytics()
    engine.sync_tiktok_analytics()
