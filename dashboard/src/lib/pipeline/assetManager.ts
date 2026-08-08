import fs from 'fs/promises';
import path from 'path';
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';

// We fetch Pexels key from environment or channel DB configuration
export class AssetManager {
  private apiKey: string;
  private baseUrl = "https://api.pexels.com/videos/search";
  private assetsDir: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.PEXELS_API_KEY || "hZBjjYowDAauyvn9rioK5qYMHFdCq11rKnmWo4OQlXhZspsVuo2DkpCP"; // original default
    this.assetsDir = path.resolve(process.cwd(), '../assets/video_clips');
  }

  async initialize() {
    await fs.mkdir(this.assetsDir, { recursive: true });
  }

  async searchVideo(query: string, durationMin = 4): Promise<string | null> {
    console.log(`   🔍 Searching Pexels for: '${query}'...`);
    const params = new URLSearchParams({
      query,
      per_page: '5',
      orientation: 'portrait',
      size: 'medium'
    });

    try {
      const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
        headers: { "Authorization": this.apiKey },
      });

      if (!response.ok) {
        console.warn(`      ⚠️ API Error: ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (!data.videos || data.videos.length === 0) {
        if (query.includes(' ')) {
          const words = query.split(' ');
          const simpleQuery = words[words.length - 1];
          console.log(`      ⚠️ No results. Retrying with '${simpleQuery}'...`);
          return this.searchVideo(simpleQuery, durationMin);
        }
        return null;
      }

      let validVideos = data.videos.filter((v: any) => v.duration >= durationMin);
      if (validVideos.length === 0) {
        validVideos = data.videos;
      }

      const selectedVideo = validVideos[Math.floor(Math.random() * validVideos.length)];
      
      const videoFiles = selectedVideo.video_files;
      videoFiles.sort((a: any, b: any) => (b.width * b.height) - (a.width * a.height));
      
      return videoFiles[0].link;
    } catch (e: any) {
      console.error(`      ❌ Error searching Pexels: ${e.message}`);
      return null;
    }
  }

  async downloadVideo(url: string, filename: string): Promise<string | null> {
    const savePath = path.join(this.assetsDir, filename);
    
    if (existsSync(savePath)) {
      return savePath;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error(`No body`);

      const fileStream = createWriteStream(savePath);
      // @ts-ignore
      await pipeline(response.body, fileStream);
      return savePath;
    } catch (e: any) {
      console.error(`      ❌ Error downloading ${filename}: ${e.message}`);
      return null;
    }
  }

  async getVideos(scriptData: any[]): Promise<Array<[string | null, string | null]>> {
    console.log("🎥 Starting Double-Feature Video Download...");
    const videoPairs: Array<[string | null, string | null]> = [];
    
    await this.initialize();

    for (const scene of scriptData) {
      const sceneId = scene.id;
      
      const queryA = scene.visual_1 || scene.keywords || 'abstract';
      const queryB = scene.visual_2 || queryA;

      const urlA = await this.searchVideo(queryA);
      let pathA = null;
      if (urlA) {
        pathA = await this.downloadVideo(urlA, `scene_${sceneId}_a.mp4`);
      }

      const urlB = await this.searchVideo(queryB);
      let pathB = null;
      if (urlB) {
        pathB = await this.downloadVideo(urlB, `scene_${sceneId}_b.mp4`);
      }

      if (!pathA && pathB) {
        pathA = pathB;
        console.log(`      ⚠️ Scene ${sceneId} Clip A missing. Using Clip B for both.`);
      }
      if (!pathB && pathA) {
        pathB = pathA;
        console.log(`      ⚠️ Scene ${sceneId} Clip B missing. Using Clip A for both.`);
      }

      if (pathA && pathB) {
        videoPairs.push([pathA, pathB]);
        console.log(`   ✅ Scene ${sceneId} Ready (A + B).`);
      } else {
        console.log(`   ❌ Scene ${sceneId} Completely Failed (No videos found).`);
        videoPairs.push([null, null]);
      }
    }

    return videoPairs;
  }
}
