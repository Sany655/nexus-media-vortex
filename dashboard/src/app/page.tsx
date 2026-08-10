"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Power, Database, Activity, Play, CheckCircle, Trash, Ghost, Terminal, X, LogOut, Settings, Plus, Calendar, Bot, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, setDoc, query, where, deleteDoc, updateDoc, doc, limit } from 'firebase/firestore';
export default function Dashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [logs, setLogs] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [channel, setChannel] = useState("");

  const [contentType, setContentType] = useState("short");
  const [scheduleTime, setScheduleTime] = useState("");
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [channelSettings, setChannelSettings] = useState({ pause_ig: false, pause_yt: false, pause_tk: false });
  const [newChannelForm, setNewChannelForm] = useState({ name: "", niche: "", target_audience: "" });
  const [brainState, setBrainState] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [playingTopic, setPlayingTopic] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState({ ig: true, yt: true, tk: true, privateMode: false });
  const [retryingTopic, setRetryingTopic] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const getShadowbanBadge = (plat: string) => {
    if (!brainState || !brainState.shadowban_levels) return null;
    const level = brainState.shadowban_levels[plat] || 0;
    if (level === 0) return <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-500 font-bold ml-2 uppercase">Healthy</span>;
    if (level === 1) return <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-yellow-500/10 text-yellow-500 font-bold ml-2 uppercase">Warning</span>;
    if (level === 2 || level === 2.5) return <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-orange-500/10 text-orange-500 font-bold ml-2 uppercase">Cooldown</span>;
    return <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-red-500/10 text-red-500 font-bold ml-2 uppercase">Blacklisted</span>;
  };

  const deleteLog = async (topic: string) => {
    if (!confirm(`Are you sure you want to permanently delete the content for "${topic}"?`)) return;
    try {
      const q = query(collection(db, 'content_queue'), where('topic', '==', topic));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(async (document) => {
        await deleteDoc(doc(db, 'content_queue', document.id));
      });
      await addDoc(collection(db, 'trigger_queue'), {
        user_id: user?.uid,
        type: 'DELETE_MEDIA',
        topic, channel_key: channel, created_at: new Date().toISOString()
      });
      setLogs(logs.filter(l => l.topic !== topic));
      showToast("Deleted successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to delete.");
    }
  };

  const retryLog = async (topic: string, action: 'generate' | 'upload') => {
    setRetryingTopic(topic);
    try {
      await addDoc(collection(db, 'trigger_queue'), {
        type: action === 'generate' ? 'RETRY_GENERATION' : 'RETRY_UPLOAD',
        topic, channel_id: channel, user_id: user?.uid, status: 'Pending', created_at: new Date().toISOString()
      });
      showToast(`Retry queued for ${action}.`);
    } catch (e) {
      console.error(e);
      alert("Failed to queue retry.");
    } finally {
      setRetryingTopic(null);
    }
  };


  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!user) return;

    // Fetch user channels
    const fetchChannels = async () => {
      try {
        const q = query(collection(db, 'channels'), where('user_id', '==', user.uid));
        const querySnapshot = await getDocs(q);
        let data: any[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (data.length === 0) {
          const all = await getDocs(collection(db, 'channels'));
          data = all.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        setChannels(data);
        if (data.length > 0 && !channel) {
          setChannel(data[0].channel_key);
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetchChannels();
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !channel) return;

    const fetchDb = async () => {
      try {
        const q = query(collection(db, 'content_queue'), where('channel_key', '==', channel));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const toMs = (val: any) => {
          if (!val) return 0;
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          return new Date(val).getTime();
        };
        data.sort((a: any, b: any) => toMs(b.created_at) - toMs(a.created_at));
        setLogs(data);
      } catch (e) { }
      setLoading(false);
    };

    const fetchSchedule = async () => {
      try {
        const q = query(collection(db, 'schedules'), where('channel_key', '==', channel));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data();
          const cron = docData.cron_expression;
          if (cron && cron.split(' ').length === 5) {
            const parts = cron.split(' ');
            const hh = parts[1].padStart(2, '0');
            const mm = parts[0].padStart(2, '0');
            setScheduleTime(`${hh}:${mm}`);
          } else {
            setScheduleTime(cron || "");
          }
          setContentType(docData.content_type || "short");
        } else {
          setScheduleTime("");
          setContentType("short");
        }
      } catch (e) { }
    };

    const fetchBrainState = async () => {
      try {
        const q = query(collection(db, 'channels'), where('channel_key', '==', channel), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setBrainState(snapshot.docs[0].data());
        }
      } catch (e) { }
    };

    fetchDb();
    fetchSchedule();
    fetchBrainState();

    const dbInterval = setInterval(() => {
      fetchDb();
      fetchBrainState();
    }, 3000);

    return () => {
      clearInterval(dbInterval);
    };
  }, [channel, user]);

  useEffect(() => {
    const currentChannel = channels.find(c => c.channel_key === channel);
    if (currentChannel) {
      try {
        const config = JSON.parse(currentChannel.api_keys_json || '{}');
        setPlatforms({
          ...platforms,
          ig: !config.pause_ig,
          yt: !config.pause_yt,
          tk: !config.pause_tk,
        });
      } catch (e) {
        setPlatforms(prev => ({ ...prev, ig: true, yt: true, tk: true }));
      }
    }
  }, [channel, channels]);

  if (authLoading || !user) {
    return <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center text-emerald-600"><Activity className="animate-pulse" size={48} /></div>;
  }

  // deleteVideo removed — duplicate of deleteLog above

  const triggerEngine = async () => {
    setTriggering(true);
    try {
      await addDoc(collection(db, 'trigger_queue'), {
        type: 'GENERATE_PIPELINE',
        channel_key: channel, user_id: user?.uid, status: 'Pending', created_at: new Date().toISOString()
      });
      showToast("Pipeline queued! Check the database log for status updates.");
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setTriggering(false);
    }
  };

  const scheduleEngine = async () => {
    if (!scheduleTime || !scheduleTime.includes(':')) {
      alert("Please select a valid time");
      return;
    }
    const [hh, mm] = scheduleTime.split(':');
    const cron_expression = `${parseInt(mm)} ${parseInt(hh)} * * *`;
    try {
      const q = query(collection(db, 'schedules'), where('channel_key', '==', channel), where('content_type', '==', contentType));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        await updateDoc(doc(db, 'schedules', snapshot.docs[0].id), {
          cron_expression, is_active: true, updated_at: new Date().toISOString(), user_id: user?.uid
        });
      } else {
        await addDoc(collection(db, 'schedules'), {
          channel_key: channel, content_type: contentType, cron_expression, is_active: true, created_at: new Date().toISOString(), user_id: user?.uid
        });
      }
      alert("Schedule created for " + scheduleTime + " daily!");
    } catch (e) {
      console.error(e);
      alert("Failed to create schedule.");
    }
  };

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelForm.name) return;
    try {
      const channel_key = newChannelForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      await setDoc(doc(db, 'channels', channel_key), {
        user_id: user?.uid,
        channel_key,
        ...newChannelForm,
        api_keys_json: "{}"
      });
      setShowChannelModal(false);
      window.location.reload();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openSettings = () => {
    const currentChannel = channels.find(c => c.channel_key === channel);
    if (currentChannel && currentChannel.api_keys_json) {
      try {
        const parsed = JSON.parse(currentChannel.api_keys_json);
        setChannelSettings({
          pause_ig: parsed.pause_ig || false,
          pause_yt: parsed.pause_yt || false,
          pause_tk: parsed.pause_tk || false,
        });
      } catch (e) {
        setChannelSettings({ pause_ig: false, pause_yt: false, pause_tk: false });
      }
    }
    setShowSettingsModal(true);
  };

  const saveSettings = async () => {
    const currentChannel = channels.find(c => c.channel_key === channel);
    if (!currentChannel) return;

    let parsed = {};
    try {
      parsed = JSON.parse(currentChannel.api_keys_json || '{}');
    } catch (e) { }

    const newConfig = { ...parsed, ...channelSettings };

    try {
      await updateDoc(doc(db, 'channels', channel), {
        api_keys_json: JSON.stringify(newConfig)
      });
      setShowSettingsModal(false);
      setChannels(channels.map(c => c.channel_key === channel ? { ...c, api_keys_json: JSON.stringify(newConfig) } : c));
      alert("Settings saved!");
    } catch (e) {
      console.error(e);
      alert("Failed to save settings");
    }
  };

  // Removed local engine kill command
  const syncAnalytics = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await addDoc(collection(db, 'trigger_queue'), {
        type: 'SYNC_ANALYTICS',
        status: 'Pending',
        created_at: new Date().toISOString()
      });
      showToast("Sync triggered! Waiting for daemon...");
    } catch (e) {
      showToast("Error syncing telemetry.");
    } finally {
      setIsSyncing(false);
    }
  };

  const totalIGViews = logs.reduce((acc, log) => acc + (log.instagram_views || 0), 0);
  const totalYTViews = logs.reduce((acc, log) => acc + (log.youtube_views || 0), 0);
  const totalTKViews = logs.reduce((acc, log) => acc + (log.tiktok_views || 0), 0);
  const totalOverallViews = totalIGViews + totalYTViews + totalTKViews;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 p-8 font-sans selection:bg-emerald-500/30">
      <div className="fixed top-[-10%] left-[-10%] w-96 h-96 bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-8">

        <header className="flex justify-between items-end border-b border-black/10 dark:border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-light tracking-tight text-neutral-900 dark:text-white mb-2 flex items-center gap-3">
              <Activity className="text-emerald-600" />
              Nexus Media Vortex Command Center
            </h1>
            <p className="text-neutral-500">Autonomous Content Distribution Network v3.0</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg">
              <span className="text-xs text-neutral-600 dark:text-neutral-400 font-mono">CHANNEL:</span>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value)}
                className="bg-transparent text-emerald-600 font-medium text-sm outline-none border-none focus:ring-0 cursor-pointer"
              >
                {loading ? <option value="">Loading...</option> :
                  channels.length === 0 ? <option value="">No Channels Yet</option> :
                    channels.map(c => (
                      <option key={c.channel_key} value={c.channel_key} className="bg-neutral-100 dark:bg-[#0a0a0a]">{c.name}</option>
                    ))}
              </select>
              {channel && (
                <span title={(!platforms.ig && !platforms.yt && !platforms.tk) ? 'All Uploads Paused' : (!platforms.ig || !platforms.yt || !platforms.tk) ? 'Some Uploads Paused' : 'Fully Automated'} className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded tracking-wider ${(!platforms.ig && !platforms.yt && !platforms.tk) ? 'bg-red-500/10 text-red-500' : (!platforms.ig || !platforms.yt || !platforms.tk) ? 'bg-yellow-500/10 text-yellow-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {(!platforms.ig && !platforms.yt && !platforms.tk) ? 'Halted' : (!platforms.ig || !platforms.yt || !platforms.tk) ? 'Restricted' : 'Autonomous'}
                </span>
              )}
              <Link href="/channels/new" title="Add Channel (Strategy Builder)" className="ml-2 text-neutral-500 hover:text-emerald-600 transition-colors">
                <Plus size={14} />
              </Link>
              {channel && (
                <Link href={`/channels/settings?id=${channel}`} title="Channel Settings" className="ml-2 text-neutral-500 hover:text-blue-500 transition-colors">
                  <Settings size={14} />
                </Link>
              )}
            </div>

            <ThemeToggle />

            <button onClick={signOut} className="p-2 text-neutral-500 hover:text-red-400 transition-colors" title="Sign Out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Action Panel */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#111111] border border-black/5 dark:border-white/5 p-6 rounded-2xl shadow-xl flex flex-col gap-4">
            <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 border-b border-black/5 dark:border-white/5 pb-2">Manual Generation</h2>

            <div className="flex gap-4">
              <select value={contentType} onChange={e => setContentType(e.target.value)} className="bg-white dark:bg-[#111111] border border-black/10 dark:border-white/10 text-neutral-900 dark:text-white rounded p-2 text-sm flex-1">
                <option value="post">Text Post (X/LinkedIn)</option>
                <option value="image">Image (Instagram/Pinterest)</option>
                <option value="short">Shorts (YT/IG/TK)</option>
                <option value="video">Long Video (YT)</option>
              </select>
            </div>

            <div className="flex gap-4 text-xs font-mono text-neutral-600 dark:text-neutral-400 mt-2">
              <label className="flex items-center gap-2 cursor-pointer hover:text-emerald-600 transition-colors">
                <input type="checkbox" checked={platforms.ig} onChange={e => setPlatforms({ ...platforms, ig: e.target.checked })} className="accent-emerald-500 w-4 h-4" /> IG
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-emerald-600 transition-colors">
                <input type="checkbox" checked={platforms.yt} onChange={e => setPlatforms({ ...platforms, yt: e.target.checked })} className="accent-emerald-500 w-4 h-4" /> YT
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-emerald-600 transition-colors">
                <input type="checkbox" checked={platforms.tk} onChange={e => setPlatforms({ ...platforms, tk: e.target.checked })} className="accent-emerald-500 w-4 h-4" /> TK
              </label>
              <span className="ml-auto text-neutral-400 dark:text-neutral-600">(Reflects Channel Settings)</span>
            </div>

            <button
              onClick={triggerEngine}
              disabled={triggering}
              className={`w-full py-3 rounded font-bold tracking-widest text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2 mt-auto
                  bg-emerald-500/10 text-emerald-600 border border-emerald-500/50 hover:bg-emerald-500/20
                `}
            >
              <Power size={18} />
              {triggering ? "QUEUING..." : "MANUAL OVERRIDE"}
            </button>
          </div>

          <div className="bg-white dark:bg-[#111111] border border-black/5 dark:border-white/5 p-6 rounded-2xl shadow-xl flex flex-col gap-4">
            <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 border-b border-black/5 dark:border-white/5 pb-2">Scheduling Network</h2>
            <p className="text-xs text-neutral-500">Automate {contentType} generation using a cron expression.</p>

            <div className="flex gap-4">
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                className="bg-white dark:bg-[#111111] border border-black/10 dark:border-white/10 text-neutral-900 dark:text-white rounded p-2 text-sm flex-1"
              />
            </div>

            <button
              onClick={scheduleEngine}
              className="w-full py-3 rounded font-bold tracking-widest text-sm transition-all bg-purple-500/10 text-purple-400 border border-purple-500/50 hover:bg-purple-500/20 flex items-center justify-center gap-2 mt-auto"
            >
              <Calendar size={18} />
              SCHEDULE TASK
            </button>
          </div>
        </div>

        {/* Empty State / Strategy Builder Highlight */}
        {!loading && channels.length === 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-12 text-center flex flex-col items-center gap-4 mt-8">
            <Bot size={48} className="text-emerald-500" />
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Welcome to Core Intelligence</h2>
            <p className="text-neutral-500 max-w-md">
              You don't have any channels set up yet. Use the AI Strategy Builder to design a highly profitable, fully automated niche channel.
            </p>
            <Link
              href="/channels/new"
              className="mt-4 px-8 py-4 bg-emerald-500 text-black font-bold rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] transition-all flex items-center gap-2"
            >
              <Plus size={20} />
              OPEN STRATEGY BUILDER
            </Link>
          </div>
        )}

        {/* Content Pipeline History */}
        <div className={`mt-8 ${channels.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-mono tracking-widest text-neutral-500 flex items-center gap-2">
              <Database size={14} className="text-blue-400" /> PIPELINE HISTORY
            </h2>
            <div className="flex items-center gap-4">
              {brainState?.next_analysis_timestamp && (
                <span className="text-[10px] text-blue-500 font-mono uppercase">
                  Next Scan: {new Date(brainState.next_analysis_timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
                </span>
              )}
              <button
                onClick={syncAnalytics}
                disabled={isSyncing}
                title="Sync latest views from platforms"
                className={`text-xs font-mono tracking-widest flex items-center gap-1 transition-colors ${isSyncing ? 'text-neutral-400 cursor-not-allowed' : 'text-blue-500 hover:text-blue-400'}`}
              >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} /> SYNC
              </button>
            </div>
          </div>
          <div className="bg-white dark:bg-[#111111] border border-black/5 dark:border-white/5 rounded-2xl shadow-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] text-xs font-mono tracking-wider text-neutral-500 uppercase">
                  <th className="p-4 font-medium">Content / Topic</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium text-center">IG</th>
                  <th className="p-4 font-medium text-center">YT</th>
                  <th className="p-4 font-medium text-center">TK</th>
                  <th className="p-4 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-neutral-500 font-mono text-xs">
                      No content generated yet. Hit Manual Override to start the pipeline.
                    </td>
                  </tr>
                ) : (
                  logs.map((log: any) => (
                    <tr key={log.id} className="border-b border-black/5 dark:border-white/5 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors">
                      <td className="p-4 font-medium text-neutral-900 dark:text-neutral-200">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-1 bg-black/5 dark:bg-white/10 rounded text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">{log.content_type || 'video'}</span>
                          {log.topic}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-1 rounded font-mono ${log.status === 'TK_AUTH_SUSPENDED' ? 'bg-red-600 text-white font-bold animate-pulse' :
                          log.status?.toLowerCase().includes('fail') ? 'bg-red-500/10 text-red-600' :
                            log.status === 'Completed' || log.status === 'Uploaded' ? 'bg-emerald-500/10 text-emerald-600' :
                              'bg-blue-500/10 text-blue-600'
                          }`}>
                          {log.status === 'TK_AUTH_SUSPENDED' ? '⚠️ UPDATE TIKTOK COOKIES' : (log.status || 'Processing...')}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        {log.uploaded_ig ? (
                          <div className="flex flex-col items-center gap-1">
                            <CheckCircle size={14} className="text-emerald-500" />
                            {log.instagram_views !== undefined && (
                              <span className="text-[10px] font-mono text-neutral-500 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                                {(log.instagram_views || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ) : <X size={14} className="text-neutral-300 dark:text-neutral-700 mx-auto" />}
                      </td>
                      <td className="p-4 text-center">
                        {log.uploaded_yt ? (
                          <div className="flex flex-col items-center gap-1">
                            <CheckCircle size={14} className="text-emerald-500" />
                            {log.youtube_views !== undefined && (
                              <span className="text-[10px] font-mono text-neutral-500 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                                {(log.youtube_views || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ) : <X size={14} className="text-neutral-300 dark:text-neutral-700 mx-auto" />}
                      </td>
                      <td className="p-4 text-center">
                        {log.uploaded_tk ? (
                          <div className="flex flex-col items-center gap-1">
                            <CheckCircle size={14} className="text-emerald-500" />
                            {log.tiktok_views !== undefined && (
                              <span className="text-[10px] font-mono text-neutral-500 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                                {(log.tiktok_views || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ) : <X size={14} className="text-neutral-300 dark:text-neutral-700 mx-auto" />}
                      </td>
                      <td className="p-4 text-right flex items-center justify-end gap-3">
                        <span className="text-xs text-neutral-500 font-mono hidden md:inline" suppressHydrationWarning>
                          {log.created_at
                            ? (() => { try { return typeof log.created_at.toDate === 'function' ? log.created_at.toDate().toLocaleString() : new Date(log.created_at).toLocaleString(); } catch { return 'N/A'; } })()
                            : 'N/A'}
                        </span>

                        {/* Rescue Actions */}
                        {log.status?.toLowerCase().includes('fail') && (
                          <button
                            onClick={() => retryLog(log.topic, 'generate')}
                            disabled={retryingTopic === log.topic}
                            title="Retry Generation"
                            className="p-1.5 bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 rounded disabled:opacity-50 transition-colors"
                          >
                            <Play size={14} />
                          </button>
                        )}
                        {(() => { const s = log.status || ''; const inProgress = ['Initializing', 'Drafting', 'Generating', 'Downloading', 'Rendering', 'Uploading', 'Processing'].some(k => s.toLowerCase().includes(k.toLowerCase())); return !s.toLowerCase().includes('fail') && !inProgress && (!log.uploaded_ig || !log.uploaded_yt || !log.uploaded_tk); })() && (
                          <button
                            onClick={() => retryLog(log.topic, 'upload')}
                            disabled={retryingTopic === log.topic}
                            title="Retry Uploads"
                            className="p-1.5 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 rounded disabled:opacity-50 transition-colors"
                          >
                            <Play size={14} />
                          </button>
                        )}

                        <button
                          onClick={() => deleteLog(log.topic)}
                          title="Delete Content"
                          className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showSettingsModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white dark:bg-[#111111] border border-black/10 dark:border-white/10 p-8 rounded-2xl shadow-2xl max-w-md w-full relative">
              <button onClick={() => setShowSettingsModal(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
                <X size={20} />
              </button>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-6">Channel Settings</h2>

              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Auto-Upload Distribution</span>
                  <p className="text-xs text-neutral-500 mb-2">Pause uploads for specific platforms to prevent shadowbans or manually review content before publishing.</p>

                  <label className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-lg cursor-pointer">
                    <span className="text-sm font-medium">Pause Instagram Reels</span>
                    <input type="checkbox" checked={channelSettings.pause_ig} onChange={e => setChannelSettings({ ...channelSettings, pause_ig: e.target.checked })} className="accent-blue-500 w-4 h-4" />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-lg cursor-pointer">
                    <span className="text-sm font-medium">Pause YouTube Shorts</span>
                    <input type="checkbox" checked={channelSettings.pause_yt} onChange={e => setChannelSettings({ ...channelSettings, pause_yt: e.target.checked })} className="accent-red-500 w-4 h-4" />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-lg cursor-pointer">
                    <span className="text-sm font-medium">Pause TikTok Network</span>
                    <input type="checkbox" checked={channelSettings.pause_tk} onChange={e => setChannelSettings({ ...channelSettings, pause_tk: e.target.checked })} className="accent-teal-500 w-4 h-4" />
                  </label>
                </div>

                <button
                  onClick={saveSettings}
                  className="w-full mt-4 py-3 bg-blue-500 text-white font-bold rounded-lg shadow-lg hover:bg-blue-600 transition-colors"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
      {/* Toast Notification */}
      <div
        className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${toastMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
      >
        <div className="bg-neutral-900 dark:bg-white text-white dark:text-black px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
          <CheckCircle size={18} className="text-emerald-500" />
          <p className="font-medium text-sm">{toastMessage}</p>
        </div>
      </div>

    </div>
  );
}
