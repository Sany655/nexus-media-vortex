"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Ghost, Wand2, Terminal, ShieldAlert, Activity, Power } from 'lucide-react';

export default function GhostStudio() {
  const [topic, setTopic] = useState('');
  const [scriptJSON, setScriptJSON] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [engineLogs, setEngineLogs] = useState("");
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [engineStartTime, setEngineStartTime] = useState<number | null>(null);
  const [platforms, setPlatforms] = useState({ ig: true, yt: true, tk: true, privateMode: false });

  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/engine/status')
        .then(res => res.json())
        .then(data => {
          setIsEngineRunning(data.isRunning);
          setEngineLogs(data.logs);
          setEngineStartTime(data.startTime || null);
        });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const defaultScriptFormat = `[
  {
    "id": 1,
    "text": "Your first sentence here...",
    "visual_1": "dark dramatic cinematic",
    "visual_2": "scary mystery horror",
    "mood": "suspense"
  }
]`;

  const injectPayload = async () => {
    if (isEngineRunning) {
      alert("Engine is already running. Watch the terminal output.");
      return;
    }
    setTriggering(true);
    
    const payload: any = { platforms };
    if (topic.trim()) payload.topic = topic;
    if (scriptJSON.trim()) {
      try {
        payload.script = JSON.parse(scriptJSON);
      } catch (e) {
        alert("Invalid JSON script format. Please fix it or leave it blank.");
        setTriggering(false);
        return;
      }
    }

    const res = await fetch('/api/engine/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) alert(data.error);

    setTimeout(() => {
      setTriggering(false);
      setTopic('');
      setScriptJSON('');
    }, 1500);
  };

  const killEngine = async () => {
    await fetch('/api/engine/kill', { method: 'POST' });
    setIsEngineRunning(false);
    setTriggering(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-8 font-sans selection:bg-purple-500/30">
      <div className="fixed top-[10%] left-[20%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-end border-b border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-light tracking-tight text-white mb-2 flex items-center gap-3">
              <Ghost className="text-purple-400" />
              Ghost Studio
            </h1>
            <p className="text-neutral-500">Manual Neural Override Terminal</p>
          </div>
          
          <div className="flex items-center gap-4">
          <div className="flex flex-col gap-2">
            <Link 
              href="/"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              <Activity size={18} />
              DASHBOARD
            </Link>

            {/* Distribution Matrix UI */}
            <div className="flex gap-4 text-xs font-mono text-neutral-400 mt-2">
              <label className="flex items-center gap-2 cursor-pointer hover:text-purple-400 transition-colors">
                <input type="checkbox" checked={platforms.ig} onChange={e => setPlatforms({...platforms, ig: e.target.checked})} className="accent-purple-500 w-4 h-4" />
                Instagram
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-purple-400 transition-colors">
                <input type="checkbox" checked={platforms.yt} onChange={e => setPlatforms({...platforms, yt: e.target.checked})} className="accent-purple-500 w-4 h-4" />
                YouTube
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-purple-400 transition-colors">
                <input type="checkbox" checked={platforms.tk} onChange={e => setPlatforms({...platforms, tk: e.target.checked})} className="accent-purple-500 w-4 h-4" />
                TikTok
              </label>
            </div>
            <div className="flex gap-4 text-xs font-mono text-neutral-400 mt-1 mb-2">
              <label className="flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors" title="Uploads as 'Private' to YouTube. (Does not affect IG/TK)">
                <input type="checkbox" checked={platforms.privateMode} onChange={e => setPlatforms({...platforms, privateMode: e.target.checked})} className="accent-blue-500 w-4 h-4" />
                Test Mode (Private Uploads)
              </label>
            </div>

            <button 
              onClick={injectPayload}
              disabled={triggering || isEngineRunning}
              className={`w-full py-4 mt-2 rounded font-bold tracking-widest text-sm transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)]
                ${(triggering || isEngineRunning) 
                  ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-wait' 
                  : 'bg-purple-500/10 text-purple-400 border border-purple-500/50 hover:bg-purple-500/20'
                }`}
            >
              <Power size={18} />
              {(triggering || isEngineRunning) ? "PROCESSING..." : "IGNITE PAYLOAD"}
            </button>
          </div>
          </div>
        </header>

        {/* Studio Controls */}
        <div className="grid grid-cols-1 gap-6">
          
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <Terminal size={18} />
              <h2 className="font-medium text-white">Target Vector (Topic)</h2>
            </div>
            <p className="text-xs text-neutral-500">Leave blank to let the AI automatically continue the serialized storyline.</p>
            <input 
              type="text" 
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. The Real Story of The Patriot (Part 1)"
              className="w-full bg-black/40 border border-white/10 rounded-lg p-4 text-white placeholder-neutral-700 focus:outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-neutral-400">
                <ShieldAlert size={18} />
                <h2 className="font-medium text-white">Neural Override (Custom Script)</h2>
              </div>
              <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-1 rounded">Strict JSON Format Required</span>
            </div>
            <p className="text-xs text-neutral-500">Leave blank to let the AI write the script based on your topic. If you provide JSON, the AI writer will be completely bypassed.</p>
            <textarea 
              value={scriptJSON}
              onChange={(e) => setScriptJSON(e.target.value)}
              placeholder={defaultScriptFormat}
              rows={12}
              className="w-full bg-black/40 border border-white/10 rounded-lg p-4 text-white font-mono text-sm placeholder-neutral-700 focus:outline-none focus:border-purple-500/50 transition-colors resize-y"
            />
          </div>

        </div>
        
        {/* Live Engine Terminal */}
        <div className="rounded-2xl bg-[#0a0a0a] border border-white/5 overflow-hidden shadow-2xl mt-8">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
            <div className="flex items-center gap-2">
              <Terminal className="text-neutral-500" size={16} />
              <h2 className="text-sm font-medium text-neutral-300">Engine Live Output</h2>
            </div>
            {isEngineRunning && (
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-2 text-xs text-purple-400">
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" /> COMPILING
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
          <div className="p-4 h-64 overflow-y-auto bg-black font-mono text-xs text-purple-400/80 whitespace-pre-wrap leading-relaxed">
            {engineLogs}
          </div>
        </div>

      </div>
    </div>
  );
}
