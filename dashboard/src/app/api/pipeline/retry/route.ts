import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import sqlite3 from 'sqlite3';

const dbPath = path.resolve(process.cwd(), '../nexus_media_vortex.db');

export async function POST(req: Request) {
  try {
    const { topic, channel_id, action } = await req.json();
    if (!topic || !channel_id) return NextResponse.json({ success: false, error: 'Topic and channel required' });

    console.log(`\n=============================================================`);
    console.log(`🚑 PIPELINE RESCUE INITIATED FOR: ${topic}`);
    console.log(`=============================================================`);

    // We write an override.json for main.py
    const overridePath = path.resolve(process.cwd(), '../override.json');
    await fs.writeFile(overridePath, JSON.stringify({ retryTopic: topic }));

    // Get channel config to check if IG/YT/TK are paused
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    const configStr = await new Promise<string>((resolve) => {
      db.get("SELECT api_keys_json FROM channels WHERE channel_key = ?", [channel_id], (err, row: any) => {
        resolve(row ? row.api_keys_json : '{}');
      });
    });
    db.close();

    let config: any = {};
    try { config = JSON.parse(configStr || '{}'); } catch(e) {}

    const uploadIg = config.pause_ig ? "false" : "true";
    const uploadYt = config.pause_yt ? "false" : "true";
    const uploadTk = config.pause_tk ? "false" : "true";

    const pythonScript = path.resolve(process.cwd(), '../main.py');
    
    // Spawn Python in background, don't await (fire and forget)
    const rescueProcess = spawn('python', [
      pythonScript,
      '--ig', uploadIg,
      '--yt', uploadYt,
      '--tk', uploadTk,
      '--channel', channel_id,
      '--type', 'video',
      '--override', 'override.json'
    ], { 
      cwd: path.resolve(process.cwd(), '..'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    rescueProcess.stdout.on('data', (data) => console.log(data.toString()));
    rescueProcess.stderr.on('data', (data) => console.error(data.toString()));

    // Delete override.json when done
    rescueProcess.on('close', async () => {
      try { await fs.unlink(overridePath); } catch (e) {}
    });

    return NextResponse.json({ success: true, message: 'Rescue queued in Python orchestrator.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
