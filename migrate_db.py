import sqlite3
import os

db_path = os.path.join(os.getcwd(), 'nexus_media_vortex.db')
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE content_log ADD COLUMN channel_id TEXT DEFAULT 'neuron_buster'")
        print("✅ Column 'channel_id' added successfully.")
    except sqlite3.OperationalError as e:
        print(f"⚠️ Column might already exist: {e}")
    conn.commit()
    conn.close()
else:
    print("Database not found.")
