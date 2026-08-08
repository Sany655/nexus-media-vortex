import { GoogleGenAI } from '@google/genai';
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '../nexus_media_vortex.db');

export class ContentBrain {
  private channelId: string;
  private config: any;
  private ai: GoogleGenAI;

  constructor(channelId: string, channelConfig: any) {
    this.channelId = channelId;
    this.config = channelConfig;
    
    // Override Gemini API key if present in DB
    let customGeminiKey;
    try {
      const apiKeys = JSON.parse(channelConfig.api_keys_json || '{}');
      customGeminiKey = apiKeys.gemini_api_key;
    } catch (e) {}

    this.ai = new GoogleGenAI({ 
      apiKey: customGeminiKey || process.env.GEMINI_API_KEY 
    });
  }

  private async getPastTopics(): Promise<{ pastTopics: string[], lastTopic: string | null }> {
    return new Promise((resolve) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) return resolve({ pastTopics: [], lastTopic: null });
      });

      db.all('SELECT topic FROM content_log WHERE channel_id = ? ORDER BY id DESC', [this.channelId], (err, rows: any[]) => {
        db.close();
        if (err || !rows) return resolve({ pastTopics: [], lastTopic: null });
        
        const pastTopics = rows.map(r => r.topic);
        const lastTopic = rows.length > 0 ? rows[0].topic : null;
        resolve({ pastTopics, lastTopic });
      });
    });
  }

  async getTrendingTopic(): Promise<string> {
    const { pastTopics, lastTopic } = await this.getPastTopics();
    
    let historyContext = "";
    if (pastTopics.length > 0) {
      historyContext = `DO NOT use these past topics: ${pastTopics.slice(0, 20).join(', ')}. `;
    }

    let serializedLogic = "";
    if (lastTopic && lastTopic.includes("(Part")) {
      const match = lastTopic.match(/\(Part (\d+)\)/);
      if (match) {
        const nextPart = parseInt(match[1]) + 1;
        const baseTopic = lastTopic.split("(Part")[0].trim();
        serializedLogic = `CRITICAL PRIORITY: Your LAST generated video was '${lastTopic}'. You MUST continue the story by outputting exactly: '${baseTopic} (Part ${nextPart})'.`;
      }
    } else {
      serializedLogic = `Start a NEW multi-part series by outputting a topic ending in '(Part 1)'. For example: 'The Secret AI Tool (Part 1)'.`;
    }

    const prompt = `
    You are an elite marketer targeting the '${this.config.niche}' niche for the ${this.config.target_audience} demographic.
    Your goal is to select a highly monetizable, viral topic.
    ${this.config.topic_prompt}
    
    ${historyContext}
    ${serializedLogic}
    
    Output ONLY the raw string of the topic, nothing else. Maximum 8 words. Example: 'The Secret AI Tool for SEO (Part 1)'
    `;
    
    console.log(`🧠 Brain is querying memory and selecting a ${this.config.niche} topic...`);
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      return response.text?.trim() || "Fallback Topic (Part 1)";
    } catch (e: any) {
      console.error(`❌ Error generating topic: ${e.message}`);
      return "Fallback Topic (Part 1)";
    }
  }

  async generateScript(topic: string, contentType = "video"): Promise<any[] | null> {
    console.log(`📝 Writing script for: ${topic} (Type: ${contentType})...`);
    
    const prompt = `
    ${this.config.script_prompt} You are writing about: ${topic}.
    
    CRITICAL LENGTH RULE:
    You MUST write exactly 140 to 160 words. This ensures the generated audio will be between 65 and 85 seconds long to qualify for monetization. Break the script into exactly 10 to 12 scenes.
    
    CRITICAL NARRATIVE STRUCTURE:
    - SCENE 1 (The Hook): 0:00 - 0:03. Start with an aggressive, curiosity-gap statement or counter-intuitive claim. No slow intros.
    - SCENES 2 to 8 (Value Density): 0:03 - 0:45. Deliver high-paced, structured information. Keep sentences punchy.
    - SCENE 9 (The Bridge): 0:45 - 1:00. Introduce a "secret" element, advanced tip, or unexpected twist to ensure they watch past the critical 60-second drop-off point.
    - SCENES 10 to 12 (The CTA): Last 5-10 seconds. Execute a direct, verbal, and visual Call-To-Action. Example: "Click the link in my bio..."

    VISUAL RULES:
    1. For EVERY sentence, provide exactly TWO distinct visual keywords for stock footage.
    2. ${this.config.visual_prompt}
    3. NO text overlays. NO AI-generated avatar descriptions.
    
    Output strict JSON matching this schema exactly:
    [
        {
            "id": 1,
            "text": "Your hook here...",
            "visual_1": "abstract descriptive keyword",
            "visual_2": "abstract descriptive keyword",
            "mood": "suspense"
        }
    ]
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      const cleanText = (response.text || '').replace(/^\`\`\`json\n?/, '').replace(/\`\`\`$/, '').trim();
      return JSON.parse(cleanText);
    } catch (e: any) {
      console.error(`❌ Error generating script: ${e.message}`);
      return null;
    }
  }

  async generateMetadata(scriptData: any[], topic: string): Promise<any> {
    console.log(`🧠 Generating Engagement Metadata for: ${topic}...`);
    const scriptText = scriptData ? scriptData.map(s => s.text).join(" ") : `A viral short documentary about ${topic}.`;
    
    const prompt = `
    ${this.config.metadata_prompt}
    I have created a highly converting YouTube Shorts/TikTok video about: ${topic}
    Here is the script of the video:
    "${scriptText}"

    Generate the following in strict JSON format:
    1. "caption": A long-form, SEO-optimized description. 
       CRITICAL: The VERY FIRST LINE must be exactly this: "${this.config.cta_template}". 
       Then, write a 3-4 sentence SEO description targeting long-tail keywords.
    2. "hashtags": A string of 5 highly targeted, high-CPM hashtags related to the niche. Include: ${this.config.hashtags_template}.
    3. "pinned_comment": A conversion-focused comment to pin at the top (e.g., "What's the #1 bottleneck right now? 👇 P.S. Grab the free guide in my bio!").
    
    Return ONLY valid JSON. No markdown, no quotes outside JSON.
    {
        "caption": "...",
        "hashtags": "...",
        "pinned_comment": "..."
    }
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      const cleanText = (response.text || '').replace(/^\`\`\`json\n?/, '').replace(/\`\`\`$/, '').trim();
      return JSON.parse(cleanText);
    } catch (e: any) {
      console.error(`❌ Error generating metadata: ${e.message}. Using defaults.`);
      return {
        caption: `${this.config.cta_template}\n\n${topic} - Watch until the end...`,
        hashtags: this.config.hashtags_template,
        pinned_comment: "What are your thoughts on this? Let me know below 👇"
      };
    }
  }
}
