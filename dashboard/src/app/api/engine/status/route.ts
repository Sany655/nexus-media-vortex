import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  const enginePath = path.resolve(process.cwd(), '..');
  const lockPath = path.join(enginePath, 'engine.lock');
  const logPath = path.join(enginePath, 'engine.log');
  
  let isRunning = false;
  let logs = "";
  let startTime = null;

  try {
    const lockContents = await fs.readFile(lockPath, 'utf-8');
    isRunning = true;
    const time = parseInt(lockContents.trim());
    if (!isNaN(time)) {
      startTime = time;
    }
  } catch (e) {
    isRunning = false;
  }

  try {
    const logData = await fs.readFile(logPath, 'utf-8');
    // Tail the last 50 lines
    const lines = logData.split('\n');
    logs = lines.slice(-50).join('\n');
  } catch (e) {
    logs = "System Idle. No active logs.";
  }

  return NextResponse.json({ success: true, isRunning, logs, startTime });
}
