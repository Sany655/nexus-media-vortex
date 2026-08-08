import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '../nexus_media_vortex.db');

export async function POST(request: Request) {
  try {
    const { firebase_uid, email } = await request.json();

    if (!firebase_uid || !email) {
      return NextResponse.json({ success: false, error: "Missing parameters" }, { status: 400 });
    }

    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) console.error("Database connection error:", err.message);
    });

    return new Promise<NextResponse>((resolve) => {
      db.get("SELECT id FROM users WHERE firebase_uid = ?", [firebase_uid], (err, row) => {
        if (err) {
          db.close();
          resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
        } else if (row) {
          db.close();
          resolve(NextResponse.json({ success: true, message: "User exists" }));
        } else {
          db.run("INSERT INTO users (firebase_uid, email) VALUES (?, ?)", [firebase_uid, email], function(err) {
            db.close();
            if (err) {
              resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
            } else {
              resolve(NextResponse.json({ success: true, message: "User created" }));
            }
          });
        }
      });
    });

  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
