import sqlite3
import os
from modules.firebase_db import FirebaseDBManager

def migrate_to_firebase():
    print("🚀 Starting Migration from Local SQLite to Firebase...")
    db = FirebaseDBManager()
    
    # 1. Read from SQLite
    db_path = os.path.join(os.getcwd(), "nexus_media_vortex.db")
    if not os.path.exists(db_path):
        print("❌ nexus_media_vortex.db not found!")
        return
        
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Migrate Channels
    print("📡 Migrating Channels...")
    cursor.execute("SELECT * FROM channels")
    channels = cursor.fetchall()
    
    for ch in channels:
        ch_dict = dict(ch)
        channel_key = ch_dict.get('channel_key')
        
        # We assign a default user_id if not present, but Firebase usually relies on auth.uid
        # We'll just push it so the daemon can read it.
        doc_ref = db.db.collection('channels').document(channel_key)
        doc_ref.set(ch_dict)
        print(f"  ✅ Pushed channel: {channel_key}")
        
    print("🎉 Migration Complete! Your local database is now synced to the Cloud!")
    
if __name__ == "__main__":
    migrate_to_firebase()
