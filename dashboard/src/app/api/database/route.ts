import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';
import { promisify } from 'util';

const dbPath = path.resolve(process.cwd(), '../nexus_media_vortex.db');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel') || 'neuron_buster';
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error("Database connection error:", err.message);
    }
  });

  return new Promise<NextResponse>((resolve) => {
    db.all('SELECT * FROM content_log WHERE channel_id = ? ORDER BY id DESC', [channel], (err, rows) => {
      if (err) {
        console.error("Query error:", err);
        resolve(NextResponse.json({ success: true, data: [] }));
      } else {
        resolve(NextResponse.json({ success: true, data: rows || [] }));
      }
      db.close();
    });
  });
}
