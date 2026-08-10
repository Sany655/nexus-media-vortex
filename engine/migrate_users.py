import sqlite3
import os
from modules.firebase_db import FirebaseDBManager
from firebase_admin import firestore

def migrate_users():
    print("🚀 Starting Migration of Users to Firebase...")
    db = FirebaseDBManager()
    
    db_path = os.path.join(os.getcwd(), "nexus_media_vortex.db")
    if not os.path.exists(db_path):
        print("❌ nexus_media_vortex.db not found!")
        return
        
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM users")
        users = cursor.fetchall()
        for row in users:
            u = dict(row)
            doc_data = {
                'firebase_uid': u.get('firebase_uid'),
                'email': u.get('email'),
                'created_at': u.get('created_at'),
                'last_login': u.get('last_login'),
                'legacy_id': u.get('id')
            }
            # Use the firebase_uid as the document ID
            doc_id = u.get('firebase_uid')
            if doc_id:
                doc_ref = db.db.collection('users').document(doc_id)
                doc_ref.set(doc_data, merge=True)
                print(f"  ✅ Pushed user: {u.get('email')}")
            else:
                print(f"  ⚠️ Skipped user with no firebase_uid: {u.get('email')}")
                
    except sqlite3.OperationalError:
        print("  ⚠️ users table does not exist or has an issue, skipping...")

    print("🎉 User Migration Complete!")
    
if __name__ == "__main__":
    migrate_users()
