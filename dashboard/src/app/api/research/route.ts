import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ success: false, error: "Missing url parameter" }, { status: 400 });
    }

    // 1. Forward to Python Engine (Playwright Headless Chromium with Multimodal Snapshot)
    try {
      const engineRes = await fetch("http://localhost:5001/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(22000),
      });

      if (engineRes.ok) {
        const data = await engineRes.json();
        if (data.success) {
          return NextResponse.json(data);
        }
      }
    } catch (engineErr) {
      console.warn("Python engine research endpoint unreachable, falling back to Node fetch:", engineErr);
    }

    // 2. Resilient Node.js Fallback
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await res.text();
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);

    return NextResponse.json({
      success: true,
      url,
      title: "Extracted Reference Page",
      content: cleanText,
      screenshot_b64: null,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
