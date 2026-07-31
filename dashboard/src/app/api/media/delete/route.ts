import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';

const dbPath = path.resolve(process.cwd(), '../nexus_media_vortex.db');
const finalDir = path.resolve(process.cwd(), '../assets/final');

export async function POST(req: Request) {
  try {
    const { topic } = await req.json();
    if (!topic) return NextResponse.json({ success: false, error: 'Topic required' });

    // 1. Delete from SQLite
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE);
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM content_log WHERE topic = ?', [topic], function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
    db.close();

    // 2. Delete Physical File
    const safeTopic = topic.replace(/[^\w\s-]/g, '').trim().replace(/ /g, '_');
    const filePath = path.join(finalDir, `${safeTopic}.mp4`);
    
    try {
      await fs.unlink(filePath);
      console.log(`Deleted file: ${filePath}`);
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        console.error("File deletion error:", e);
      }
    }

    return NextResponse.json({ success: true, message: 'Wiped entirely.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
