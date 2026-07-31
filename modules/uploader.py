import os
from instagrapi import Client
import time
import json
import google_auth_oauthlib.flow
import googleapiclient.discovery
import googleapiclient.errors
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.http import MediaFileUpload

try:
    from tiktok_uploader.upload import upload_video
except ImportError:
    upload_video = None

class DistributionNode:
    def __init__(self, channel_id="neuron_buster"):
        self.channel_id = channel_id
        self.channel_dir = os.path.join(os.getcwd(), "channels", self.channel_id)

    def upload_to_instagram(self, video_path, caption="", pinned_comment=""):
        print("📱 Starting Instagram Reel Upload...")
        username = os.getenv("INSTA_USERNAME")
        password = os.getenv("INSTA_PASSWORD")
        session_file = os.path.join(self.channel_dir, "instagram_session.json")

        if not username or not password or password == "your_instagram_password_here":
            print("❌ Instagram credentials missing or default in .env")
            return False

        try:
            cl = Client()
            
            # 1. Setup Challenge Resolver (If Instagram asks for email/sms code)
            def challenge_code_handler(username, choice):
                print(f"\n🚨 INSTAGRAM SECURITY CHECK 🚨")
                print(f"Instagram sent a verification code via {choice}.")
                return input("👉 Enter the code here: ")
            
            cl.challenge_code_handler = challenge_code_handler

            # 2. Load Existing Session (Prevents "New Device" blocks)
            if os.path.exists(session_file):
                print("   📂 Loading existing session cookies...")
                cl.load_settings(session_file)

            print("   🔐 Logging into Instagram...")
            cl.login(username, password)
            
            # Save session for next time
            cl.dump_settings(session_file)
            
            print("   📤 Uploading Reel...")
            media = cl.clip_upload(video_path, caption)
            print("   ✅ Instagram Upload Successful!")
            
            # Phase 5: Engagement Node
            if media and hasattr(media, 'id'):
                try:
                    print("   👍 Auto-liking the video...")
                    cl.media_like(media.id)
                    
                    if pinned_comment:
                        print("   💬 Posting polarizing comment...")
                        cl.media_comment(media.id, pinned_comment)
                except Exception as engagement_err:
                    print(f"   ⚠️ Engagement Error (Like/Comment failed, but upload succeeded): {engagement_err}")
            
            return (True, getattr(media, 'code', None) if media else None)
        except Exception as e:
            print(f"❌ Instagram Upload Failed: {e}")
            # Do not clear session if it fails, it might just be a temporary block.
            return (False, None)

    def authenticate_youtube(self):
        """Authenticates with YouTube API using client_secret.json and saves token.json."""
        api_service_name = "youtube"
        api_version = "v3"
        client_secrets_file = os.path.join(self.channel_dir, "client_secret.json")
        token_file = os.path.join(self.channel_dir, "youtube_token.json")
        scopes = ["https://www.googleapis.com/auth/youtube.upload"]

        if not os.path.exists(client_secrets_file):
            raise FileNotFoundError("client_secret.json is missing! Cannot authenticate YouTube.")

        credentials = None
        if os.path.exists(token_file):
            try:
                credentials = Credentials.from_authorized_user_file(token_file, scopes)
            except Exception:
                pass

        if not credentials or not credentials.valid:
            if credentials and credentials.expired and credentials.refresh_token:
                try:
                    credentials.refresh(Request())
                except Exception as e:
                    print(f"⚠️ YouTube Token Refresh Failed: {e}. Re-authenticating...")
                    credentials = None
                    
            if not credentials:
                print("\n🚨 YOUTUBE AUTHENTICATION REQUIRED 🚨")
                print("A browser window will open. Please grant permission.")
                flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
                    client_secrets_file, scopes)
                credentials = flow.run_local_server(port=0)
            
            with open(token_file, "w") as f:
                f.write(credentials.to_json())

        return googleapiclient.discovery.build(api_service_name, api_version, credentials=credentials)

    def upload_to_youtube(self, video_path, title, description, private=False):
        print("\n🚀 Initiating YouTube Shorts Upload...")
        youtube = self.authenticate_youtube()
        if not youtube:
            print("❌ Cannot upload to YouTube. Not authenticated.")
            return (False, None)

        try:
            # YouTube titles have a strict 100 character limit.
            if len(title) > 90:
                title = title[:87] + "..."
            
            privacy_status = "private" if private else "public"
            
            request_body = {
                "snippet": {
                    "categoryId": "22", # People & Blogs
                    "title": title,
                    "description": description,
                    "tags": ["shorts", "trending", "ai"]
                },
                "status": {
                    "privacyStatus": privacy_status,
                    "selfDeclaredMadeForKids": False
                }
            }

            media_file = MediaFileUpload(video_path, chunksize=-1, resumable=True)

            print("⏳ Uploading payload to YouTube...")
            request = youtube.videos().insert(
                part="snippet,status",
                body=request_body,
                media_body=media_file
            )
            
            response = request.execute()
            video_id = response.get('id')
            print(f"✅ YouTube Upload Successful! Video ID: {video_id}")
            return (True, video_id)

        except Exception as e:
            print(f"❌ YouTube Upload Failed: {e}")
            return (False, None)

    def upload_to_tiktok(self, video_path, description):
        print("\n🚀 Initiating TikTok Upload...")
        
        if not upload_video:
            print("❌ tiktok-uploader module is not installed.")
            print("🎵 Starting TikTok Upload...")
        
        cookies_path = os.path.join(self.channel_dir, "tiktok_cookies.txt")
        if not os.path.exists(cookies_path):
            print("🚨 CRITICAL: tiktok_cookies.txt not found! Please export your cookies from Chrome and save them in the project folder.")
            return False

        try:
            print("⏳ Booting headless Playwright browser to inject cookies...")
            if "#fyp" not in description.lower():
                description += " #fyp #foryou #viral"
                
            # FIX: Playwright sync API cannot run in the main asyncio loop.
            # We isolate it in a separate thread.
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    upload_video,
                    filename=video_path,
                    description=description,
                    cookies=cookies_path,
                    headless=True,
                    browser="chromium"
                )
                failed_uploads = future.result()
            
            # tiktok_uploader returns a list of failed uploads (empty if successful)
            if failed_uploads:
                print("❌ TikTok Upload Failed (Browser Automation Error). Your cookies might be expired or the UI changed.")
                return False
                
            print("✅ TikTok Upload Successful!")
            return True
        except Exception as e:
            print(f"❌ TikTok Upload Crash: {e}")
            return False
