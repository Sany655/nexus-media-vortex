import sys
import datetime
import os
sys.path.append(os.path.join(os.getcwd(), 'engine'))
from engine.modules.firebase_db import FirebaseDB

def main():
    db = FirebaseDB()
    now = datetime.datetime.now()
    # Queue a test post
    db.db.collection('trigger_queue').add({
        'channel_key': 'neuron_buster',
        'status': 'Pending',
        'type': 'video', 
        'created_at': now
    })
    print("Test video generation triggered!")

if __name__ == "__main__":
    main()
