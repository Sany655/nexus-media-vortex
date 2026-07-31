import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

export async function POST() {
  const enginePath = path.resolve(process.cwd(), '..');
  
  console.log("Triggering Analytics Sync...");
  
  exec(`.\\venv\\Scripts\\python.exe modules/analytics.py`, { cwd: enginePath }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Analytics Sync Error: ${error.message}`);
    } else {
      console.log(`Analytics Sync Success:\\n${stdout}`);
    }
  });

  return NextResponse.json({ success: true, message: 'Analytics sync started.' });
}
