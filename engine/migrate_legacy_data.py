import sqlite3
import os
import json
from modules.firebase_db import FirebaseDBManager
from firebase_admin import firestore

def migrate_legacy_data():
    print("🚀 Starting Migration of Legacy Data (content_log and schedules) to Firebase...")
    db = FirebaseDBManager()
    
    db_path = os.path.join(os.getcwd(), "nexus_media_vortex.db")
    if not os.path.exists(db_path):
        print("❌ nexus_media_vortex.db not found!")
        return
        
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. Migrate Content Log -> content_queue
    print("📡 Migrating content_log to content_queue...")
    cursor.execute("SELECT * FROM content_log")
    logs = cursor.fetchall()
    for row in logs:
        log = dict(row)
        # Construct the firestore document
        doc_data = {
            'topic': log.get('topic'),
            'status': log.get('status', 'Generated'),
            'youtube_views': log.get('youtube_views', 0),
            'tiktok_views': log.get('tiktok_views', 0),
            'instagram_views': log.get('instagram_views', 0),
            'uploaded_yt': bool(log.get('uploaded_yt')),
            'uploaded_ig': bool(log.get('uploaded_ig')),
            'uploaded_tk': bool(log.get('uploaded_tk')),
            'youtube_id': log.get('youtube_id'),
            'ig_id': log.get('ig_id'),
            'script': log.get('script'),
            'description': log.get('description'),
            'channel_key': log.get('channel_id'),  # Map channel_id to channel_key
            'content_type': log.get('content_type', 'video'),
            'user_id': log.get('user_id'),
            'legacy_id': log.get('id')
        }
        
        # We handle created_at separately
        created_at_str = log.get('created_at')
        if created_at_str:
            try:
                import datetime
                try:
                    dt = datetime.datetime.strptime(created_at_str, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    dt = datetime.datetime.strptime(created_at_str, "%Y-%m-%d %H:%M:%S.%f")
                doc_data['created_at'] = dt
            except Exception as e:
                print(f"    [Warning] Could not parse date {created_at_str}: {e}")
        
        doc_ref = db.db.collection('content_queue').document()
        doc_ref.set(doc_data)
        
        print(f"  ✅ Pushed log: {log.get('topic')}")

    # 2. Migrate Schedules
    print("📡 Migrating schedules...")
    try:
        cursor.execute("SELECT * FROM schedules")
        schedules = cursor.fetchall()
        for row in schedules:
            sched = dict(row)
            doc_data = {
                'channel_key': sched.get('channel_key'),
                'content_type': sched.get('content_type'),
                'cron_expression': sched.get('cron_expression'),
                'is_active': bool(sched.get('is_active')),
                'last_run': sched.get('last_run'),
                'next_run': sched.get('next_run'),
                'legacy_id': sched.get('id')
            }
            doc_ref = db.db.collection('schedules').document()
            doc_ref.set(doc_data)
            print(f"  ✅ Pushed schedule for: {sched.get('channel_key')}")
    except sqlite3.OperationalError:
        print("  ⚠️ schedules table does not exist or has an issue, skipping...")

    print("🎉 Migration Complete! Your legacy logs and schedules are now in the Cloud!")
    
if __name__ == "__main__":
    migrate_legacy_data()
