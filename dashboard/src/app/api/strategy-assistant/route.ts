import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini Client
// We assume the user has set GEMINI_API_KEY in their .env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `
You are an elite, AI-driven YouTube and TikTok channel manager and strategist.
Your goal is to help the user design a highly monetizable, viral "faceless" channel.
The user will tell you their niche or idea. Ask clarifying questions if needed (e.g., target audience, tone).
Once you have enough context to populate the channel profile, you MUST output ONLY a valid JSON block containing the configuration.
Do not output any markdown formatting like \`\`\`json, just the raw JSON object.

The JSON schema must exactly match this:
{
  "name": "A catchy channel name (string)",
  "niche": "The channel niche (string)",
  "target_audience": "The target demographic (string)",
  "objective_node": "A short, dynamic category name summarizing their objective (e.g., 'Viral Monetization', 'SaaS Marketing', 'Dropshipping Sales', 'Personal Branding', etc. Be creative and precise).",
  "topic_prompt": "Instructions for selecting a viral topic in this niche (string)",
  "script_prompt": "Instructions for writing a 140-160 word script with hook and CTA (string)",
  "visual_prompt": "Instructions for generating two distinct visual stock footage keywords per sentence (string)",
  "metadata_prompt": "Instructions for writing SEO optimized captions and hashtags (string)",
  "cta_template": "A Call to Action template (string)",
  "hashtags_template": "A list of 5-7 default hashtags (string)"
}

If you do NOT have enough information yet, reply normally as a helpful assistant asking for more details.
`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, modelType } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ success: false, error: 'Messages are required' }, { status: 400 });
    }

    if (modelType !== 'gemini-2.5-flash' && modelType !== 'gemini-2.5-pro') {
      return NextResponse.json({ 
        success: false, 
        error: `Model provider for '${modelType}' is not yet configured in the backend.` 
      }, { status: 400 });
    }

    // Format messages for @google/genai
    const formattedMessages = messages.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Generate content
    const response = await ai.models.generateContent({
      model: modelType,
      contents: formattedMessages,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.7,
      }
    });

    const reply = response.text || '';
    
    // Check if the reply is a JSON block (meaning strategy is ready)
    let isConfigReady = false;
    let configData = null;
    
    try {
      // Clean up potential markdown formatting just in case
      const cleaned = reply.replace(/^\`\`\`json\n?/, '').replace(/\`\`\`$/, '').trim();
      configData = JSON.parse(cleaned);
      if (configData.name && configData.niche && configData.topic_prompt) {
        isConfigReady = true;
      }
    } catch (e) {
      // Not JSON, so it's a regular chat message
    }

    return NextResponse.json({ 
      success: true, 
      message: reply,
      isConfigReady,
      configData
    });

  } catch (error: any) {
    console.error("Strategy Assistant Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
