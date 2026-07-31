import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export async function POST(req: Request) {
  const enginePath = path.resolve(process.cwd(), '..');
  const lockPath = path.join(enginePath, 'engine.lock');
  const logPath = path.join(enginePath, 'engine.log');

  try {
    const body = await req.json();
    const { topic, overridePayload, platforms } = body;
    
    const ig = platforms?.ig !== false; // default true
    const yt = platforms?.yt !== false;
    const tk = platforms?.tk !== false;

    // Check lock
    try {
      await fs.access(lockPath);
      return NextResponse.json({ success: false, error: 'Engine is already running (locked).' }, { status: 423 });
    } catch (e) {
      // No lock
    }

    // Create override.json
    const overridePath = path.join(enginePath, 'override.json');
    await fs.writeFile(overridePath, overridePayload, 'utf-8');

    // Lock
    await fs.writeFile(lockPath, Date.now().toString(), 'utf-8');
    await fs.writeFile(logPath, '[SYSTEM] Engine Triggered via Ghost Studio API.\n', 'utf-8');

    // Exec
    const privateMode = platforms?.privateMode === true;
    const args = `--override override.json --ig ${ig} --yt ${yt} --tk ${tk} --private ${privateMode}`;
    exec(`run_genesis.bat ${args}`, { cwd: enginePath }, async (error, stdout, stderr) => {
      // Cleanup lock when finished
      try { await fs.unlink(lockPath); } catch (e) {}
      
      if (error) {
        console.error(`Engine Error: ${error.message}`);
      }
    });

    return NextResponse.json({ success: true, message: 'Custom Payload Injected and Engine Ignited.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
