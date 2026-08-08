import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '../nexus_media_vortex.db');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel_key = searchParams.get('channel_key');

  if (!channel_key) {
    return NextResponse.json({ success: false, error: "Missing channel_key" }, { status: 400 });
  }

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection error:", err.message);
  });

  return new Promise<NextResponse>((resolve) => {
    db.all("SELECT * FROM schedules WHERE channel_key = ? ORDER BY id DESC LIMIT 1", [channel_key], (err, rows) => {
      db.close();
      if (err) {
        resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
      } else {
        resolve(NextResponse.json({ success: true, data: rows[0] || null }));
      }
    });
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { channel_key, content_type, cron_expression } = body;

  if (!channel_key || !content_type || !cron_expression) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection error:", err.message);
  });

  return new Promise<NextResponse>((resolve) => {
    db.run(`
      INSERT INTO schedules (channel_key, content_type, cron_expression)
      VALUES (?, ?, ?)
    `, [channel_key, content_type, cron_expression], 
    function(err) {
      db.close();
      if (err) {
        resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
      } else {
        resolve(NextResponse.json({ success: true, schedule_id: this.lastID }));
      }
    });
  });
}
