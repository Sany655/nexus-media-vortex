import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export async function POST(req: Request) {
  const enginePath = path.resolve(process.cwd(), '..');
  const lockPath = path.join(enginePath, 'engine.lock');
  const logPath = path.join(enginePath, 'engine.log');
  try {
    const body = await req.json().catch(() => ({}));
    const ig = body.ig !== false; // default true
    const yt = body.yt !== false;
    const tk = body.tk !== false;
    const privateMode = body.privateMode === true;
    const retryTopic = body.retryTopic || null;
    const channel_id = body.channel || "neuron_buster";
    const content_type = body.contentType || "video";

    // Check if already running
    try {
      await fs.access(lockPath);
      return NextResponse.json({ success: false, error: 'Engine is already running!' }, { status: 400 });
    } catch (e) {
      // not running
    }

    // Create override.json
    const overridePayload = JSON.stringify({ ig, yt, tk, privateMode, retryTopic, channel_id, content_type });
    const overridePath = path.join(enginePath, 'override.json');
    await fs.writeFile(overridePath, overridePayload, 'utf-8');
    await fs.writeFile(lockPath, 'running', 'utf-8');
    await fs.writeFile(logPath, 'Genesis Engine Ignited via API...\n', 'utf-8');

    console.log(`Triggering Genesis Engine for ${channel_id} (Type: ${content_type})...`);
    
    const args = `--ig ${ig} --yt ${yt} --tk ${tk} --private ${privateMode} --channel ${channel_id} --type ${content_type}`;
    exec(`run_genesis.bat ${args}`, { cwd: enginePath }, async (error, stdout, stderr) => {
    // Cleanup lock when finished
    try { await fs.unlink(lockPath); } catch (e) {}
    
    if (error) {
      console.error(`Engine Error: ${error.message}`);
      return;
    }
  });

  return NextResponse.json({ success: true, message: 'Engine ignited.' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
