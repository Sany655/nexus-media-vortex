import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';

export class Composer {
  private tempDir: string;
  private finalDir: string;
  private avatarPath: string;
  private transitions = ['fade', 'diagbr', 'diagtl'];

  constructor() {
    this.tempDir = path.resolve(process.cwd(), '../assets/temp');
    this.finalDir = path.resolve(process.cwd(), '../assets/final');
    this.avatarPath = path.resolve(process.cwd(), '../assets/avatar/avatars.mp4');
  }

  async initialize() {
    await fs.mkdir(this.tempDir, { recursive: true });
    await fs.mkdir(this.finalDir, { recursive: true });
  }

  private async getDuration(filepath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filepath, (err, metadata) => {
        if (err || !metadata?.format?.duration) return resolve(0.0);
        resolve(metadata.format.duration);
      });
    });
  }

  private async processScene(scene: any, videoPair: any[], isAvatar = false): Promise<string | null> {
    const sceneId = scene.id;
    const audioPath = scene.audio_path;
    const totalDuration = scene.duration;
    const outputPath = path.join(this.tempDir, `scene_${sceneId}.mp4`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      
      command.input(audioPath);

      if (isAvatar) {
        console.log(`   ⚙️ Processing Scene ${sceneId}: 🤖 Avatar Mode (Cropped)`);
        command.input(videoPair[0]).inputOptions(['-stream_loop', '-1']);
        
        command.complexFilter([
          {
            filter: 'trim',
            options: { duration: totalDuration + 0.5 },
            inputs: '1:v',
            outputs: 'trimmed'
          },
          {
            filter: 'setpts',
            options: 'PTS-STARTPTS',
            inputs: 'trimmed',
            outputs: 'pts'
          },
          {
            filter: 'crop',
            options: 'iw:ih-150:0:0',
            inputs: 'pts',
            outputs: 'cropped1'
          },
          {
            filter: 'scale',
            options: '1080:1920',
            inputs: 'cropped1',
            outputs: 'scaled'
          },
          {
            filter: 'crop',
            options: '1080:1920',
            inputs: 'scaled',
            outputs: 'cropped2'
          },
          {
            filter: 'fps',
            options: 'fps=30:round=up',
            inputs: 'cropped2',
            outputs: 'v_out'
          }
        ], 'v_out');

      } else {
        console.log(`   ⚙️ Processing Scene ${sceneId}: 🎞️ A/B Split Mode`);
        const pathA = videoPair[0];
        const pathB = videoPair[1];
        
        const durationA = totalDuration / 2;
        const durationB = (totalDuration / 2) + 0.5;

        command.input(pathA).inputOptions(['-stream_loop', '-1']);
        command.input(pathB).inputOptions(['-stream_loop', '-1']);

        command.complexFilter([
          { filter: 'trim', options: { duration: durationA }, inputs: '1:v', outputs: 'trim_a' },
          { filter: 'setpts', options: 'PTS-STARTPTS', inputs: 'trim_a', outputs: 'pts_a' },
          { filter: 'scale', options: '1080:1920', inputs: 'pts_a', outputs: 'scale_a' },
          { filter: 'crop', options: '1080:1920', inputs: 'scale_a', outputs: 'crop_a' },
          { filter: 'fps', options: 'fps=30:round=up', inputs: 'crop_a', outputs: 'v_a' },

          { filter: 'trim', options: { duration: durationB }, inputs: '2:v', outputs: 'trim_b' },
          { filter: 'setpts', options: 'PTS-STARTPTS', inputs: 'trim_b', outputs: 'pts_b' },
          { filter: 'scale', options: '1080:1920', inputs: 'pts_b', outputs: 'scale_b' },
          { filter: 'crop', options: '1080:1920', inputs: 'scale_b', outputs: 'crop_b' },
          { filter: 'fps', options: 'fps=30:round=up', inputs: 'crop_b', outputs: 'v_b' },

          { filter: 'concat', options: { n: 2, v: 1, a: 0 }, inputs: ['v_a', 'v_b'], outputs: 'v_out' }
        ], 'v_out');
      }

      command.outputOptions([
        '-map 0:a', // The first input is audio
        '-vcodec libx264',
        '-acodec aac',
        '-pix_fmt yuv420p',
        '-shortest'
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        console.error(`❌ Render Fail Scene ${sceneId}: ${err.message}`);
        resolve(null);
      })
      .run();
    });
  }

  async renderAllScenes(scriptData: any[], videoPairs: any[][]): Promise<string[]> {
    await this.initialize();
    const renderedPaths: string[] = [];
    
    let avatarIndices: number[] = [];
    if (scriptData.length >= 4 && existsSync(this.avatarPath)) {
      const validRange = Array.from({length: scriptData.length - 2}, (_, i) => i + 1);
      const countToPick = validRange.length >= 2 ? 2 : 1;
      
      // Shuffle and pick
      for(let i = validRange.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [validRange[i], validRange[j]] = [validRange[j], validRange[i]];
      }
      avatarIndices = validRange.slice(0, countToPick).sort((a,b)=>a-b);
      console.log(`🎲 Avatar set for Scenes: ${avatarIndices.map(i => i + 1)}`);
    }

    for (let i = 0; i < scriptData.length; i++) {
      const scene = scriptData[i];
      let currentPair = videoPairs[i];
      let isAvatar = false;

      if (avatarIndices.includes(i)) {
        currentPair = [this.avatarPath, null];
        isAvatar = true;
      } else if (!currentPair || !currentPair[0]) {
        continue;
      }

      const outputPath = await this.processScene(scene, currentPair, isAvatar);
      if (outputPath) renderedPaths.push(outputPath);
    }
    
    return renderedPaths;
  }

  async concatenateWithTransitions(videoPaths: string[], outputFilename = "final_short.mp4"): Promise<string | null> {
    console.log("🎬 Stitching final video...");
    await this.initialize();
    const outputPath = path.join(this.finalDir, outputFilename);

    if (existsSync(outputPath)) {
      try {
        await fs.unlink(outputPath);
      } catch (e) {
        console.log("⚠️ Warning: Could not delete old file.");
      }
    }

    if (!videoPaths || videoPaths.length === 0) return null;

    return new Promise(async (resolve, reject) => {
      const command = ffmpeg();
      let currentDur = await this.getDuration(videoPaths[0]);
      
      command.input(videoPaths[0]);

      let filterSpec: any[] = [];
      let currentV = '0:v';
      let currentA = '0:a';

      for (let i = 1; i < videoPaths.length; i++) {
        const nextDur = await this.getDuration(videoPaths[i]);
        command.input(videoPaths[i]);
        
        const transDur = 0.5;
        const offset = currentDur - transDur;
        const effect = this.transitions[Math.floor(Math.random() * this.transitions.length)];
        console.log(`   ✨ Transition ${i}: '${effect}' at ${offset.toFixed(2)}s`);

        const nextV = `${i}:v`;
        const nextA = `${i}:a`;
        const outV = `v${i}`;
        const outA = `a${i}`;

        filterSpec.push({
          filter: 'xfade',
          options: { transition: effect, duration: transDur, offset },
          inputs: [currentV, nextV],
          outputs: outV
        });

        filterSpec.push({
          filter: 'acrossfade',
          options: { d: transDur },
          inputs: [currentA, nextA],
          outputs: outA
        });

        currentV = outV;
        currentA = outA;
        currentDur = (currentDur + nextDur) - transDur;
      }

      if (filterSpec.length > 0) {
        command.complexFilter(filterSpec, [currentV, currentA]);
      }

      command.outputOptions([
        '-vcodec libx264',
        '-acodec aac',
        '-pix_fmt yuv420p',
        '-movflags +faststart', // Need '+' prefix in fluent-ffmpeg usually for flags, or just 'faststart'
        '-preset medium'
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`✅ FINAL VIDEO SAVED: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`❌ Stitching Error: ${err.message}`);
        resolve(null);
      })
      .run();
    });
  }
}
