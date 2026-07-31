import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export async function POST() {
  const enginePath = path.resolve(process.cwd(), '..');
  const lockPath = path.join(enginePath, 'engine.lock');
  const logPath = path.join(enginePath, 'engine.log');

  try {
    // Safely terminate only the python process running main.py
    exec('wmic process where "name=\'python.exe\' and commandline like \'%main.py%\'" call terminate', (err) => {
      // Ignore if not found
    });
    
    // Clear lockfile
    try { await fs.unlink(lockPath); } catch (e) {}

    // Update log
    try {
      await fs.appendFile(logPath, '\n\n🚨 [SYSTEM] Engine forcefully terminated by user.\n', 'utf-8');
    } catch(e) {}

    return NextResponse.json({ success: true, message: 'Engine terminated.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
