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

  const all = promisify(db.all.bind(db));
  try {
    // Attempt to select all content logs
    const rows = await all('SELECT * FROM content_log WHERE channel_id = ? ORDER BY id DESC', [channel]);
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    // If table doesn't exist or other error, return empty array
    console.error("Query error:", error);
    return NextResponse.json({ success: true, data: [] });
  } finally {
    db.close();
  }
}
