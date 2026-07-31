import { NextResponse } from 'next/server';
import path from 'path';
import { readFile } from 'fs/promises';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const topic = searchParams.get('topic');
  if (!topic) return new NextResponse("Topic required", { status: 400 });

  // Sanitize topic to match exactly how main.py saves the file
  const safeTopic = topic.replace(/[^\w\s-]/g, '').trim().replace(/ /g, '_');
  const filePath = path.resolve(process.cwd(), '../assets/final', `${safeTopic}.mp4`);

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error("Video streaming error:", error);
    return new NextResponse("Video file not found. It may have been deleted.", { status: 404 });
  }
}
