import asyncio
import datetime
import os
import sys
import json
import subprocess
from croniter import croniter

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

class DeterministicScheduler:
    """
    Event-driven scheduler that computes exact sleep intervals to the next scheduled event
    rather than waking up every 60 seconds to busy-poll the database.
    """
    def __init__(self, db_manager=None, on_trigger_callback=None):
        self.db = db_manager
        self.on_trigger = on_trigger_callback
        self.active_schedules = {} # { sched_id: { channel_key, content_type, cron_expression, next_run } }
        self._wake_event = asyncio.Event()
        self._running = False

    def sync_with_firestore(self):
        """Pulls active schedules from Firestore once during startup."""
        if not self.db:
            return
        try:
            schedules = self.db.get_active_schedules()
            now = datetime.datetime.now()
            self.active_schedules.clear()

            for s in schedules:
                sched_id = s.get('id')
                channel_key = s.get('channel_key')
                cron_expr = s.get('cron_expression')
                content_type = s.get('content_type', 'video')

                if not cron_expr or not channel_key:
                    continue

                try:
                    cron = croniter(cron_expr, now)
                    next_run = cron.get_next(datetime.datetime)
                    self.active_schedules[sched_id] = {
                        'id': sched_id,
                        'channel_key': channel_key,
                        'content_type': content_type,
                        'cron_expression': cron_expr,
                        'next_run': next_run
                    }
                    self.db.update_schedule_run(sched_id, next_run.isoformat(), None)
                    print(f"⏰ [SCHEDULER SYNC] {channel_key} ({content_type}) scheduled for {next_run.strftime('%Y-%m-%d %H:%M:%S')}")
                except Exception as e:
                    print(f"⚠️ [SCHEDULER ERROR] Invalid cron '{cron_expr}' for {channel_key}: {e}")

            # Wake up scheduler loop if it was sleeping
            self._wake_event.set()
        except Exception as e:
            print(f"❌ [SCHEDULER SYNC FAILED] {e}")

    def update_schedule(self, channel_key, content_type, cron_expression):
        """Immediately updates or registers a schedule and resets the timer."""
        now = datetime.datetime.now()
        try:
            cron = croniter(cron_expression, now)
            next_run = cron.get_next(datetime.datetime)
            sched_key = f"{channel_key}_{content_type}"

            self.active_schedules[sched_key] = {
                'id': sched_key,
                'channel_key': channel_key,
                'content_type': content_type,
                'cron_expression': cron_expression,
                'next_run': next_run
            }

            print(f"⚡ [INSTANT RESCHEDULE] {channel_key} ({content_type}) updated to {next_run.strftime('%Y-%m-%d %H:%M:%S')}")
            # Interrupt the current sleep so the scheduler recalculates the earliest job
            self._wake_event.set()
            return True, next_run.isoformat()
        except Exception as e:
            print(f"❌ [RESCHEDULE ERROR] {e}")
            return False, str(e)

    def schedule_delayed_retry(self, topic, channel_key, delay_seconds=1800):
        """Event-driven single-shot retry without a 60-second database polling loop."""
        async def _delayed_task():
            print(f"⏳ [DELAYED RETRY SCHEDULED] Will retry '{topic}' in {delay_seconds//60} minutes...")
            await asyncio.sleep(delay_seconds)
            print(f"🚀 [DELAYED RETRY FIRING] Executing retry for '{topic}' on {channel_key}")
            if self.on_trigger:
                await self.on_trigger(channel_key, "video", retry_topic=topic)

        asyncio.create_task(_delayed_task())

    async def run(self):
        """Main event-driven loop that sleeps until the exact earliest job time."""
        self._running = True
        print("🎯 [SCHEDULER] Deterministic Event-Driven Scheduler Active.")

        while self._running:
            self._wake_event.clear()
            now = datetime.datetime.now()

            # Find the earliest scheduled job
            earliest_time = None
            earliest_jobs = []

            for s_id, s_data in list(self.active_schedules.items()):
                next_run = s_data['next_run']
                if next_run <= now:
                    earliest_jobs.append(s_data)
                elif earliest_time is None or next_run < earliest_time:
                    earliest_time = next_run

            # 1. Fire any due jobs immediately
            for job in earliest_jobs:
                channel_key = job['channel_key']
                content_type = job['content_type']
                cron_expr = job['cron_expression']
                s_id = job['id']

                print(f"\n⏰ [{now.strftime('%H:%M:%S')}] Target Reached! Triggering Pipeline for {channel_key} ({content_type})")
                if self.on_trigger:
                    try:
                        await self.on_trigger(channel_key, content_type)
                    except Exception as e:
                        print(f"Error triggering pipeline: {e}")

                # Recalculate next run
                try:
                    cron = croniter(cron_expr, datetime.datetime.now())
                    new_next_run = cron.get_next(datetime.datetime)
                    self.active_schedules[s_id]['next_run'] = new_next_run
                    if self.db and s_id in [s.get('id') for s in self.db.get_active_schedules()]:
                        self.db.update_schedule_run(s_id, new_next_run.isoformat(), now.isoformat())
                    print(f"📅 Next run for {channel_key}: {new_next_run.strftime('%Y-%m-%d %H:%M:%S')}")
                except Exception as e:
                    print(f"Error calculating next run for {channel_key}: {e}")

            # 2. Compute exact sleep duration to the next scheduled job
            now = datetime.datetime.now()
            sleep_seconds = None

            for s_id, s_data in self.active_schedules.items():
                diff = (s_data['next_run'] - now).total_seconds()
                if diff > 0:
                    if sleep_seconds is None or diff < sleep_seconds:
                        sleep_seconds = diff

            if sleep_seconds is None:
                # No active schedules; wait for an event (e.g. user adding schedule)
                print("💤 [SCHEDULER] No pending schedules. Sleeping until event trigger...")
                await self._wake_event.wait()
            else:
                sleep_seconds = max(1.0, sleep_seconds)
                hrs = int(sleep_seconds // 3600)
                mins = int((sleep_seconds % 3600) // 60)
                secs = int(sleep_seconds % 60)
                print(f"💤 [SCHEDULER] Sleeping for {hrs}h {mins}m {secs}s until next scheduled event...")

                try:
                    # Sleep until the exact second OR until a new schedule update interrupts
                    await asyncio.wait_for(self._wake_event.wait(), timeout=sleep_seconds)
                except asyncio.TimeoutError:
                    # Timeout reached = target time reached, loop to execute
                    pass
