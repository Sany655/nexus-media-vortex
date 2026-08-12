import asyncio
from modules.brain import ContentBrain
from modules.asset_manager import AssetManager
from modules.audio import AudioEngine
from modules.composer import Composer
from modules.uploader import DistributionNode
from modules.database import DatabaseManager
import argparse
import json
import os
import shutil

def clean_cache():
    """
    Safely deletes temporary files.
    Includes a Safety Lock to prevent deleting anything outside the project.
    """
    print("🧹 Cleaning up temporary files...")
    
    # 1. Define the specific target folders
    folders_to_clean = [
        os.path.join(os.getcwd(), "assets", "audio_clips"),
        os.path.join(os.getcwd(), "assets", "video_clips"),
        os.path.join(os.getcwd(), "assets", "temp")
    ]

    for folder in folders_to_clean:
        # SAFETY CHECK 1: Ensure folder actually exists
        if not os.path.exists(folder):
            continue
            
        # SAFETY CHECK 2: Double check we are inside our project "assets" folder
        # This prevents the script from ever touching C:\ or System32
        if "assets" not in folder:
            print(f"   🚨 SECURITY ALERT: Skipping {folder} because it looks unsafe!")
            continue

        # Loop through files inside the folder
        for filename in os.listdir(folder):
            file_path = os.path.join(folder, filename)
            
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path) # Delete the file
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path) # Delete subfolders if any
            except Exception as e:
                pass
    
    print("✨ Workspace clean!")

def is_video_complete(filepath, topic):
    """Safety Check: Ensures the video file is not corrupt and the title is valid before uploading."""
    if not os.path.exists(filepath):
        return False
        
    # 1. Title Validation: Prevent test/dummy titles from leaking to the public channel
    invalid_titles = ["final short", "test", "dummy", "video", "untitled"]
    if any(invalid.lower() == topic.lower().strip() for invalid in invalid_titles) or "final short" in topic.lower():
        print(f"🚨 CRITICAL: Topic '{topic}' appears to be a test/dummy title. Aborting upload to protect channel.")
        return False

    # 2. File Size Validation: A valid 60-second video will be at least 1-2 MB.
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    if size_mb < 0.5:
        print(f"🚨 CRITICAL: Video file {os.path.basename(filepath)} is only {size_mb:.2f} MB. This indicates an incomplete or corrupt render.")
        return False
        
    return True

async def main():
    parser = argparse.ArgumentParser(description="Nexus Media Vortex Override")
    parser.add_argument("--override", type=str, help="Path to override.json", default=None)
    parser.add_argument("--ig", type=str, help="Upload to IG", default="true")
    parser.add_argument("--yt", type=str, help="Upload to YT", default="true")
    parser.add_argument("--tk", type=str, help="Upload to TikTok", default="true")
    parser.add_argument("--private", type=str, help="Upload as Private (YT only)", default="false")
    parser.add_argument("--channel", type=str, help="Channel ID", default="neuron_buster")
    parser.add_argument("--type", type=str, help="Content Type (video, short, post, image)", default="video")
    args = parser.parse_args()

    # Convert string flags to boolean
    upload_ig = args.ig.lower() == "true"
    upload_yt = args.yt.lower() == "true"
    upload_tk = args.tk.lower() == "true"
    private_mode = args.private.lower() == "true"
    channel_id = args.channel
    content_type = args.type
    pipeline_mode = "autonomous"  # default

    # Load channel config from Firebase to get pipeline_mode and platform settings
    try:
        from modules.firebase_db import FirebaseDBManager
        fdb = FirebaseDBManager()
        ch_config = fdb.get_channel_config(channel_id)
        if ch_config:
            api_keys = json.loads(ch_config.get('api_keys_json', '{}'))
            pipeline_mode = api_keys.get('pipeline_mode', 'autonomous')
            if api_keys.get("pause_ig") or api_keys.get("disable_ig"): upload_ig = False
            if api_keys.get("pause_yt") or api_keys.get("disable_yt"): upload_yt = False
            if api_keys.get("pause_tk") or api_keys.get("disable_tk"): upload_tk = False
            # Check content-type platform permissions
            ig_types = api_keys.get('ig_content_types', ['short', 'image'])
            yt_types = api_keys.get('yt_content_types', ['short', 'video'])
            tk_types = api_keys.get('tk_content_types', ['short'])
            if content_type not in ig_types: upload_ig = False
            if content_type not in yt_types: upload_yt = False
            if content_type not in tk_types: upload_tk = False
    except Exception as e:
        print(f"⚠️ Could not load Firebase channel config: {e}. Using defaults.")
        # Fallback: check local config file
        config_path = os.path.join(os.getcwd(), 'channels', channel_id, 'config.json')
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                cfg = json.load(f)
                pipeline_mode = cfg.get('pipeline_mode', 'autonomous')
                if cfg.get("pause_ig") or cfg.get("disable_ig"): upload_ig = False
                if cfg.get("pause_yt") or cfg.get("disable_yt"): upload_yt = False
                if cfg.get("pause_tk") or cfg.get("disable_tk"): upload_tk = False

    print(f"📋 PIPELINE MODE: {pipeline_mode.upper()}")

    # Start log trace
    print("\n" + "="*50)
    print("🚀 INITIALIZING Nexus Media Vortex ORCHESTRATOR")
    print(f"📡 VECTORS: IG={upload_ig} | YT={upload_yt} | TK={upload_tk} | PRIVATE={private_mode} | CHANNEL={channel_id} | TYPE={content_type}")
    print("="*50 + "\n")
    
    # 0. DROPZONE SYNC
    db = DatabaseManager(channel_id=channel_id)
    
    # Run routine analytics check
    db.check_and_update_all_analytics()
    
    # 0. DROPZONE SYNC
    db.sync_orphaned_files()
    
    # Fetch Pexels API Key
    pexels_api_key = None
    try:
        from modules.firebase_db import FirebaseDBManager
        fdb = FirebaseDBManager()
        ch_config = fdb.get_channel_config(channel_id)
        if ch_config:
            api_keys = json.loads(ch_config.get('api_keys_json', '{}'))
            pexels_api_key = api_keys.get('pexels_api_key')
    except Exception as e:
        print(f"⚠️ Could not load Firebase channel config for keys: {e}")
    
    # 0.5 GHOST STUDIO OVERRIDE CHECK
    custom_topic = None
    custom_script = None
    if args.override and os.path.exists(args.override):
        print(f"👻 Ghost Studio Override Detected: Loading {args.override}")
        with open(args.override, "r") as f:
            override_data = json.load(f)
            custom_payload = override_data
            override_mode = True
    else:
        custom_payload = {}
        override_mode = False

    custom_topic = custom_payload.get("topic") if override_mode else None
    custom_script = custom_payload.get("script") if override_mode else None
    retry_topic = custom_payload.get("retryTopic") if override_mode else None
    if override_mode and custom_payload.get("content_type"):
        content_type = custom_payload.get("content_type")

    # 0.75 CHECK UPLOAD QUEUE
    if not custom_topic:
        import sqlite3
        conn = sqlite3.connect(db.db_path)
        cursor = conn.cursor()
        if retry_topic:
            cursor.execute("SELECT topic FROM content_log WHERE topic = ?", (retry_topic,))
        else:
            cursor.execute("SELECT topic FROM content_log WHERE status != 'Uploaded' AND status != 'Failed' OR (status = 'Uploaded' AND (uploaded_ig = 0 OR uploaded_yt = 0 OR uploaded_tk = 0))")
        pending_rows = cursor.fetchall()
        conn.close()
        
        if pending_rows:
            print(f"\n🚨 QUEUE RESCUE: Found {len(pending_rows)} pending videos. Attempting to upload...")
            for row in pending_rows:
                topic = row[0]
                import re
                safe_topic = re.sub(r'[^\w\s-]', '', topic).strip().replace(' ', '_')
                final_filename = f"{safe_topic}.mp4"
                final_filepath = os.path.join(os.getcwd(), "assets", "final", final_filename)
                
                if not os.path.exists(final_filepath):
                    print(f"⚠️ Warning: File {final_filename} not found for pending topic. Attempting recovery...")
                    platform_status = db.get_platform_status(topic)
                    youtube_ids = {item['topic']: item['youtube_id'] for item in db.get_all_youtube_ids()}
                    ig_ids = {item['topic']: item['ig_id'] for item in db.get_all_ig_ids()}
                    
                    if platform_status["yt"] and topic in youtube_ids:
                        yt_id = youtube_ids[topic]
                        print(f"🔄 Recovering video from YouTube...")
                        import subprocess
                        subprocess.run(["yt-dlp", "-o", final_filepath, f"https://www.youtube.com/watch?v={yt_id}"])
                    elif platform_status["ig"] and topic in ig_ids:
                        ig_id = ig_ids[topic]
                        print(f"🔄 Recovering video from Instagram...")
                        import subprocess
                        subprocess.run(["yt-dlp", "-o", final_filepath, f"https://www.instagram.com/p/{ig_id}/"])
                        
                    if not os.path.exists(final_filepath):
                        if retry_topic:
                            print(f"🔄 Auto-Recovery Initiated: Video file missing for '{topic}'. Regenerating from scratch...")
                            custom_topic = topic
                            break
                        else:
                            db.mark_as_failed(topic)
                            continue

                if not is_video_complete(final_filepath, topic):
                    print(f"⚠️ Warning: File {final_filename} is corrupt, incomplete, or invalid. Marking as failed to drop from queue.")
                    db.mark_as_failed(topic)
                    continue

                if True:
                    print(f"\n🚀 Phase 3.5: Rescuing {final_filename} from queue...")
                    uploader = DistributionNode(channel_id=channel_id)
                    brain = ContentBrain(channel_id=channel_id)
                    
                    # Generate Metadata dynamically even without script
                    metadata = brain.generate_metadata(None, topic)
                    caption = f"{metadata.get('caption', topic)}\n\n{metadata.get('hashtags', '#shorts')}"
                    pinned_comment = metadata.get("pinned_comment", "")
                    
                    platform_status = db.get_platform_status(topic)

                    success_ig = platform_status["ig"]
                    success_yt = platform_status["yt"]
                    success_tk = platform_status["tk"]

                    if upload_ig and not success_ig:
                        ig_result = uploader.upload_to_instagram(final_filepath, caption, pinned_comment)
                        if type(ig_result) is tuple:
                            success_ig, ig_id = ig_result
                            if success_ig: 
                                db.mark_platform_uploaded(topic, "ig")
                                if ig_id: db.save_ig_id(topic, ig_id)
                        else:
                            success_ig = ig_result
                            if success_ig: db.mark_platform_uploaded(topic, "ig")
                    elif not upload_ig:
                        print("⏭️ Skipping Instagram Upload (Disabled).")
                        success_ig = True # Treat disabled as success for queue clearing

                    if upload_yt and not success_yt:
                        yt_title = topic
                        yt_desc = f"{caption}\n\n#shorts"
                        yt_result = uploader.upload_to_youtube(final_filepath, yt_title, yt_desc, private=private_mode)
                        if type(yt_result) is tuple:
                            success_yt, yt_id = yt_result
                            if success_yt: 
                                db.mark_platform_uploaded(topic, "yt")
                                if yt_id: db.save_youtube_id(topic, yt_id)
                        else:
                            success_yt = yt_result # Fallback if uploader wasn't updated
                            if success_yt: db.mark_platform_uploaded(topic, "yt")
                    elif not upload_yt:
                        print("⏭️ Skipping YouTube Upload (Disabled).")
                        success_yt = True

                    if upload_tk and not success_tk:
                        yt_desc = f"{caption}\n\n#shorts"
                        success_tk = uploader.upload_to_tiktok(final_filepath, yt_desc)
                        if success_tk: 
                            db.mark_platform_uploaded(topic, "tk")
                            db.reset_tk_retry(topic)
                        else:
                            retry_count = db.increment_tk_retry(topic)
                            if retry_count >= 3:
                                print("\n=========================================================")
                                print("🚨 FATAL TIKTOK ERROR: MAXIMUM RETRIES (3) REACHED! 🚨")
                                print("=========================================================")
                                print("TikTok has blocked this upload 3 times today!")
                                print("Spawning tiktok_login_helper.py to refresh cookies...")
                                print("=========================================================\n")
                                db.update_status(topic, "TK_AUTH_SUSPENDED")
                                import subprocess
                                helper_result = subprocess.run(["python", "tiktok_login_helper.py"])
                                if helper_result.returncode == 0:
                                    print("✅ Cookie refreshed! Resuming upload instantly...")
                                    db.reset_tk_retry(topic)
                                    db.update_status(topic, "Uploading...")
                                    success_tk = uploader.upload_to_tiktok(final_filepath, yt_desc)
                                    if success_tk:
                                        db.mark_platform_uploaded(topic, "tk")
                    elif not upload_tk:
                        print("⏭️ Skipping TikTok Upload (Disabled).")
                        success_tk = True
                    
                    if success_ig and success_yt and success_tk:
                        db.mark_as_uploaded(topic)
                        print("✅ Queue cleared. Run again to generate a new video.")
                    else:
                        print("❌ Queue rescue finished with pending platforms. Please fix the issue and run again.")
                    
                    print("\n==================================================")
                    print(f"🏁 RESCUE SUMMARY FOR: {topic}")
                    print("==================================================")
                    print(f"📱 Instagram : {'✅ Done' if success_ig else '❌ Failed/Pending'}")
                    print(f"🎥 YouTube   : {'✅ Done' if success_yt else '❌ Failed/Pending'}")
                    print(f"🎵 TikTok    : {'✅ Done' if success_tk else '❌ Failed/Pending'}")
                    print("==================================================")
                    return # Exit after processing queue
                    
                    return # Exit after processing queue

    # 1. BRAIN: Get Script
    brain = ContentBrain(channel_id=channel_id)
    try:
        topic = custom_topic if custom_topic else brain.get_trending_topic()
        
        if custom_script:
            print("📝 Using Ghost Studio Custom Script.")
            script = custom_script
        else:
            script = brain.generate_script(topic)
        
        # Log to database if not custom (or log custom too)
        if not custom_topic:
            db.log_generated_topic(topic, content_type)
        else:
            db.log_generated_topic(topic, content_type)
            
        if not script:
            raise ValueError("Script generation returned None or empty.")

        # Early exit for non-video content types
        if content_type in ["post", "image"]:
            print(f"\n🚀 Phase 6: Distributing {content_type}...")
            caption = script[0].get("text", "") if content_type == "post" else script[0].get("caption", "")
            db.update_script_and_metadata(topic, str(script), caption)
            db.mark_platform_uploaded(topic, "ig")
            db.mark_platform_uploaded(topic, "yt")
            db.mark_platform_uploaded(topic, "tk")
            db.mark_as_uploaded(topic)
            print(f"🎉 Pipeline Complete! '{topic}' {content_type} is live (Simulated Upload).")
            return

        # 2. AUDIO: Generate Voice
        audio_engine = AudioEngine() 
        script = await audio_engine.process_script(script)

        # 3. ASSETS: Get Stock Video
        asset_manager = AssetManager(api_key=pexels_api_key)
        assets_map = asset_manager.get_videos(script)

        # 4. COMPOSER: Merge Video + Audio
        composer = Composer()
        final_scene_paths = composer.render_all_scenes(script, assets_map)
        
        # 5. STITCH WITH TRANSITIONS
        if final_scene_paths:
            import re
            safe_topic = re.sub(r'[^\w\s-]', '', topic).strip().replace(' ', '_')
            final_filename = f"{safe_topic}.mp4"
            composer.concatenate_with_transitions(final_scene_paths, final_filename)
            clean_cache()
            
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg or "Quota exceeded" in error_msg:
            print("❌ API Rate Limit Exceeded.")
        else:
            print(f"🚨 PIPELINE CRASHED: {e}")
        
        # Report crash to Database
        try:
            db.mark_as_failed(topic) if 'topic' in locals() else None
            from modules.firebase_db import FirebaseDBManager
            fdb = FirebaseDBManager()
            fdb.mark_as_failed(topic if 'topic' in locals() else "Unknown Topic", f"Pipeline Crash: {error_msg}")
        except:
            pass
        return

        # Check pipeline mode — if manual_review, save to Firebase and stop before uploading
        if pipeline_mode == "manual_review":
            print(f"\n🔍 PIPELINE MODE: Manual Review — Skipping upload for '{topic}'.")
            print(f"   Content is ready. User will publish from the dashboard.")
            # Save to Firebase as 'Ready for Review'
            try:
                from modules.firebase_db import FirebaseDBManager
                fdb = FirebaseDBManager()
                metadata = brain.generate_metadata(None, topic)
                caption = f"{metadata.get('caption', topic)}"
                hashtags = metadata.get('hashtags', '')
                fdb.log_generated_video(channel_id, topic, content_type)
                fdb.update_script_and_metadata(topic, str(script), caption)
                # Mark as Ready for Review in Firestore
                docs_ref = fdb.db.collection('content_queue').where('topic', '==', topic).limit(1).stream()
                for doc_ref in docs_ref:
                    doc_ref.reference.update({
                        'status': 'Ready for Review',
                        'generated_caption': caption,
                        'generated_hashtags': hashtags,
                        'pipeline_mode': 'manual_review',
                        'video_filename': final_filename,
                    })
            except Exception as e:
                print(f"⚠️ Could not update Firestore for review mode: {e}")
            db.update_status(topic, 'Ready for Review') if hasattr(db, 'update_status') else None
            print("="*50)
            print(f"✅ '{topic}' is ready for review in the dashboard.")
            print("="*50)
            return

        # 6. DISTRIBUTION NODE & ENGAGEMENT NODE: Auto-Upload
        print(f"\n🚀 Phase 6: Distributing and Engaging {final_filename}...")
        uploader = DistributionNode(channel_id=channel_id)
        
        # 1.5 METADATA: Dynamic Caption and Pinned Comment
        metadata = brain.generate_metadata(script, topic)
        caption = f"{metadata.get('caption', topic)}\n\n{metadata.get('hashtags', '#shorts')}"
        pinned_comment = metadata.get("pinned_comment", "")
        
        # Save script and metadata to database for future repurposing
        db.update_script_and_metadata(topic, script, caption)
        
        final_filepath = os.path.join(composer.final_dir, final_filename)
        actual_upload_path = final_scene_paths[-1] if not os.path.exists(final_filepath) else final_filepath

        if not is_video_complete(actual_upload_path, topic):
            print(f"🚨 CRITICAL ABORT: The generated video is incomplete/corrupt or the title is invalid. Aborting upload to protect channel reputation.")
            db.mark_as_failed(topic) # Mark as failed so we don't try to rescue a broken file later
            return

        platform_status = db.get_platform_status(topic)

        success_ig = platform_status["ig"]
        success_yt = platform_status["yt"]
        success_tk = platform_status["tk"]

        if upload_ig and not success_ig:
            ig_result = uploader.upload_to_instagram(actual_upload_path, caption, pinned_comment)
            if type(ig_result) is tuple:
                success_ig, ig_id = ig_result
                if success_ig: 
                    db.mark_platform_uploaded(topic, "ig")
                    if ig_id: db.save_ig_id(topic, ig_id)
            else:
                success_ig = ig_result
                if success_ig: db.mark_platform_uploaded(topic, "ig")
        elif not upload_ig:
            print("⏭️ Skipping Instagram Upload (Disabled).")
            success_ig = True

        if upload_yt and not success_yt:
            yt_title = topic
            yt_desc = f"{caption}\n\n#shorts"
            yt_result = uploader.upload_to_youtube(actual_upload_path, yt_title, yt_desc, private=private_mode)
            if type(yt_result) is tuple:
                success_yt, yt_id = yt_result
                if success_yt: 
                    db.mark_platform_uploaded(topic, "yt")
                    if yt_id: db.save_youtube_id(topic, yt_id)
            else:
                success_yt = yt_result
                if success_yt: db.mark_platform_uploaded(topic, "yt")
        elif not upload_yt:
            print("⏭️ Skipping YouTube Upload (Disabled).")
            success_yt = True

        if upload_tk and not success_tk:
            yt_desc = f"{caption}\n\n#shorts"
            success_tk = uploader.upload_to_tiktok(actual_upload_path, yt_desc)
            if success_tk: 
                db.mark_platform_uploaded(topic, "tk")
                db.reset_tk_retry(topic)
            else:
                retry_count = db.increment_tk_retry(topic)
                if retry_count >= 3:
                    print("\n=========================================================")
                    print("🚨 FATAL TIKTOK ERROR: MAXIMUM RETRIES (3) REACHED! 🚨")
                    print("=========================================================")
                    print("TikTok has blocked this upload 3 times today!")
                    print("Spawning tiktok_login_helper.py to refresh cookies...")
                    print("=========================================================\n")
                    db.update_status(topic, "TK_AUTH_SUSPENDED")
                    import subprocess
                    helper_result = subprocess.run(["python", "tiktok_login_helper.py"])
                    if helper_result.returncode == 0:
                        print("✅ Cookie refreshed! Resuming upload instantly...")
                        db.reset_tk_retry(topic)
                        db.update_status(topic, "Uploading...")
                        success_tk = uploader.upload_to_tiktok(actual_upload_path, yt_desc)
                        if success_tk:
                            db.mark_platform_uploaded(topic, "tk")
        elif not upload_tk:
            print("⏭️ Skipping TikTok Upload (Disabled).")
            success_tk = True
        
        if success_ig and success_yt and success_tk:
            db.mark_as_uploaded(topic)
            print(f"🎉 Pipeline Complete! '{topic}' is live.")
            
        print("\n==================================================")
        print("🏁 UPLOAD SUMMARY")
        print("==================================================")
        print(f"📱 Instagram : {'✅ Done' if success_ig else '❌ Failed/Pending'}")
        print(f"🎥 YouTube   : {'✅ Done' if success_yt else '❌ Failed/Pending'}")
        print(f"🎵 TikTok    : {'✅ Done' if success_tk else '❌ Failed/Pending'}")
        print("==================================================")
        
    else:
        print("❌ Failed to generate any scenes.")

if __name__ == "__main__":
    asyncio.run(main())