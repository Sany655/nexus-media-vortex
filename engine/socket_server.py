import asyncio
import os
import sys
import json
import datetime
import subprocess
import socketio
from aiohttp import web

# Force UTF-8 encoding on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Ensure engine directory in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modules.firebase_db import FirebaseDBManager
from modules.scheduler_manager import DeterministicScheduler
from modules.web_researcher import fetch_page_content

sio = socketio.AsyncServer(async_mode='aiohttp', cors_allowed_origins='*')
app = web.Application()
sio.attach(app)

db_manager = None
scheduler = None

try:
    db_manager = FirebaseDBManager()
    print("✅ [SOCKET SERVER] Firebase DB Manager initialized.")
except Exception as e:
    print(f"⚠️ [SOCKET SERVER] Firebase initialization warning: {e}")

async def execute_pipeline(channel_key, content_type="video", topic=None, hint="", retry_topic=None):
    """Unified pipeline trigger helper."""
    print(f"\n🚀 [PIPELINE TRIGGER] Launching engine for '{channel_key}' ({content_type})")
    
    # 1. Sync Analytics before generation
    if db_manager:
        try:
            db_manager.check_and_update_all_analytics()
        except Exception as e:
            print(f"Analytics check error: {e}")

    # 2. Write override payload if applicable
    override_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "override.json")
    if topic or retry_topic or hint:
        payload = {}
        if topic: payload["topic"] = topic
        if retry_topic: payload["retryTopic"] = retry_topic
        if hint: payload["hint"] = hint
        payload["content_type"] = content_type
        payload["channel"] = channel_key
        with open(override_path, "w", encoding="utf-8") as f:
            json.dump(payload, f)
    elif os.path.exists(override_path):
        os.remove(override_path)

    # 3. Launch main.py
    lock_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine.lock")
    if not os.path.exists(lock_path):
        args = ["run_genesis.bat", "--channel", channel_key, "--type", content_type]
        if os.path.exists(override_path):
            args.extend(["--override", "override.json"])
        subprocess.Popen(args, cwd=os.path.dirname(os.path.abspath(__file__)), shell=True)
        await sio.emit('pipeline:progress', {
            'stage': 'started',
            'percent': 10,
            'details': f"Engine started for {channel_key} ({content_type})"
        })
    else:
        await sio.emit('pipeline:log', {
            'level': 'WARN',
            'message': 'Engine is currently executing another task. Job will run once current task finishes.'
        })

# Instantiate Deterministic Scheduler
scheduler = DeterministicScheduler(db_manager=db_manager, on_trigger_callback=execute_pipeline)

@sio.event
async def connect(sid, environ):
    print(f"🔌 [SOCKET] Client connected: {sid}")
    schedules_info = []
    if scheduler:
        for s_id, s_data in scheduler.active_schedules.items():
            schedules_info.append({
                'channel_key': s_data['channel_key'],
                'content_type': s_data['content_type'],
                'cron_expression': s_data['cron_expression'],
                'next_run': s_data['next_run'].isoformat() if s_data.get('next_run') else None
            })

    await sio.emit('engine:status', {
        'status': 'online',
        'server_time': datetime.datetime.now().isoformat(),
        'pid': os.getpid(),
        'schedules': schedules_info
    }, to=sid)

@sio.event
async def disconnect(sid):
    print(f"🔌 [SOCKET] Client disconnected: {sid}")

@sio.on('pipeline:progress')
async def on_pipeline_progress(sid, data):
    await sio.emit('pipeline:progress', data)

@sio.on('pipeline:log')
async def on_pipeline_log(sid, data):
    await sio.emit('pipeline:log', data)

@sio.on('schedule:update')
async def on_schedule_update(sid, data):
    """
    Handles instant schedule updates from the Dashboard.
    Payload: { channel_key, content_type, cron_expression, user_id }
    """
    channel_key = data.get('channel_key')
    content_type = data.get('content_type', 'video')
    cron_expression = data.get('cron_expression')
    user_id = data.get('user_id')

    print(f"\n⏰ [SOCKET SCHEDULE] Updating schedule for {channel_key} ({content_type}) to '{cron_expression}'")

    if scheduler and cron_expression:
        success, next_run_str = scheduler.update_schedule(channel_key, content_type, cron_expression)
        
        # Also persist to Firestore
        if db_manager and success:
            try:
                from google.cloud.firestore import FieldFilter
                docs = db_manager.db.collection('schedules').where(filter=FieldFilter('channel_key', '==', channel_key)).where(filter=FieldFilter('content_type', '==', content_type)).stream()
                found = False
                for d in docs:
                    found = True
                    d.reference.update({
                        'cron_expression': cron_expression,
                        'next_run': next_run_str,
                        'is_active': True,
                        'updated_at': datetime.datetime.now().isoformat()
                    })
                if not found:
                    db_manager.db.collection('schedules').add({
                        'channel_key': channel_key,
                        'content_type': content_type,
                        'cron_expression': cron_expression,
                        'next_run': next_run_str,
                        'is_active': True,
                        'created_at': datetime.datetime.now().isoformat(),
                        'user_id': user_id
                    })
            except Exception as e:
                print(f"Firestore schedule save error: {e}")

        await sio.emit('schedule:updated', {
            'channel_key': channel_key,
            'content_type': content_type,
            'cron_expression': cron_expression,
            'next_run': next_run_str
        })

@sio.on('trigger:instant_generation')
async def on_instant_generation(sid, data):
    topic = data.get('topic')
    channel_key = data.get('channel_key', 'neuron_buster')
    content_type = data.get('content_type', 'short')
    user_id = data.get('user_id')
    hint = data.get('hint', '')

    print(f"\n⚡ [SOCKET TRIGGER] Instant Generation for '{topic}' ({content_type})")

    # Record in Firestore
    if db_manager and topic:
        try:
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
        except Exception as e:
            print(f"Error logging to content_queue: {e}")

    await execute_pipeline(channel_key, content_type, topic=topic, hint=hint)

@sio.on('trigger:publish')
async def on_publish(sid, data):
    topic = data.get('topic')
    channel_key = data.get('channel_key')
    platform = data.get('platform', 'all')
    user_id = data.get('user_id')

    print(f"\n📤 [SOCKET TRIGGER] Instant Publish for '{topic}' to {platform}")
    await sio.emit('pipeline:progress', {
        'stage': 'uploader',
        'percent': 50,
        'details': f"Publishing '{topic}' to {platform.upper()}..."
    })

    # Direct publish execution
    try:
        import re
        safe_topic = re.sub(r'[^\w\s-]', '', topic).strip().replace(' ', '_')
        final_filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "final", f"{safe_topic}.mp4")

        if os.path.exists(final_filepath):
            from modules.uploader import DistributionNode
            uploader = DistributionNode(channel_id=channel_key)
            ch = db_manager.get_channel_config(channel_key) if db_manager else {}
            api_keys = json.loads(ch.get('api_keys_json', '{}')) if ch else {}

            platforms_to_publish = [platform] if platform and platform != 'all' else ['ig', 'yt', 'tk']
            for pk in platforms_to_publish:
                if api_keys.get(f'pause_{pk}') or api_keys.get(f'disable_{pk}'):
                    continue
                if pk == 'ig':
                    uploader.upload_to_instagram(final_filepath, topic, "")
                    if db_manager: db_manager.mark_platform_uploaded(topic, 'ig')
                elif pk == 'yt':
                    uploader.upload_to_youtube(final_filepath, topic, topic, private=False)
                    if db_manager: db_manager.mark_platform_uploaded(topic, 'yt')
                elif pk == 'tk':
                    res = uploader.upload_to_tiktok(final_filepath, topic)
                    if res and db_manager:
                        db_manager.mark_platform_uploaded(topic, 'tk')
                    elif not res and scheduler:
                        scheduler.schedule_delayed_retry(topic, channel_key, delay_seconds=1800)

            await sio.emit('pipeline:progress', {
                'stage': 'done',
                'percent': 100,
                'details': f"Publishing complete for '{topic}'"
            })
        else:
            await sio.emit('pipeline:log', {
                'level': 'ERROR',
                'message': f"Video file for '{topic}' not found."
            })
    except Exception as e:
        print(f"Publish Error: {e}")
        await sio.emit('pipeline:log', {
            'level': 'ERROR',
            'message': f"Publish failed: {str(e)}"
        })

@sio.on('trigger:retry')
async def on_retry(sid, data):
    topic = data.get('topic')
    channel_key = data.get('channel_key')
    print(f"\n🔄 [SOCKET TRIGGER] Retry for '{topic}'")
    await execute_pipeline(channel_key, "video", retry_topic=topic)

@sio.on('trigger:sync_analytics')
async def on_sync_analytics(sid, data):
    if db_manager:
        print("\n🔄 [SOCKET TRIGGER] Syncing analytics...")
        db_manager.check_and_update_all_analytics()
        await sio.emit('pipeline:log', {
            'level': 'INFO',
            'message': 'Analytics synchronized successfully.'
        })

@sio.on('research:url')
async def on_research_url(sid, data):
    url = data.get('url') if isinstance(data, dict) else str(data)
    print(f"\n🔍 [SOCKET RESEARCH] Analyzing URL: {url}")
    result = await fetch_page_content(url)
    return result

async def http_research_handler(request):
    try:
        body = await request.json()
        url = body.get('url')
        if not url:
            return web.json_response({'success': False, 'error': 'Missing url parameter'}, status=400)
        result = await fetch_page_content(url)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({'success': False, 'error': str(e)}, status=500)

app.router.add_post('/api/research', http_research_handler)

async def start_server(host="0.0.0.0", port=5001):
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    print(f"🚀 [SOCKET SERVER] Socket.IO Server running at http://{host}:{port}")

    # Initial sync with Firestore
    if scheduler:
        scheduler.sync_with_firestore()
        # Start scheduler loop in background
        asyncio.create_task(scheduler.run())
