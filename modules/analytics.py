import os
import sys

# Ensure we can import from modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.database import DatabaseManager
from modules.uploader import DistributionNode

class AnalyticsEngine:
    def __init__(self):
        self.db = DatabaseManager()
        self.uploader = DistributionNode()

    def sync_youtube_analytics(self):
        print("\n📊 Starting YouTube Analytics Sync...")
        
        youtube = self.uploader.authenticate_youtube()
        if not youtube:
            print("❌ Cannot authenticate for analytics. Token missing or invalid.")
            return False

        videos = self.db.get_all_youtube_ids()
        if not videos:
            print("No YouTube IDs found in database to sync.")
            return True

        batch_size = 50
        for i in range(0, len(videos), batch_size):
            batch = videos[i:i+batch_size]
            ids = ",".join([v["youtube_id"] for v in batch])
            
            try:
                request = youtube.videos().list(part="statistics", id=ids)
                response = request.execute()
                
                stats_map = {item["id"]: int(item["statistics"].get("viewCount", 0)) for item in response.get("items", [])}
                
                for v in batch:
                    vid_id = v["youtube_id"]
                    if vid_id in stats_map:
                        views = stats_map[vid_id]
                        print(f"   📈 {v['topic'][:30]}... : {views} views")
                        self.db.update_analytics(v["topic"], yt_views=views)
                        
            except Exception as e:
                print(f"❌ Failed to fetch analytics batch: {e}")

        print("✅ YouTube Analytics Sync Complete!")
        return True

if __name__ == "__main__":
    engine = AnalyticsEngine()
    engine.sync_youtube_analytics()
