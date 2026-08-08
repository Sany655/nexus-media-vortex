import sqlite3
import os

db_path = os.path.join(os.getcwd(), "nexus_media_vortex.db")

def migrate():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            firebase_uid TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 2. Channels Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            channel_key TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            niche TEXT,
            target_audience TEXT,
            topic_prompt TEXT,
            script_prompt TEXT,
            visual_prompt TEXT,
            metadata_prompt TEXT,
            cta_template TEXT,
            hashtags_template TEXT,
            api_keys_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    # 3. Schedules Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_key TEXT NOT NULL,
            content_type TEXT NOT NULL,
            cron_expression TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            last_run TIMESTAMP,
            next_run TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_key) REFERENCES channels(channel_key)
        )
    ''')
    
    # 4. Update content_log
    try:
        cursor.execute("ALTER TABLE content_log ADD COLUMN content_type TEXT DEFAULT 'video'")
    except sqlite3.OperationalError:
        pass
        
    try:
        cursor.execute("ALTER TABLE content_log ADD COLUMN user_id TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE content_log ADD COLUMN channel_id TEXT")
    except sqlite3.OperationalError:
        pass
        
    conn.commit()
    conn.close()
    print("Migration successful: Added users, channels, schedules tables.")

if __name__ == "__main__":
    migrate()
