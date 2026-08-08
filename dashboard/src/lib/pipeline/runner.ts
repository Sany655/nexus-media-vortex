import { ContentBrain } from './brain';
import { AssetManager } from './assetManager';
import { AudioEngine } from './audio';
import { Composer } from './composer';
import sqlite3 from 'sqlite3';
import path from 'path';
import { spawn } from 'child_process';

const dbPath = path.resolve(process.cwd(), '../nexus_media_vortex.db');

export class PipelineRunner {
  private channelId: string;
  private channelConfig: any;
  private logId: number | null = null;
  private isPreview: boolean;

  constructor(channelId: string, channelConfig: any, isPreview = false) {
    this.channelId = channelId;
    this.channelConfig = channelConfig;
    this.isPreview = isPreview;
  }

  private updateStatus(status: string) {
    if (!this.logId) return;
    return new Promise((resolve) => {
      const db = new sqlite3.Database(dbPath);
      db.run('UPDATE content_log SET status = ? WHERE id = ?', [status, this.logId], () => {
        db.close();
        resolve(true);
      });
    });
  }

  async execute() {
    console.log(`\n=============================================================`);
    console.log(`🚀 IGNITING PIPELINE FOR CHANNEL: ${this.channelId}`);
    console.log(`=============================================================`);

    const db = new sqlite3.Database(dbPath);
    
    // Create Log Entry
    this.logId = await new Promise<number>((resolve, reject) => {
      db.run(
        'INSERT INTO content_log (channel_id, status) VALUES (?, ?)',
        [this.channelId, 'Initializing...'],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    db.close();

    try {
      // 1. BRAIN
      await this.updateStatus('Drafting Script');
      const brain = new ContentBrain(this.channelId, this.channelConfig);
      
      const topic = await brain.getTrendingTopic();
      const scriptData = await brain.generateScript(topic, 'video');
      
      if (!scriptData) throw new Error('Failed to generate script');

      // 2. AUDIO
      await this.updateStatus('Generating Audio');
      const audioConfig = JSON.parse(this.channelConfig.audio_config_json || '{}');
      const audioVoice = audioConfig.voice || 'en-US-JennyNeural';
      
      const audioEngine = new AudioEngine(audioVoice);
      const scriptWithAudio = await audioEngine.processScript(scriptData);

      // 3. ASSETS
      await this.updateStatus('Downloading Assets');
      const assetManager = new AssetManager();
      const videoPairs = await assetManager.getVideos(scriptWithAudio);

      // 4. COMPOSER
      await this.updateStatus('Rendering Video');
      const composer = new Composer();
      const renderedScenes = await composer.renderAllScenes(scriptWithAudio, videoPairs);
      
      const finalFileName = `${this.channelId}_${Date.now()}.mp4`;
      const finalVideoPath = await composer.concatenateWithTransitions(renderedScenes, finalFileName);

      // 5. METADATA
      await this.updateStatus('Generating Metadata');
      const metadata = await brain.generateMetadata(scriptWithAudio, topic);

      // 6. FINALIZE DB
      await new Promise((resolve) => {
        const finalDb = new sqlite3.Database(dbPath);
        finalDb.run(`
          UPDATE content_log 
          SET status = 'Completed', topic = ?, final_video_path = ?, generated_metadata = ?
          WHERE id = ?
        `, [
          topic, 
          finalVideoPath, 
          JSON.stringify(metadata), 
          this.logId
        ], () => {
          finalDb.close();
          resolve(true);
        });
      });

      // 7. DISTRIBUTION NODE (Calling Python Uploader)
      await this.updateStatus('Uploading to Platforms');
      let config = {};
      try {
        config = JSON.parse(this.channelConfig.api_keys_json || '{}');
      } catch (e) {}

      // @ts-ignore
      const uploadIg = config.pause_ig ? "false" : "true";
      // @ts-ignore
      const uploadYt = config.pause_yt ? "false" : "true";
      // @ts-ignore
      const uploadTk = config.pause_tk ? "false" : "true";

      const pythonScript = path.resolve(process.cwd(), '../main.py');
      
      console.log(`📡 Spawning Distribution Node: IG=${uploadIg} YT=${uploadYt} TK=${uploadTk}`);
      
      const uploadProcess = spawn('python', [
        pythonScript,
        '--ig', uploadIg,
        '--yt', uploadYt,
        '--tk', uploadTk,
        '--channel', this.channelId,
        '--type', 'video',
        '--override', 'dummy_override.json' // Not actually using override, just forcing main.py to upload existing queue
      ], { 
        cwd: path.resolve(process.cwd(), '..'),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      uploadProcess.stdout.on('data', (data) => console.log(data.toString()));
      uploadProcess.stderr.on('data', (data) => console.error(data.toString()));

      await new Promise((resolve) => uploadProcess.on('close', resolve));

      console.log(`🎉 Pipeline Completed Successfully for ${this.channelId}`);
      return { success: true, video: finalVideoPath };

    } catch (error: any) {
      console.error(`❌ Pipeline Error: ${error.message}`);
      await this.updateStatus(`Failed: ${error.message}`);
      throw error;
    }
  }
}
