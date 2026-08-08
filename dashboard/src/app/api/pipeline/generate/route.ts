import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';
import { PipelineRunner } from '@/lib/pipeline/runner';

const dbPath = path.resolve(process.cwd(), '../nexus_media_vortex.db');

export async function POST(req: Request) {
  try {
    const { channel_key } = await req.json();
    if (!channel_key) return NextResponse.json({ success: false, error: "Missing channel_key" }, { status: 400 });

    // 1. Fetch Config
    const config = await new Promise<any>((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      db.get('SELECT * FROM channels WHERE channel_key = ?', [channel_key], (err, row) => {
        db.close();
        if (err || !row) reject(err || new Error("Channel not found"));
        else resolve(row);
      });
    });

    // 2. Start Pipeline Asynchronously
    // We do NOT await this. We let it run in the background.
    // In a production serverless environment (like Vercel), this would be killed.
    // However, on a VPS or local Node.js server, it runs perfectly.
    const runner = new PipelineRunner(channel_key, config);
    runner.execute().catch(e => console.error("Pipeline crashed in background:", e));

    return NextResponse.json({ success: true, message: "Pipeline ignited." });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
