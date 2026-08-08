import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '../nexus_media_vortex.db');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('uid');

  if (!uid) {
    return NextResponse.json({ success: false, error: "Missing uid" }, { status: 400 });
  }

  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) console.error("Database connection error:", err.message);
  });

  return new Promise<NextResponse>((resolve) => {
    db.get("SELECT id FROM users WHERE firebase_uid = ?", [uid], (err, user: any) => {
      if (err || !user) {
        db.close();
        return resolve(NextResponse.json({ success: false, error: "User not found" }, { status: 404 }));
      }
      
      db.all("SELECT * FROM channels WHERE user_id = ?", [user.id], (err, rows) => {
        db.close();
        if (err) {
          resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
        } else {
          resolve(NextResponse.json({ success: true, data: rows || [] }));
        }
      });
    });
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { uid, name, niche, target_audience, topic_prompt, script_prompt, visual_prompt, metadata_prompt, cta_template, hashtags_template, api_keys_json } = body;

  if (!uid || !name) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

  const channel_key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection error:", err.message);
  });

  return new Promise<NextResponse>((resolve) => {
    db.get("SELECT id FROM users WHERE firebase_uid = ?", [uid], (err, user: any) => {
      if (err || !user) {
        db.close();
        return resolve(NextResponse.json({ success: false, error: "User not found" }, { status: 404 }));
      }
      
      db.run(`
        INSERT INTO channels 
        (user_id, channel_key, name, niche, target_audience, topic_prompt, script_prompt, visual_prompt, metadata_prompt, cta_template, hashtags_template, api_keys_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [user.id, channel_key, name, niche || "", target_audience || "", topic_prompt || "", script_prompt || "", visual_prompt || "", metadata_prompt || "", cta_template || "", hashtags_template || "", api_keys_json || "{}"], 
      function(err) {
        db.close();
        if (err) {
          resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
        } else {
          resolve(NextResponse.json({ success: true, channel_key }));
        }
      });
    });
  });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { channel_key, api_keys_json } = body;

  if (!channel_key || !api_keys_json) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection error:", err.message);
  });

  return new Promise<NextResponse>((resolve) => {
    db.run(
      `UPDATE channels SET api_keys_json = ? WHERE channel_key = ?`,
      [api_keys_json, channel_key],
      function(err) {
        db.close();
        if (err) {
          resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
        } else {
          resolve(NextResponse.json({ success: true }));
        }
      }
    );
  });
}
