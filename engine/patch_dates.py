import sqlite3
import datetime
from modules.firebase_db import FirebaseDBManager

db = FirebaseDBManager()

conn = sqlite3.connect('nexus_media_vortex.db')
cursor = conn.cursor()

cursor.execute("SELECT id, created_at FROM content_log WHERE created_at IS NOT NULL")
rows = cursor.fetchall()

updates = 0
for row in rows:
    legacy_id = row[0]
    created_at_str = row[1]
    
    try:
        # SQLite datetime is usually "YYYY-MM-DD HH:MM:SS"
        dt = datetime.datetime.strptime(created_at_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            dt = datetime.datetime.strptime(created_at_str, "%Y-%m-%d %H:%M:%S.%f")
        except ValueError:
            print(f"Skipping invalid date: {created_at_str}")
            continue

    # Find the document in Firebase
    docs = db.db.collection('content_queue').where('legacy_id', '==', legacy_id).stream()
    for doc in docs:
        doc.reference.update({
            'created_at': dt
        })
        updates += 1

print(f"Updated {updates} documents with legacy created_at timestamps.")
