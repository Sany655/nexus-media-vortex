import os
import firebase_admin
from firebase_admin import credentials, firestore

class FirebaseDBManager:
    """
    The central intelligence connection to the Cloud Database (Firestore).
    This allows the local Python daemon to read configs and report telemetry to the UI.
    """
    def __init__(self):
        # 1. Initialize Firebase Admin if not already initialized
        if not firebase_admin._apps:
            cred_path = os.path.join(os.getcwd(), "firebase_credentials.json")
            if not os.path.exists(cred_path):
                raise FileNotFoundError("CRITICAL ERROR: firebase_credentials.json not found in root directory!")
            
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            
        # 2. Get Firestore Client
        self.db = firestore.client()
        
    # --- CHANNELS ---
    def get_all_channels(self):
        """Fetches all channels from Firestore"""
        channels = []
        docs = self.db.collection('channels').stream()
        for doc in docs:
            c = doc.to_dict()
            c['id'] = doc.id
            channels.append(c)
        return channels
        
    def get_channel_config(self, channel_key):
        """Fetches the configuration for a specific channel"""
        docs = self.db.collection('channels').where('channel_key', '==', channel_key).limit(1).stream()
        for doc in docs:
            return doc.to_dict()
        return None
        
    def update_channel_shadowban(self, channel_key, platform, level, cooldown_end=None):
        """Updates the shadowban state for a channel"""
        docs = self.db.collection('channels').where('channel_key', '==', channel_key).limit(1).stream()
        for doc in docs:
            update_data = {
                f"shadowban_levels.{platform}": level
            }
            if cooldown_end:
                update_data[f"cooldown_end.{platform}"] = cooldown_end
            doc.reference.update(update_data)
            
    # --- SCHEDULES ---
    def get_active_schedules(self):
        """Fetches all active schedules for the daemon to process"""
        schedules = []
        docs = self.db.collection('schedules').where('is_active', '==', True).stream()
        for doc in docs:
            s = doc.to_dict()
            s['id'] = doc.id
            schedules.append(s)
        return schedules
        
    def update_schedule_run(self, schedule_id, next_run_iso, last_run_iso):
        """Updates the schedule timestamps after a successful trigger"""
        doc_ref = self.db.collection('schedules').document(schedule_id)
        doc_ref.update({
            'next_run': next_run_iso,
            'last_run': last_run_iso
        })

    # --- TELEMETRY / CONTENT LOG ---
    def log_generated_video(self, channel_key, topic, content_type="video"):
        """Logs a newly generated video into the queue"""
        self.db.collection('content_queue').add({
            'channel_key': channel_key,
            'topic': topic,
            'content_type': content_type,
            'status': 'Generated',
            'created_at': firestore.SERVER_TIMESTAMP,
            'youtube_views': 0,
            'tiktok_views': 0,
            'instagram_views': 0,
            'uploaded_yt': False,
            'uploaded_ig': False,
            'uploaded_tk': False
        })
        return True
        
    def mark_platform_uploaded(self, topic, platform, video_id=None):
        """Marks a specific platform as uploaded for a video"""
        docs = self.db.collection('content_queue').where('topic', '==', topic).limit(1).stream()
        for doc in docs:
            update_data = {f"uploaded_{platform}": True}
            if video_id:
                update_data[f"{platform}_id"] = video_id
            doc.reference.update(update_data)
            
    def mark_as_failed(self, topic, error_msg=""):
        """Marks a generation/upload as failed"""
        docs = self.db.collection('content_queue').where('topic', '==', topic).limit(1).stream()
        for doc in docs:
            doc.reference.update({'status': 'Failed', 'error': error_msg})

    def update_script_and_metadata(self, topic, script, description):
        """Saves the AI generated script and description"""
        docs = self.db.collection('content_queue').where('topic', '==', topic).limit(1).stream()
        for doc in docs:
            doc.reference.update({
                'script': script,
                'description': description
            })

    def get_performance_report(self, channel_key):
        """Gets all uploaded videos for the Brain to analyze"""
        docs = self.db.collection('content_queue').where('channel_key', '==', channel_key).stream()
        report = []
        for doc in docs:
            data = doc.to_dict()
            if data.get('script'):
                report.append(data)
        return report
