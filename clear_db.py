import sqlite3
import os

db_path = os.path.join(os.getcwd(), 'nexus_media_vortex.db')
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM content_log')
    # Reset auto-increment counter
    cursor.execute('DELETE FROM sqlite_sequence WHERE name="content_log"')
    conn.commit()
    conn.close()
    print("✅ Database cleared successfully.")
else:
    print("Database not found.")
