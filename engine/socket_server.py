import asyncio
import os
import sys
import json
import datetime
import subprocess
import socketio
from aiohttp import web

# Ensure engine directory in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modules.firebase_db import FirebaseDBManager

# Create async Socket.IO server with permissive CORS
sio = socketio.AsyncServer(async_mode='aiohttp', cors_allowed_origins='*')
app = web.Application()
sio.attach(app)

db_manager = None
try:
    db_manager = FirebaseDBManager()
    print("✅ [SOCKET SERVER] Firebase DB Manager initialized.")
except Exception as e:
    print(f"⚠️ [SOCKET SERVER] Firebase initialization warning: {e}")

@sio.event
async def connect(sid, environ):
    print(f"🔌 [SOCKET] Client connected: {sid}")
    await sio.emit('engine:status', {
        'status': 'online',
        'server_time': datetime.datetime.now().isoformat(),
        'pid': os.getpid()
    }, to=sid)

@sio.event
async def disconnect(sid):
    print(f"🔌 [SOCKET] Client disconnected: {sid}")

@sio.event
async def ping(sid, data=None):
    await sio.emit('engine:pong', {'timestamp': datetime.datetime.now().isoformat()}, to=sid)

@sio.on('pipeline:progress')
async def on_pipeline_progress(sid, data):
    # Re-broadcast pipeline progress to all dashboard clients
    await sio.emit('pipeline:progress', data)

@sio.on('pipeline:log')
async def on_pipeline_log(sid, data):
    # Re-broadcast logs to all dashboard clients
    await sio.emit('pipeline:log', data)

@sio.on('trigger:instant_generation')
async def on_instant_generation(sid, data):
    """
    Handles immediate generation trigger from UI Instant Generation input.
    Payload: { topic, channel_key, content_type, user_id, hint }
    """
    topic = data.get('topic')
    channel_key = data.get('channel_key', 'neuron_buster')
    content_type = data.get('content_type', 'short')
    user_id = data.get('user_id')
    hint = data.get('hint', '')

    print(f"\n⚡ [SOCKET TRIGGER] Instant Generation requested for '{topic}' ({content_type}) on channel '{channel_key}'")

    # Broadcast instant start event
    await sio.emit('pipeline:progress', {
        'stage': 'queued',
        'percent': 5,
        'details': f"Queueing generation for '{topic}'..."
    })

    try:
        if db_manager and topic:
            # 1. Log or update content queue in Firestore
            now = datetime.datetime.now()
            db_manager.db.collection('content_queue').add({
                'topic': topic,
                'channel_key': channel_key,
                'content_type': content_type,
                'status': 'Generating...',
                'created_at': now.isoformat(),
                'user_id': user_id,
                'generated_caption': hint or topic,
                'uploaded_ig': False,
                'uploaded_yt': False,
                'uploaded_tk': False,
                'uploaded_fb': False,
                'uploaded_x': False,
            })

            # 2. Add trigger to Firestore queue for persistence
            db_manager.db.collection('trigger_queue').add({
                'type': 'GENERATE_PIPELINE',
                'channel_key': channel_key,
                'content_type': content_type,
                'topic': topic,
                'status': 'Pending',
                'created_at': now.isoformat(),
                'user_id': user_id
            })

        # 3. Create override payload if custom topic
        if topic:
            override_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "override.json")
            with open(override_path, "w", encoding="utf-8") as f:
                json.dump({
                    "topic": topic,
                    "content_type": content_type,
                    "channel": channel_key,
                    "hint": hint
                }, f)

        # 4. Spawn engine pipeline asynchronously
        lock_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine.lock")
        if not os.path.exists(lock_path):
            args = ["run_genesis.bat", "--channel", channel_key, "--type", content_type, "--override", "override.json"]
            subprocess.Popen(args, cwd=os.path.dirname(os.path.abspath(__file__)), shell=True)
            await sio.emit('pipeline:progress', {
                'stage': 'started',
                'percent': 10,
                'details': f"Engine pipeline launched for '{topic}'"
            })
        else:
            await sio.emit('pipeline:log', {
                'level': 'WARN',
                'message': 'Engine is already executing another task. Job queued in Firestore.'
            })

    except Exception as e:
        print(f"❌ [SOCKET TRIGGER ERROR] {e}")
        await sio.emit('pipeline:progress', {
            'stage': 'error',
            'percent': 0,
            'details': f"Failed to start pipeline: {str(e)}"
        })

@sio.on('trigger:publish')
async def on_publish(sid, data):
    """
    Handles immediate platform publish trigger.
    Payload: { topic, channel_key, platform, user_id }
    """
    topic = data.get('topic')
    channel_key = data.get('channel_key')
    platform = data.get('platform', 'all')
    user_id = data.get('user_id')

    print(f"\n📤 [SOCKET TRIGGER] Instant Publish requested for '{topic}' to {platform}")
    await sio.emit('pipeline:progress', {
        'stage': 'uploader',
        'percent': 50,
        'details': f"Publishing '{topic}' to {platform.upper()}..."
    })

    if db_manager:
        try:
            db_manager.db.collection('trigger_queue').add({
                'type': 'PUBLISH_CONTENT',
                'topic': topic,
                'channel_key': channel_key,
                'platform': platform,
                'status': 'Pending',
                'created_at': datetime.datetime.now().isoformat(),
                'user_id': user_id
            })
        except Exception as e:
            print(f"Error adding publish trigger: {e}")

@sio.on('trigger:retry')
async def on_retry(sid, data):
    """
    Handles retry for failed/pending content.
    Payload: { topic, channel_key, user_id }
    """
    topic = data.get('topic')
    channel_key = data.get('channel_key')
    user_id = data.get('user_id')

    print(f"\n🔄 [SOCKET TRIGGER] Retry requested for '{topic}'")
    await sio.emit('pipeline:progress', {
        'stage': 'queued',
        'percent': 5,
        'details': f"Retrying generation for '{topic}'..."
    })

    if db_manager:
        try:
            db_manager.db.collection('trigger_queue').add({
                'type': 'GENERATE_PIPELINE',
                'channel_key': channel_key,
                'retryTopic': topic,
                'status': 'Pending',
                'created_at': datetime.datetime.now().isoformat(),
                'user_id': user_id
            })
        except Exception as e:
            print(f"Error adding retry trigger: {e}")

async def start_server(host="0.0.0.0", port=5001):
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    print(f"🚀 [SOCKET SERVER] Socket.IO Server running at http://{host}:{port}")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(start_server())
    loop.run_forever()
