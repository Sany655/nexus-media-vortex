"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Power, Database, Activity, Play, CheckCircle, Trash, Ghost, Terminal, X } from 'lucide-react';

export default function Dashboard() {
  const [logs, setLogs] = useState<any[]>([]);
  const [channel, setChannel] = useState("neuron_buster");
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [engineLogs, setEngineLogs] = useState("");
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [engineStartTime, setEngineStartTime] = useState<number | null>(null);
  const [playingTopic, setPlayingTopic] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState({ ig: true, yt: true, tk: true, privateMode: false });
  const [retryingTopic, setRetryingTopic] = useState<string | null>(null);

  useEffect(() => {
    const fetchDb = () => {
      fetch(`/api/database?channel=${channel}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setLogs(data.data);
          }
          setLoading(false);
        });
    };

    fetchDb();
    const dbInterval = setInterval(fetchDb, 3000);

    const interval = setInterval(() => {
      fetch('/api/engine/status')
        .then(res => res.json())
        .then(data => {
          setIsEngineRunning(data.isRunning);
          setEngineLogs(data.logs);
          setEngineStartTime(data.startTime || null);
          if (!data.isRunning) setRetryingTopic(null);
        });
    }, 2000);

    return () => clearInterval(interval);
  }, [channel]);

  const deleteVideo = async (topic: string) => {
    if (!confirm(`Are you sure you want to permanently delete '${topic}' from the database and hard drive?`)) return;
    
    await fetch('/api/media/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, channel })
    });
    
    const res = await fetch(`/api/database?channel=${channel}`);
    const data = await res.json();
    if (data.success) setLogs(data.data);
  };

  const triggerEngine = async () => {
    if (isEngineRunning) {
      alert("Engine is already running. Watch the terminal output.");
      return;
    }
    setTriggering(true);
    try {
      await fetch('/api/engine/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...platforms, channel })
      });
    } finally {
      setTriggering(false);
    }
  };

  const retrySingleTopic = async (topic: string) => {
    if (isEngineRunning) {
      alert("Engine is already running. Watch the terminal output.");
      return;
    }
    setTriggering(true);
    try {
      await fetch('/api/engine/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...platforms, channel, retryTopic: topic })
      });
    } finally {
      setTriggering(false);
    }
  };

  const killEngine = async () => {
    await fetch('/api/engine/kill', { method: 'POST' });
  };

  const syncAnalytics = async () => {
    await fetch('/api/analytics/sync', { method: 'POST' });
  };

  // Calculate Telemetry
  const totalIGViews = logs.reduce((acc, log) => acc + (log.instagram_views || 0), 0);
  const totalYTViews = logs.reduce((acc, log) => acc + (log.youtube_views || 0), 0);
  const totalTKViews = logs.reduce((acc, log) => acc + (log.tiktok_views || 0), 0);
  const totalOverallViews = totalIGViews + totalYTViews + totalTKViews;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-8 font-sans selection:bg-emerald-500/30">
      {/* Background Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-96 h-96 bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-end border-b border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-light tracking-tight text-white mb-2 flex items-center gap-3">
              <Activity className="text-emerald-400" />
              Genesis Command Center
            </h1>
            <p className="text-neutral-500">Autonomous Content Distribution Network v2.0</p>
          </div>
          
          <div className="flex items-center gap-4">
            <Link 
              href="/studio"
              className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
            >
              <Ghost size={18} />
              GHOST STUDIO
            </Link>
            
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg">
              <span className="text-xs text-neutral-400 font-mono">CHANNEL:</span>
              <select 
                value={channel} 
                onChange={e => setChannel(e.target.value)}
                className="bg-transparent text-emerald-400 font-medium text-sm outline-none border-none focus:ring-0 cursor-pointer"
              >
                <option value="neuron_buster" className="bg-neutral-900">Neuron Buster (AI/Tech)</option>
                <option value="glow_secrets" className="bg-neutral-900">Glow Secrets (Beauty/Daraz)</option>
              </select>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex gap-4 text-xs font-mono text-neutral-400">
                <label className="flex items-center gap-2 cursor-pointer hover:text-emerald-400 transition-colors">
                  <input type="checkbox" checked={platforms.ig} onChange={e => setPlatforms({...platforms, ig: e.target.checked})} className="accent-emerald-500 w-4 h-4" />
                  Instagram
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-emerald-400 transition-colors">
                  <input type="checkbox" checked={platforms.yt} onChange={e => setPlatforms({...platforms, yt: e.target.checked})} className="accent-emerald-500 w-4 h-4" />
                  YouTube
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-emerald-400 transition-colors">
                  <input type="checkbox" checked={platforms.tk} onChange={e => setPlatforms({...platforms, tk: e.target.checked})} className="accent-emerald-500 w-4 h-4" />
                  TikTok
                </label>
              </div>
              <div className="flex gap-4 text-xs font-mono text-neutral-400 -mt-2">
                <label className="flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors" title="Uploads as 'Private' to YouTube. (Does not affect IG/TK)">
                  <input type="checkbox" checked={platforms.privateMode} onChange={e => setPlatforms({...platforms, privateMode: e.target.checked})} className="accent-blue-500 w-4 h-4" />
                  Test Mode (Private Uploads)
                </label>
              </div>
              <button 
                onClick={triggerEngine}
                disabled={isEngineRunning || triggering}
                className={`w-full py-4 rounded font-bold tracking-widest text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2
                  ${isEngineRunning ? 'bg-neutral-800 text-neutral-500 border border-neutral-700' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/20'}
                `}
              >
                <Power size={18} />
                {triggering ? "INITIALIZING..." : (isEngineRunning ? "PROCESSING..." : "MANUAL OVERRIDE")}
              </button>
            </div>
          </div>
        </header>

        {/* Telemetry Matrix */}
        <div className="mb-8 mt-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-mono tracking-widest text-neutral-500 flex items-center gap-2">
              <Activity size={14} className="text-blue-400" /> TELEMETRY MATRIX
            </h2>
            <button 
              onClick={syncAnalytics}
              disabled={triggering}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 text-[10px] font-bold tracking-widest transition-colors disabled:opacity-50"
            >
              <Activity size={12} /> SYNC YOUTUBE DATA
            </button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#111111] border border-white/[0.05] p-5 relative overflow-hidden group">
              <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <h3 className="text-neutral-500 font-mono text-[10px] tracking-widest mb-1">TOTAL PIPELINE VIEWS</h3>
              <p className="text-3xl font-bold font-mono text-white tracking-tight">{totalOverallViews.toLocaleString()}</p>
            </div>
            <div className="bg-[#111111] border border-white/[0.05] p-5 relative overflow-hidden group">
              <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <h3 className="text-neutral-500 font-mono text-[10px] tracking-widest mb-1">YOUTUBE SHORTS</h3>
              <p className="text-2xl font-bold font-mono text-neutral-200 tracking-tight">{totalYTViews.toLocaleString()}</p>
            </div>
            <div className="bg-[#111111] border border-white/[0.05] p-5 relative overflow-hidden group">
              <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <h3 className="text-neutral-500 font-mono text-[10px] tracking-widest mb-1">TIKTOK NETWORK</h3>
              <p className="text-2xl font-bold font-mono text-neutral-200 tracking-tight">{totalTKViews.toLocaleString()}</p>
            </div>
            <div className="bg-[#111111] border border-white/[0.05] p-5 relative overflow-hidden group">
              <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <h3 className="text-neutral-500 font-mono text-[10px] tracking-widest mb-1">INSTAGRAM REELS</h3>
              <p className="text-2xl font-bold font-mono text-neutral-200 tracking-tight">{totalIGViews.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Live Engine Terminal */}
        <div className="rounded-2xl bg-[#0a0a0a] border border-white/5 overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
            <div className="flex items-center gap-2">
              <Terminal className="text-neutral-500" size={16} />
              <h2 className="text-sm font-medium text-neutral-300">Engine Live Output</h2>
            </div>
            {isEngineRunning && (
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-2 text-xs text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> COMPILING
                  {engineStartTime && (
                    <span className="text-neutral-500 font-mono ml-2">
                      ({new Date(engineStartTime).toLocaleTimeString()})
                    </span>
                  )}
                </span>
                <button 
                  onClick={killEngine}
                  className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded text-xs hover:bg-red-500/20 transition-colors"
                >
                  STOP ENGINE
                </button>
              </div>
            )}
          </div>
          <div className="p-4 h-64 overflow-y-auto bg-black font-mono text-xs text-emerald-400/80 whitespace-pre-wrap leading-relaxed">
            {engineLogs}
          </div>
        </div>

        {/* Database Table */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-white/5 flex items-center gap-2 bg-white/[0.01]">
            <Database className="text-neutral-400" size={18} />
            <h2 className="text-lg font-medium text-white">Content Log Database</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-neutral-500 text-sm bg-black/20">
                  <th className="p-4 font-medium pl-6">Topic</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Views</th>
                  <th className="p-4 font-medium">Date Created</th>
                  <th className="p-4 font-medium text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-neutral-600">Syncing with SQLite...</td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-neutral-600">Database is empty. Trigger the engine.</td>
                  </tr>
                ) : (
                  logs.map((log: any) => (
                    <tr key={log.id} className="border-b border-white/[0.02] hover:bg-white/[0.04] transition-colors">
                      <td className="p-4 font-medium text-neutral-300 pl-6">{log.topic}</td>
                      <td className="p-4">
                        <div className="flex gap-1.5 items-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest border ${log.uploaded_ig ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                            IG
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest border ${log.uploaded_yt ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                            YT
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest border ${log.uploaded_tk ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                            TK
                          </span>
                          {(!log.uploaded_ig || !log.uploaded_yt || !log.uploaded_tk) && (
                            <button 
                              onClick={() => retrySingleTopic(log.topic)}
                              disabled={isEngineRunning || triggering}
                              className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest transition-colors flex items-center gap-1 ${
                                retryingTopic === log.topic 
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-30'
                              }`}
                              title="Queue Rescue: Retry failed uploads for this video only"
                            >
                              <Play size={10} /> {retryingTopic === log.topic ? "UPLOADING..." : "RETRY"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-neutral-400">
                        {((log.youtube_views || 0) + (log.tiktok_views || 0) + (log.instagram_views || 0)).toLocaleString()}
                      </td>
                      <td className="p-4 text-neutral-500 text-xs font-mono">{log.created_at || 'Unknown'}</td>
                      <td className="p-4 text-right pr-6">
                        <button 
                          onClick={() => setPlayingTopic(log.topic)}
                          className="p-2 rounded-lg text-neutral-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors mr-2"
                          title="Watch Video"
                        >
                          <Play size={16} />
                        </button>
                        <button 
                          onClick={() => deleteVideo(log.topic)}
                          className="p-2 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete from DB & Disk"
                        >
                          <Trash size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Video Player Modal */}
      {playingTopic && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setPlayingTopic(null)}
        >
          <div 
            className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-4 right-4 z-10">
              <button 
                onClick={() => setPlayingTopic(null)} 
                className="p-2 bg-black/50 hover:bg-red-500/80 rounded-full text-white backdrop-blur-md transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <video 
              src={`/api/media?topic=${encodeURIComponent(playingTopic)}`}
              controls
              autoPlay
              className="w-full h-auto aspect-[9/16] object-cover"
            />
          </div>
        </div>
      )}

    </div>
  );
}
