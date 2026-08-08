import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel_key = searchParams.get('channel_key');

  if (!channel_key) {
    return NextResponse.json({ success: false, error: "Missing channel_key" }, { status: 400 });
  }

  const statePath = path.resolve(process.cwd(), `../channels/${channel_key}/strategy_state.json`);

  if (!fs.existsSync(statePath)) {
    return NextResponse.json({ success: true, data: null });
  }

  try {
    const data = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(data);
    return NextResponse.json({ success: true, data: state });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
