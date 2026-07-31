import sqlite3
conn = sqlite3.connect('nexus_media_vortex.db')
cursor = conn.cursor()
cursor.execute("SELECT id, topic, status FROM content_log")
rows = cursor.fetchall()
for row in rows:
    print(row)
conn.close()
