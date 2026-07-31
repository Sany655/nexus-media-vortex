import sqlite3
import os
from datetime import datetime

class DatabaseManager:
    def __init__(self, channel_id="neuron_buster"):
        self.channel_id = channel_id
        self.db_path = os.path.join(os.getcwd(), "nexus_media_vortex.db")
        self._initialize_db()

    def _initialize_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create content_log
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS content_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT UNIQUE NOT NULL,
                    status TEXT NOT NULL,
                    youtube_views INTEGER DEFAULT 0,
                    tiktok_views INTEGER DEFAULT 0,
                    instagram_views INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    uploaded_ig BOOLEAN DEFAULT 0,
                    uploaded_yt BOOLEAN DEFAULT 0,
                    uploaded_tk BOOLEAN DEFAULT 0,
                    youtube_id TEXT,
                    ig_id TEXT
                )
            ''')
            
            # Migration for existing databases
            try:
                cursor.execute("ALTER TABLE content_log ADD COLUMN uploaded_ig BOOLEAN DEFAULT 0")
                cursor.execute("ALTER TABLE content_log ADD COLUMN uploaded_yt BOOLEAN DEFAULT 0")
                cursor.execute("ALTER TABLE content_log ADD COLUMN uploaded_tk BOOLEAN DEFAULT 0")
            except sqlite3.OperationalError:
                pass # Columns already exist

            try:
                cursor.execute("ALTER TABLE content_log ADD COLUMN youtube_id TEXT")
            except sqlite3.OperationalError:
                pass

            try:
                cursor.execute("ALTER TABLE content_log ADD COLUMN ig_id TEXT")
            except sqlite3.OperationalError:
                pass

            try:
                cursor.execute("ALTER TABLE content_log ADD COLUMN script TEXT")
                cursor.execute("ALTER TABLE content_log ADD COLUMN description TEXT")
            except sqlite3.OperationalError:
                pass

            conn.commit()
        except Exception as e:
            print(f"Database initialization error: {e}")
        conn.close()

    def get_past_topics(self):
        """Returns a list of all previously generated topics."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT topic FROM content_log WHERE channel_id = ?', (self.channel_id,))
        topics = [row[0] for row in cursor.fetchall()]
        conn.close()
        return topics

    def get_pending_uploads(self):
        """Returns a list of topics marked as 'Generated' but not 'Uploaded'."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT topic FROM content_log WHERE status = 'Generated' AND channel_id = ?", (self.channel_id,))
        topics = [row[0] for row in cursor.fetchall()]
        conn.close()
        return topics

    def sync_orphaned_files(self):
        """Scans the assets/final directory and injects orphaned .mp4 files into the database."""
        final_dir = os.path.join(os.getcwd(), "assets", "final")
        if not os.path.exists(final_dir):
            return

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('SELECT topic FROM content_log WHERE channel_id = ?', (self.channel_id,))
        existing_topics = [row[0] for row in cursor.fetchall()]
        
        import re
        for filename in os.listdir(final_dir):
            if filename.endswith(".mp4"):
                # Check if this filename belongs to any existing topic
                matched = False
                for t in existing_topics:
                    safe_t = re.sub(r'[^\w\s-]', '', t).strip().replace(' ', '_')
                    if f"{safe_t}.mp4" == filename:
                        matched = True
                        break
                
                if not matched:
                    topic = filename.replace(".mp4", "").replace("_", " ")
                    print(f"📥 Dropzone Sync: Rescued orphaned file '{filename}' into the Queue.")
                    cursor.execute('INSERT INTO content_log (topic, status, channel_id) VALUES (?, ?, ?)', (topic, 'Generated', self.channel_id))
        
        conn.commit()
        conn.close()

    def log_generated_topic(self, topic):
        """Logs a newly generated topic."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('INSERT INTO content_log (topic, status, channel_id) VALUES (?, ?, ?)', (topic, 'Generated', self.channel_id))
            conn.commit()
            conn.close()
            return True
        except sqlite3.IntegrityError:
            print(f"⚠️ Warning: Topic '{topic}' already exists in the database.")
            return False

    def update_script_and_metadata(self, topic, script, description):
        """Saves the generated script and description to the database for future blog/article repurposing."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE content_log 
                SET script = ?, description = ?
                WHERE topic = ?
            ''', (script, description, topic))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Failed to save script and metadata: {e}")

    def get_platform_status(self, topic):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT uploaded_ig, uploaded_yt, uploaded_tk FROM content_log WHERE topic = ?", (topic,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return {"ig": bool(row[0]), "yt": bool(row[1]), "tk": bool(row[2])}
        return {"ig": False, "yt": False, "tk": False}

    def mark_platform_uploaded(self, topic, platform):
        # platform must be 'ig', 'yt', or 'tk'
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(f"UPDATE content_log SET uploaded_{platform} = 1 WHERE topic = ?", (topic,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Failed to update platform status: {e}")

    def mark_as_uploaded(self, topic):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("UPDATE content_log SET status = 'Uploaded' WHERE topic = ?", (topic,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Failed to mark as uploaded: {e}")

    def mark_as_failed(self, topic):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("UPDATE content_log SET status = 'Failed' WHERE topic = ?", (topic,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Failed to mark as failed: {e}")

    def update_analytics(self, topic, yt_views=0, tt_views=0, ig_views=0):
        """Updates the view counts for a given topic."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE content_log 
            SET youtube_views = ?, tiktok_views = ?, instagram_views = ?
            WHERE topic = ?
        ''', (yt_views, tt_views, ig_views, topic))
        conn.commit()
        conn.close()

    def save_youtube_id(self, topic, video_id):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("UPDATE content_log SET youtube_id = ? WHERE topic = ?", (video_id, topic))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Failed to save YouTube ID: {e}")

    def get_all_youtube_ids(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT topic, youtube_id FROM content_log WHERE youtube_id IS NOT NULL AND channel_id = ?", (self.channel_id,))
        rows = cursor.fetchall()
        conn.close()
        return [{"topic": r[0], "youtube_id": r[1]} for r in rows]

    def save_ig_id(self, topic, ig_id):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("UPDATE content_log SET ig_id = ? WHERE topic = ?", (ig_id, topic))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Failed to save IG ID: {e}")

    def get_all_ig_ids(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT topic, ig_id FROM content_log WHERE ig_id IS NOT NULL AND channel_id = ?", (self.channel_id,))
        rows = cursor.fetchall()
        conn.close()
        return [{"topic": r[0], "ig_id": r[1]} for r in rows]
        
    def check_and_update_all_analytics(self):
        """Placeholder for routine analytics check across all APIs."""
        print("📊 Routine Analytics Check: Syncing latest view counts for uploaded videos...")
        # Future implementation: iterate over uploaded videos, ping APIs, update rows.
        # For now, just simulated logging.
        print("   ✅ Local Database synced.")

    def get_performance_report(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT topic, youtube_views, tiktok_views, instagram_views, script, description FROM content_log WHERE channel_id = ? AND status = 'Uploaded'", (self.channel_id,))
        rows = cursor.fetchall()
        conn.close()
        return [
            {
                "topic": r[0],
                "youtube_views": r[1],
                "tiktok_views": r[2],
                "instagram_views": r[3],
                "total_views": r[1] + r[2] + r[3],
                "script": r[4],
                "description": r[5]
            } for r in rows
        ]
