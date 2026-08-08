import { EdgeTTS } from 'node-edge-tts';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe';

ffmpeg.setFfprobePath(ffprobePath.path);

export class AudioEngine {
  private voice: string;
  private outputDir: string;

  constructor(voice = "en-US-JennyNeural") {
    this.voice = voice;
    this.outputDir = path.resolve(process.cwd(), '../assets/audio_clips');
  }

  async initialize() {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  private async generateAudio(text: string, outputFilename: string, retries = 3): Promise<string> {
    const outputPath = path.join(this.outputDir, outputFilename);
    
    if (existsSync(outputPath)) {
      return outputPath;
    }

    const tts = new EdgeTTS({
      voice: this.voice,
      lang: 'en-US',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
    });

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await tts.ttsPromise(text, outputPath);
        return outputPath;
      } catch (e: any) {
        console.log(`      ⚠️ Audio Error (Attempt ${attempt + 1}/${retries}): ${e.message}`);
        if (attempt < retries - 1) {
          await new Promise(r => setTimeout(r, 2000));
        } else {
          console.log("      ❌ Failed to generate audio after max retries.");
          throw e;
        }
      }
    }
    throw new Error("Failed to generate audio.");
  }

  private async getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err || !metadata || !metadata.format || !metadata.format.duration) {
          console.error(`❌ Error reading audio length: ${err?.message}`);
          return resolve(0.0);
        }
        resolve(metadata.format.duration);
      });
    });
  }

  async processScript(scriptData: any[]) {
    console.log(`🎙️ Starting Audio Generation for ${scriptData.length} scenes...`);
    await this.initialize();

    for (const scene of scriptData) {
      const sceneId = scene.id;
      const text = scene.text;
      const filename = `voice_${sceneId}.mp3`;

      try {
        const filePath = await this.generateAudio(text, filename);
        const duration = await this.getAudioDuration(filePath);
        
        scene.audio_path = filePath;
        scene.duration = duration;
        
        console.log(`   ✅ Scene ${sceneId}: ${duration.toFixed(2)}s generated.`);
        await new Promise(r => setTimeout(r, 1000)); // sleep 1s
      } catch (e) {
        console.log(`   ❌ Skipping Scene ${sceneId} due to audio error.`);
      }
    }

    return scriptData;
  }
}
