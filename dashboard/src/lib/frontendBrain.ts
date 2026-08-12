/**
 * Frontend Brain — Browser-Side Content Generator
 * Mirrors engine/modules/brain.py but runs entirely in the browser via Gemini API.
 * Used for text/image content generation that doesn't require server-side FFmpeg.
 */

import { GoogleGenAI } from '@google/genai';
import { db } from './firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, doc } from 'firebase/firestore';

export interface SceneData {
  id: number;
  text: string;
  visual_1: string;
  visual_2: string;
  mood: string;
}

export interface GeneratedContent {
  topic: string;
  contentType: string;
  content: string | SceneData[];
  caption: string;
  hashtags: string;
  pinnedComment?: string;
}

export class FrontendBrain {
  private ai: GoogleGenAI;
  private channelConfig: any;
  private channelKey: string;
  private userId: string;

  constructor(geminiApiKey: string, channelConfig: any, userId: string) {
    this.ai = new GoogleGenAI({ apiKey: geminiApiKey });
    this.channelConfig = channelConfig;
    this.channelKey = channelConfig.channel_key;
    this.userId = userId;
  }

  /**
   * Fetches past topics from Firestore to avoid repeats (Serialized Continuity).
   */
  private async getPastTopics(): Promise<{ pastTopics: string[]; lastTopic: string | null }> {
    try {
      const q = query(
        collection(db, 'content_queue'),
        where('channel_key', '==', this.channelKey),
        where('user_id', '==', this.userId)
      );
      const snapshot = await getDocs(q);
      const topics: string[] = [];
      snapshot.docs.forEach(d => {
        const t = d.data().topic;
        if (t) topics.push(t);
      });
      // Sort by created_at descending to find the most recent
      const sorted = snapshot.docs
        .filter(d => d.data().topic)
        .sort((a, b) => {
          const toMs = (v: any) => {
            if (!v) return 0;
            if (typeof v.toDate === 'function') return v.toDate().getTime();
            return new Date(v).getTime();
          };
          return toMs(b.data().created_at) - toMs(a.data().created_at);
        });
      const lastTopic = sorted.length > 0 ? sorted[0].data().topic : null;
      return { pastTopics: topics, lastTopic };
    } catch (e) {
      return { pastTopics: [], lastTopic: null };
    }
  }

  /**
   * Generates a viral topic based on the channel niche with serialized continuity.
   * Optionally accepts an extra hint/prompt from the user for emergency/manual generation.
   */
  async getTopic(extraHint?: string): Promise<string> {
    const { pastTopics, lastTopic } = await this.getPastTopics();
    const cfg = this.channelConfig;

    let historyContext = '';
    if (pastTopics.length > 0) {
      historyContext = `DO NOT use these past topics: ${pastTopics.slice(0, 20).join(', ')}. `;
    }

    let serializedLogic = '';
    const partMatch = lastTopic?.match(/\(Part (\d+)\)/);
    if (lastTopic && partMatch) {
      const nextPart = parseInt(partMatch[1]) + 1;
      const baseTopic = lastTopic.split('(Part')[0].trim();
      serializedLogic = `CRITICAL PRIORITY: Continue the existing series. Output exactly: '${baseTopic} (Part ${nextPart})'.`;
    } else {
      serializedLogic = `Start a NEW multi-part series ending in '(Part 1)'. Example: 'The Secret AI Tool (Part 1)'.`;
    }

    const extraContext = extraHint
      ? `\n\nUSER ADDITIONAL CONTEXT (treat as extra creative direction, not an override): "${extraHint}"`
      : '';

    const prompt = `
You are an elite marketer targeting the '${cfg.niche}' niche for the ${cfg.target_audience} demographic.
Your goal is to select a highly monetizable, viral topic.
${cfg.topic_prompt}

${historyContext}
${serializedLogic}
${extraContext}

Output ONLY the raw string of the topic, nothing else. Maximum 8 words.
    `.trim();

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text?.trim() || 'Trending Topic (Part 1)';
    } catch (e: any) {
      throw new Error(`Topic generation failed: ${e.message}`);
    }
  }

  /**
   * Generates content based on type. Returns structured content.
   */
  async generateContent(topic: string, contentType: string): Promise<string | SceneData[]> {
    const cfg = this.channelConfig;

    if (contentType === 'post') {
      const prompt = `
${cfg.script_prompt} You are writing a highly engaging text-only post for social media (X/LinkedIn) about: ${topic}.
Write a 3-4 paragraph engaging post with a strong hook on the first line.
Write it as plain text. No JSON. No markdown headers. Just the post content.
      `.trim();
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text?.trim() || '';
    }

    if (contentType === 'image') {
      const prompt = `
${cfg.script_prompt} You are designing an engaging image post about: ${topic}.
Output strict JSON only:
{"caption": "1-2 sentence caption", "image_prompt": "highly detailed visual description for image generation"}
      `.trim();
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const clean = (response.text || '').replace(/^```json\n?/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(clean);
      return parsed.caption || '';
    }

    // For short/video — generate script scenes (video compositing still needs server)
    const prompt = `
${cfg.script_prompt} You are writing about: ${topic}.

CRITICAL LENGTH RULE: Write exactly 140 to 160 words. Break into exactly 10 to 12 scenes.

CRITICAL NARRATIVE STRUCTURE:
- SCENE 1 (The Hook): Aggressive curiosity-gap statement.
- SCENES 2-8 (Value Density): High-paced, structured information.
- SCENE 9 (The Bridge): Unexpected twist to retain viewers past 60 seconds.
- SCENES 10-12 (The CTA): Direct call-to-action.

For EVERY sentence provide TWO distinct visual keywords for stock footage.
${cfg.visual_prompt}
NO text overlays. NO AI-generated avatar descriptions.

Output strict JSON:
[{"id": 1, "text": "...", "visual_1": "...", "visual_2": "...", "mood": "suspense"}]
    `.trim();

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const clean = (response.text || '').replace(/^```json\n?/, '').replace(/```$/, '').trim();
    return JSON.parse(clean) as SceneData[];
  }

  /**
   * Generates SEO-optimized caption, hashtags, and pinned comment.
   */
  async generateMetadata(topic: string, contentText: string): Promise<{ caption: string; hashtags: string; pinnedComment: string }> {
    const cfg = this.channelConfig;

    const prompt = `
${cfg.metadata_prompt}
I have created content about: ${topic}
Content: "${contentText.slice(0, 500)}"

Generate in strict JSON format:
1. "caption": SEO-optimized description. FIRST LINE must be exactly: "${cfg.cta_template}". Then 3-4 SEO sentences.
2. "hashtags": 5 high-CPM hashtags. Include: ${cfg.hashtags_template}.
3. "pinnedComment": A conversion-focused comment to pin.

Return ONLY valid JSON:
{"caption": "...", "hashtags": "...", "pinnedComment": "..."}
    `.trim();

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const clean = (response.text || '').replace(/^```json\n?/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(clean);
      return {
        caption: parsed.caption || '',
        hashtags: parsed.hashtags || cfg.hashtags_template || '',
        pinnedComment: parsed.pinnedComment || '',
      };
    } catch (e) {
      return {
        caption: `${cfg.cta_template}\n\n${topic}`,
        hashtags: cfg.hashtags_template || '',
        pinnedComment: 'What are your thoughts? 👇',
      };
    }
  }

  /**
   * Full generation pipeline — runs entirely in the browser for text/image content.
   * Saves result to Firestore content_queue with status "Ready for Review".
   */
  async runFullGeneration(
    contentType: string,
    extraHint?: string,
    missedScheduleId?: string
  ): Promise<GeneratedContent> {
    // 1. Get topic
    const topic = await this.getTopic(extraHint);

    // 2. Generate content
    const content = await this.generateContent(topic, contentType);

    // 3. Extract plain text for metadata generation
    let contentText = '';
    if (typeof content === 'string') {
      contentText = content;
    } else if (Array.isArray(content)) {
      contentText = (content as SceneData[]).map(s => s.text).join(' ');
    }

    // 4. Generate metadata
    const meta = await this.generateMetadata(topic, contentText);

    const result: GeneratedContent = {
      topic,
      contentType,
      content,
      caption: meta.caption,
      hashtags: meta.hashtags,
      pinnedComment: meta.pinnedComment,
    };

    // 5. Save to Firestore
    const queueData: any = {
      channel_key: this.channelKey,
      user_id: this.userId,
      topic,
      content_type: contentType,
      status: 'Ready for Review',
      generated_content: typeof content === 'string' ? content : JSON.stringify(content),
      generated_caption: meta.caption,
      generated_hashtags: meta.hashtags,
      pinned_comment: meta.pinnedComment,
      uploaded_ig: false,
      uploaded_yt: false,
      uploaded_tk: false,
      uploaded_fb: false,
      uploaded_x: false,
      pipeline_mode: 'manual_review',
      generated_by: 'frontend',
      created_at: new Date().toISOString(),
    };

    // If triggered from a missed schedule, attach the schedule reference
    if (missedScheduleId) {
      queueData.missed_schedule_id = missedScheduleId;
    }

    await addDoc(collection(db, 'content_queue'), queueData);

    return result;
  }
}
