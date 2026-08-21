"use client";
import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Power, Database, Activity, Play, CheckCircle, Trash, Terminal,
  X, LogOut, Settings, Plus, Calendar, Bot, RefreshCw, AlertTriangle,
  Zap, Copy, ExternalLink, Eye, ChevronDown, ChevronUp, Clock, Send,
} from 'lucide-react';

import { useAuth } from '@/components/AuthProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, getDocs, setDoc, query, where, deleteDoc,
  updateDoc, doc, limit, onSnapshot
} from 'firebase/firestore';

import { FrontendBrain } from '@/lib/frontendBrain';
import { SocketProvider, useSocket } from '@/components/SocketProvider';
import { EngineStatusBadge } from '@/components/EngineStatusBadge';
import { InstantGenerationBar } from '@/components/InstantGenerationBar';

// ----------- Platform publish links -----------
const PLATFORM_LINKS: Record<string, { label: string; url: string; color: string }> = {
  yt: { label: 'YouTube Studio', url: 'https://studio.youtube.com/channel/videos/upload', color: 'text-red-500 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' },
  ig: { label: 'Instagram', url: 'https://www.instagram.com/', color: 'text-pink-500 border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20' },
  tk: { label: 'TikTok Upload', url: 'https://www.tiktok.com/upload', color: 'text-neutral-300 border-neutral-500/30 bg-neutral-500/10 hover:bg-neutral-500/20' },
  fb: { label: 'Facebook', url: 'https://www.facebook.com/', color: 'text-blue-500 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' },
  x: { label: 'X (Twitter)', url: 'https://x.com/compose/tweet', color: 'text-sky-400 border-sky-400/30 bg-sky-400/10 hover:bg-sky-400/20' },
};

const RISKY_PLATFORMS = ['tk', 'fb'];

type PipelineMode = 'autonomous' | 'manual_review';
type GenerationMode = 'frontend' | 'queue_server';

// ----------- Missed Schedule Banner -----------
function MissedScheduleBanner({
  schedule,
  channel,
  onGenerate,
}: {
  schedule: any;
  channel: string;
  onGenerate: (scheduleId: string) => void;
}) {
  if (!schedule) return null;
  const nextRun = schedule.next_run ? new Date(schedule.next_run) : null;
  const isMissed = nextRun && nextRun < new Date();
  if (!isMissed) return null;

  return (
    <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-400">
      <AlertTriangle size={18} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Missed Scheduled Generation</p>
        <p className="text-xs text-amber-500/80 mt-0.5">
          A scheduled post for <strong>{schedule.content_type}</strong> was due{' '}
          {nextRun.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.
          Your daemon was offline. You can generate it now from the dashboard.
        </p>
      </div>
      <button
        onClick={() => onGenerate(schedule.id)}
        className="flex-shrink-0 px-4 py-2 text-xs font-bold bg-amber-500/20 border border-amber-500/40 rounded-lg hover:bg-amber-500/30 transition-colors"
      >
        Generate Now
      </button>
    </div>
  );
}

// ----------- Content Review Expanded Panel -----------
function ContentReviewPanel({
  log,
  channelConfig,
  user,
  channel,
  onMarkPublished,
  onRetry,
}: {
  log: any;
  channelConfig: any;
  user: any;
  channel: string;
  onMarkPublished: (topic: string, platform: string) => void;
  onRetry: (topic: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const { emitPublish } = useSocket();

  const triggerPlatformPublish = async (platformKey: string) => {
    setPublishing(platformKey);
    try {
      // 1. Instant Socket.IO trigger
      emitPublish({
        topic: log.topic,
        channel_key: channel,
        platform: platformKey,
        user_id: user?.uid,
      });

      // 2. Persistent Firestore queue
      await addDoc(collection(db, 'trigger_queue'), {
        type: 'PUBLISH_CONTENT',
        topic: log.topic,
        channel_key: channel,
        user_id: user?.uid,
        platform: platformKey,
        status: 'Pending',
        created_at: new Date().toISOString(),
      });
      onMarkPublished(log.topic, platformKey);
    } catch (e) {
      console.error(e);
    } finally {
      setPublishing(null);
    }
  };

  // Determine enabled platforms from channel config
  const config = (() => {
    try { return JSON.parse(channelConfig?.api_keys_json || '{}'); } catch { return {}; }
  })();
  const contentType = log.content_type || 'short';
  const enabledPlatforms = Object.keys(PLATFORM_LINKS).filter(pk => {
    if (config[`pause_${pk}`]) return false;
    const types: string[] = config[`${pk}_content_types`] || [];
    return types.includes(contentType) || types.length === 0;
  });

  const content = log.generated_content || log.script || '';
  const caption = log.generated_caption || log.description || '';
  const hashtags = log.generated_hashtags || '';

  return (
    <div className="border-t border-black/5 dark:border-white/5 bg-black/[0.015] dark:bg-white/[0.015] p-5 space-y-4">

      {/* Generated Content */}
      {content && (
        <div className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Generated Content</div>
          <div className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed bg-black/5 dark:bg-white/5 rounded-lg p-3 max-h-32 overflow-y-auto border border-black/5 dark:border-white/5 font-mono whitespace-pre-wrap">
            {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
          </div>
        </div>
      )}

      {/* Caption & Hashtags */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {caption && (
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Caption</div>
            <div className="text-xs text-neutral-600 dark:text-neutral-300 bg-black/5 dark:bg-white/5 rounded-lg p-3 max-h-24 overflow-y-auto border border-black/5 dark:border-white/5 leading-relaxed">
              {caption}
            </div>
            <button
              onClick={() => copyToClipboard(caption, 'caption')}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-emerald-500 transition-colors"
            >
              {copied === 'caption' ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
              {copied === 'caption' ? 'Copied!' : 'Copy Caption'}
            </button>
          </div>
        )}
        {hashtags && (
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Hashtags</div>
            <div className="text-xs text-neutral-600 dark:text-neutral-300 bg-black/5 dark:bg-white/5 rounded-lg p-3 border border-black/5 dark:border-white/5">
              {hashtags}
            </div>
            <button
              onClick={() => copyToClipboard(hashtags, 'hashtags')}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-emerald-500 transition-colors"
            >
              {copied === 'hashtags' ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
              {copied === 'hashtags' ? 'Copied!' : 'Copy Hashtags'}
            </button>
          </div>
        )}
      </div>

      {/* Publish Actions */}
      <div className="pt-2 border-t border-black/5 dark:border-white/5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 mb-3">Publish To</div>
        <div className="flex flex-wrap gap-2">
          {enabledPlatforms.map(pk => {
            const pl = PLATFORM_LINKS[pk];
            const isRisky = RISKY_PLATFORMS.includes(pk);
            const alreadyUploaded = log[`uploaded_${pk}`];
            const canAutoPublish = contentType !== 'post' && contentType !== 'image';

            if (alreadyUploaded) {
              return (
                <span key={pk} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <CheckCircle size={11} /> {pl.label} Done
                </span>
              );
            }

            return (
              <div key={pk} className="flex items-center gap-1">
                {/* Auto-publish button (only for video types, not text/image which need manual) */}
                {canAutoPublish && (
                  <button
                    onClick={() => triggerPlatformPublish(pk)}
                    disabled={!!publishing}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-l-lg border transition-all ${pl.color} ${isRisky ? 'opacity-80' : ''} disabled:opacity-50`}
                    title={isRisky ? '⚠️ Risk platform — proceed with caution' : `Publish to ${pl.label}`}
                  >
                    {publishing === pk ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                    {isRisky && '⚠️ '}Publish
                    {publishing === pk ? '...' : ''}
                  </button>
                )}

                {/* Manual link */}
                <a
                  href={pl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border transition-all ${pl.color} ${canAutoPublish ? 'rounded-r-lg border-l-0' : 'rounded-lg'}`}
                  title={`Open ${pl.label} to post manually`}
                >
                  <ExternalLink size={11} />
                  {canAutoPublish ? 'Open' : pl.label}
                </a>
              </div>
            );
          })}
        </div>
        {(contentType === 'post' || contentType === 'image') && (
          <p className="mt-2 text-xs text-neutral-400">
            ℹ️ Text/Image content is posted manually — copy the caption above and use the platform links.
          </p>
        )}
      </div>

      {/* Mark as Published */}
      <div className="flex justify-end pt-1">
        <button
          onClick={() => onMarkPublished(log.topic, 'all')}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-colors"
        >
          <CheckCircle size={12} /> Mark as Published
        </button>
      </div>
    </div>
  );
}

// ----------- Main Dashboard Content -----------
function DashboardContent() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const { isConnected, emitInstantGeneration, emitPublish, emitRetry, emitSyncAnalytics, emitUpdateSchedule, liveProgress } = useSocket();

  const [logs, setLogs] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [channel, setChannel] = useState('');
  const [schedule, setSchedule] = useState<any>(null);
  const [brainState, setBrainState] = useState<any>(null);

  const [scheduleTime, setScheduleTime] = useState('');
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('autonomous');

  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [retryingTopic, setRetryingTopic] = useState<string | null>(null);
  
  // API Keys Modal State
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [tempPexelsKey, setTempPexelsKey] = useState('');
  const [savingKeys, setSavingKeys] = useState(false);

  // Missed schedule generation modal
  const [missedScheduleId, setMissedScheduleId] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateExtraHint, setGenerateExtraHint] = useState('');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('frontend');

  const unsubRefs = useRef<(() => void)[]>([]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const currentChannelObj = channels.find(c => c.channel_key === channel);
  const channelConfig = (() => {
    try { return JSON.parse(currentChannelObj?.api_keys_json || '{}'); } catch { return {}; }
  })();

  // User-level API Keys (stored in users/{uid}.api_keys_json)
  const [userApiKeys, setUserApiKeys] = useState<any>({});
  const geminiKey = userApiKeys.gemini_api_key || '';
  const pexelsKey = userApiKeys.pexels_api_key || '';

  // Real-time listener for user profile / user-level api_keys_json
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        try {
          setUserApiKeys(data.api_keys_json ? JSON.parse(data.api_keys_json) : {});
        } catch {
          setUserApiKeys({});
        }
      }
    }, (err) => {
      console.error('Error fetching user api_keys:', err);
    });
    return () => unsub();
  }, [user]);

  const enabledTypes = useMemo(() => {
    if (!channelConfig) return ['short'];
    const types = new Set([
      ...(channelConfig.ig_content_types || []),
      ...(channelConfig.yt_content_types || []),
      ...(channelConfig.tk_content_types || []),
      ...(channelConfig.fb_content_types || []),
      ...(channelConfig.x_content_types || []),
    ]);
    if (types.size === 0) return ['short'];
  }, [channelConfig]);

  // ----------- Fetch Channels -----------
  useEffect(() => {
    if (!authLoading && !user) { router.push('/login'); return; }
    if (!user) return;

    const q = query(collection(db, 'channels'), where('user_id', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const data: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setChannels(data);
      if (data.length > 0 && !channel) {
        setChannel(data[0].channel_key);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching channels:", error);
      setLoading(false);
    });

    return () => unsub();
  }, [user, authLoading, router, channel]);

  // ----------- Real-time Firestore Listeners (replaces 3s polling) -----------
  useEffect(() => {
    if (!user || !channel) return;

    // Cleanup previous listeners
    unsubRefs.current.forEach(fn => fn());
    unsubRefs.current = [];

    setLogs([]);
    setLoading(true);

    // 1. Content queue — real-time
    const contentQ = query(
      collection(db, 'content_queue'),
      where('channel_key', '==', channel),
      where('user_id', '==', user.uid)
    );
    const unsubContent = onSnapshot(contentQ, snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const toMs = (v: any) => {
        if (!v) return 0;
        if (typeof v.toDate === 'function') return v.toDate().getTime();
        return new Date(v).getTime();
      };
      data.sort((a: any, b: any) => toMs(b.created_at) - toMs(a.created_at));
      setLogs(data);
      setLoading(false);
    });
    unsubRefs.current.push(unsubContent);

    // 2. Schedule — real-time
    const schedQ = query(collection(db, 'schedules'), where('channel_key', '==', channel), where('user_id', '==', user.uid));
    const unsubSched = onSnapshot(schedQ, snapshot => {
      if (!snapshot.empty) {
        const docData = snapshot.docs[0].data();
        setSchedule({ id: snapshot.docs[0].id, ...docData });
        const cron = docData.cron_expression;
        if (cron && cron.split(' ').length === 5) {
          const parts = cron.split(' ');
          setScheduleTime(`${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`);
        } else {
          setScheduleTime(cron || '');
        }

      } else {
        setSchedule(null);
        setScheduleTime('');

      }
    });
    unsubRefs.current.push(unsubSched);

    // 3. Brain state — real-time
    const brainQ = query(collection(db, 'channels'), where('channel_key', '==', channel), where('user_id', '==', user.uid), limit(1));
    const unsubBrain = onSnapshot(brainQ, snapshot => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setBrainState(data);
        // Sync pipeline mode from channel config
        try {
          const cfg = JSON.parse(data.api_keys_json || '{}');
          setPipelineMode(cfg.pipeline_mode || 'autonomous');
        } catch { }
      }
    });
    unsubRefs.current.push(unsubBrain);

    return () => {
      unsubRefs.current.forEach(fn => fn());
      unsubRefs.current = [];
    };
  }, [channel, user]);

  // ----------- Actions -----------
  const getShadowbanBadge = (plat: string) => {
    if (!brainState?.shadowban_levels) return null;
    const level = brainState.shadowban_levels[plat] || 0;
    if (level === 0) return <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-500 font-bold ml-2 uppercase">Healthy</span>;
    if (level === 1) return <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-yellow-500/10 text-yellow-500 font-bold ml-2 uppercase">Warning</span>;
    if (level === 2 || level === 2.5) return <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-orange-500/10 text-orange-500 font-bold ml-2 uppercase">Cooldown</span>;
    return <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-red-500/10 text-red-500 font-bold ml-2 uppercase">Blacklisted</span>;
  };

  const deleteLog = async (topic: string) => {
    if (!confirm(`Delete content for "${topic}"?`)) return;
    try {
      const q = query(collection(db, 'content_queue'), where('topic', '==', topic), where('user_id', '==', user?.uid));
      const snap = await getDocs(q);
      snap.forEach(async d => await deleteDoc(doc(db, 'content_queue', d.id)));
      await addDoc(collection(db, 'trigger_queue'), {
        user_id: user?.uid, type: 'DELETE_MEDIA', topic, channel_key: channel,
        created_at: new Date().toISOString()
      });
      showToast('Deleted successfully.');
    } catch (e) {
      showToast('Failed to delete.', 'error');
    }
  };

  const retryLog = async (topic: string, action: 'generate' | 'upload') => {
    setRetryingTopic(topic);
    try {
      // 1. Instant Socket.IO emit
      emitRetry({
        topic,
        channel_key: channel,
        user_id: user?.uid,
      });

      // 2. Persistent Firestore trigger queue
      await addDoc(collection(db, 'trigger_queue'), {
        type: action === 'generate' ? 'RETRY_GENERATION' : 'RETRY_UPLOAD',
        topic, channel_id: channel, user_id: user?.uid,
        status: 'Pending', created_at: new Date().toISOString()
      });
      showToast(`⚡ Instant retry dispatched for ${action} on '${topic}'.`);
    } catch (e) {
      showToast('Failed to queue retry.', 'error');
    } finally {
      setRetryingTopic(null);
    }
  };

  const markPublished = async (topic: string, platform: string) => {
    try {
      const q = query(collection(db, 'content_queue'), where('topic', '==', topic), where('user_id', '==', user?.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const ref = doc(db, 'content_queue', snap.docs[0].id);
        if (platform === 'all') {
          await updateDoc(ref, { status: 'Uploaded', uploaded_ig: true, uploaded_yt: true, uploaded_tk: true, uploaded_fb: true, uploaded_x: true });
        } else {
          await updateDoc(ref, { [`uploaded_${platform}`]: true });
        }
      }
      showToast(platform === 'all' ? 'Marked as fully published!' : `Marked as published on ${platform.toUpperCase()}.`);
    } catch (e) {
      showToast('Failed to update status.', 'error');
    }
  };

  const queueForServer = async (ct: string) => {
    await addDoc(collection(db, 'trigger_queue'), {
      type: 'GENERATE_PIPELINE',
      channel_key: channel, user_id: user?.uid,
      content_type: ct,
      status: 'Pending', created_at: new Date().toISOString()
    });
  };

  const generateInBrowser = async (ct: string, missedSchedId?: string) => {
    const brain = new FrontendBrain(geminiKey, currentChannelObj!, user!.uid);
    await brain.runFullGeneration(ct, generateExtraHint || undefined, missedSchedId);
  };

  const executeChannelStrategy = async (missedSchedId?: string) => {
    if (!currentChannelObj) return;
    
    setGenerating(true);
    setTriggering(true);
    setShowGenerateModal(false);
    
    try {
      let browserCount = 0;
      let serverCount = 0;

      for (const ct of (enabledTypes || [])) {
        if (ct === 'post' || ct === 'image') {
          if (!geminiKey) {
            showToast(`Gemini API key missing. Cannot generate ${ct} in browser.`, 'error');
            continue;
          }
          await generateInBrowser(ct, missedSchedId);
          browserCount++;
        } else {
          await queueForServer(ct);
          serverCount++;
        }
      }
      
      setGenerateExtraHint('');
      showToast(`Strategy Executed! ${browserCount} generated in browser, ${serverCount} queued for server.`);
    } catch (e: any) {
      showToast('Error executing strategy: ' + e.message, 'error');
    } finally {
      setGenerating(false);
      setTriggering(false);
    }
  };

  const handleMissedScheduleGenerate = (scheduleId: string) => {
    setMissedScheduleId(scheduleId);
    setShowGenerateModal(true);
  };

  const scheduleEngine = async () => {
    if (!scheduleTime || !scheduleTime.includes(':')) { alert('Please select a valid time'); return; }
    const [hh, mm] = scheduleTime.split(':');
    const cron_expression = `${parseInt(mm)} ${parseInt(hh)} * * *`;
    try {
      for (const ct of (enabledTypes || [])) {
        // 1. Instant Socket.IO reschedule
        emitUpdateSchedule({
          channel_key: channel,
          content_type: ct,
          cron_expression,
          user_id: user?.uid,
        });

        // 2. Persistent Firestore save
        const q = query(collection(db, 'schedules'), where('channel_key', '==', channel), where('content_type', '==', ct), where('user_id', '==', user?.uid));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          await updateDoc(doc(db, 'schedules', snapshot.docs[0].id), {
            cron_expression, is_active: true, updated_at: new Date().toISOString(), user_id: user?.uid
          });
        } else {
          await addDoc(collection(db, 'schedules'), {
            channel_key: channel, content_type: ct, cron_expression,
            is_active: true, created_at: new Date().toISOString(), user_id: user?.uid
          });
        }
      }
      showToast('⚡ Schedule synchronized with Python Engine at ' + scheduleTime + ' daily!');
    } catch (e) {
      showToast('Failed to save schedule.', 'error');
    }
  };

  const syncAnalytics = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      emitSyncAnalytics(channel);
      await addDoc(collection(db, 'trigger_queue'), {
        type: 'SYNC_ANALYTICS', status: 'Pending', created_at: new Date().toISOString(),
        channel_key: channel
      });
      showToast('⚡ Analytics sync dispatched to Python Engine!');
    } catch {
      showToast('Error syncing.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Is content type generatable in browser?
  

  // Check API keys at the user level
  const hasMissingKeys = !!user && (!userApiKeys.gemini_api_key || !userApiKeys.pexels_api_key);

  const saveApiKeys = async () => {
    if (!tempGeminiKey || !tempPexelsKey) {
      showToast('Both keys are required.', 'error');
      return;
    }
    if (!user) return;
    setSavingKeys(true);
    try {
      const updatedUserKeys = { ...userApiKeys, gemini_api_key: tempGeminiKey, pexels_api_key: tempPexelsKey };
      await setDoc(doc(db, 'users', user.uid), {
        api_keys_json: JSON.stringify(updatedUserKeys)
      }, { merge: true });
      showToast('API Keys saved securely to your account!');
    } catch (e: any) {
      showToast('Error saving keys: ' + e.message, 'error');
    } finally {
      setSavingKeys(false);
    }
  };

  // Check for missed schedule
  const hasMissedSchedule = schedule && schedule.next_run && new Date(schedule.next_run) < new Date();

  const totalViews = logs.reduce((acc, l) => acc + (l.instagram_views || 0) + (l.youtube_views || 0) + (l.tiktok_views || 0), 0);
  const reviewCount = logs.filter(l => l.status === 'Ready for Review').length;

  if (authLoading || !user) {
    return <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center text-emerald-600"><Activity className="animate-pulse" size={48} /></div>;
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 p-8 font-sans selection:bg-emerald-500/30">
      <div className="fixed top-[-10%] left-[-10%] w-96 h-96 bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-8">

        {/* Header */}
        <header className="flex justify-between items-end border-b border-black/10 dark:border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-light tracking-tight text-neutral-900 dark:text-white mb-2 flex items-center gap-3">
              <Activity className="text-emerald-600" />
              Nexus Media Vortex
            </h1>
            <p className="text-neutral-500 text-sm">Autonomous Content Distribution Network</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Channel Switcher */}
            <div className="flex items-center gap-2 px-4 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl">
              <span className="text-xs text-neutral-500 font-mono">CHANNEL:</span>
              <select
                value={channel}
                onChange={e => {
                  setLogs([]);
                  setLoading(true);
                  setExpandedRow(null);
                  setChannel(e.target.value);
                }}
                className="bg-transparent text-emerald-600 font-semibold text-sm outline-none border-none focus:ring-0 cursor-pointer"
              >
                {loading ? <option value="">Loading...</option> :
                  channels.length === 0 ? <option value="">No Channels</option> :
                    channels.map(c => (
                      <option key={c.channel_key} value={c.channel_key} className="bg-neutral-100 dark:bg-[#0a0a0a]">{c.name}</option>
                    ))}
              </select>

              {channel && (
                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded tracking-wider ${
                  pipelineMode === 'manual_review'
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'bg-emerald-500/10 text-emerald-500'
                }`}>
                  {pipelineMode === 'manual_review' ? 'Review' : 'Autonomous'}
                </span>
              )}

              <Link href="/channels/new" title="New Channel" className="ml-1 text-neutral-400 hover:text-emerald-600 transition-colors">
                <Plus size={14} />
              </Link>
              {channel && (
                <Link href={`/channels/settings?id=${channel}`} title="Channel Settings" className="text-neutral-400 hover:text-blue-500 transition-colors">
                  <Settings size={14} />
                </Link>
              )}
            </div>

            <EngineStatusBadge />
            <ThemeToggle />
            <button onClick={signOut} className="p-2 text-neutral-400 hover:text-red-400 transition-colors" title="Sign Out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Instant Generation Input Bar (Socket.IO + Firestore Flow) */}
        <InstantGenerationBar
          channels={channels}
          currentChannel={channel}
          onChannelChange={setChannel}
          userId={user?.uid}
          geminiKey={geminiKey}
          pexelsKey={pexelsKey}
          onSuccessToast={(msg) => showToast(msg, 'success')}
          onErrorToast={(msg) => showToast(msg, 'error')}
        />

        {/* Missed Schedule Alert */}
        {hasMissedSchedule && (
          <MissedScheduleBanner
            schedule={schedule}
            channel={channel}
            onGenerate={handleMissedScheduleGenerate}
          />
        )}

        {/* Review pending badge */}
        {reviewCount > 0 && (
          <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
            <Eye size={18} className="flex-shrink-0" />
            <p className="text-sm">
              <strong>{reviewCount}</strong> {reviewCount === 1 ? 'item' : 'items'} ready for your review below.
            </p>
          </div>
        )}

        {/* Action Panel */}
        <div className="grid grid-cols-2 gap-4">
          {/* Generation Panel */}
          <div className="bg-white dark:bg-[#111111] border border-black/5 dark:border-white/5 p-6 rounded-2xl shadow-xl flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 border-b border-black/5 dark:border-white/5 pb-2 flex items-center gap-2">
              <Terminal size={14} /> Manual Generation
            </h2>

            <p className="text-xs text-neutral-500">
              Nexus will autonomously determine what to generate based on your Channel Configuration settings.
            </p>
            <div className="flex flex-col gap-2 mt-auto">
              <button
                onClick={() => setShowGenerateModal(true)}
                disabled={generating || triggering}
                className="w-full py-3 rounded-lg font-bold tracking-wider text-sm flex items-center justify-center gap-2 bg-emerald-500 text-black hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] disabled:opacity-50"
              >
                <Zap size={16} />
                {generating || triggering ? 'Executing...' : 'Execute Channel Strategy'}
              </button>
            </div>
          </div>

          {/* Schedule Panel */}
          <div className="bg-white dark:bg-[#111111] border border-black/5 dark:border-white/5 p-6 rounded-2xl shadow-xl flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 border-b border-black/5 dark:border-white/5 pb-2 flex items-center gap-2">
              <Calendar size={14} /> Scheduling Network
            </h2>
            <p className="text-xs text-neutral-500">
              Auto-generate <strong>all active content types</strong> daily. Runs via daemon when your PC is on.
              {hasMissedSchedule && <span className="text-amber-400 ml-1">(Last run missed)</span>}
            </p>

            <div className="flex gap-3">
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                className="flex-1 bg-white dark:bg-[#111111] border border-black/10 dark:border-white/10 text-neutral-900 dark:text-white rounded-lg p-2 text-sm"
              />
            </div>

            {schedule && (
              <div className="flex items-center gap-2 text-xs text-neutral-400 bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
                <Clock size={12} />
                Next: {schedule.next_run
                  ? new Date(schedule.next_run).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : 'Not set'}
                {hasMissedSchedule && <span className="ml-auto text-amber-400 font-semibold">MISSED</span>}
              </div>
            )}

            <button
              onClick={scheduleEngine}
              className="w-full py-3 rounded-lg font-bold tracking-wider text-sm bg-purple-500/10 text-purple-400 border border-purple-500/50 hover:bg-purple-500/20 transition-all flex items-center justify-center gap-2 mt-auto"
            >
              <Calendar size={16} /> Schedule Task
            </button>
          </div>
        </div>

        {/* Empty state */}
        {!loading && channels.length === 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-12 text-center flex flex-col items-center gap-4">
            <Bot size={48} className="text-emerald-500" />
            <h2 className="text-2xl font-bold">Welcome to Nexus Media Vortex</h2>
            <p className="text-neutral-500 max-w-md">No channels yet. Build your first AI-optimized channel strategy.</p>
            <Link href="/channels/new" className="mt-4 px-8 py-4 bg-emerald-500 text-black font-bold rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:bg-emerald-400 transition-all flex items-center gap-2">
              <Plus size={20} /> Open Strategy Builder
            </Link>
          </div>
        )}

        {/* Pipeline History */}
        <div className={`${channels.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-mono tracking-widest text-neutral-500 flex items-center gap-2">
              <Database size={14} className="text-blue-400" /> PIPELINE HISTORY
              {reviewCount > 0 && (
                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-bold">{reviewCount} TO REVIEW</span>
              )}
            </h2>
            <div className="flex items-center gap-4">
              {brainState?.next_analysis_timestamp && (
                <span className="text-[10px] text-blue-500 font-mono">
                  Next Scan: {new Date(brainState.next_analysis_timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
                </span>
              )}
              <button
                onClick={syncAnalytics}
                disabled={isSyncing}
                className={`text-xs font-mono tracking-widest flex items-center gap-1 transition-colors ${isSyncing ? 'text-neutral-400 cursor-not-allowed' : 'text-blue-500 hover:text-blue-400'}`}
              >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} /> SYNC
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#111111] border border-black/5 dark:border-white/5 rounded-2xl shadow-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] text-xs font-mono tracking-wider text-neutral-500 uppercase">
                  <th className="p-4 font-medium">Content / Topic</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium text-center">IG</th>
                  <th className="p-4 font-medium text-center">YT</th>
                  <th className="p-4 font-medium text-center">TK</th>
                  <th className="p-4 font-medium text-right">Created</th>
                  <th className="p-4 font-medium"></th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-neutral-500 font-mono text-xs">
                      {loading ? 'Loading pipeline...' : 'No content generated yet. Use the generation panel above to start.'}
                    </td>
                  </tr>
                ) : (
                  logs.map((log: any) => {
                    const isReview = log.status === 'Ready for Review';
                    const isExpanded = expandedRow === log.id;

                    return (
                      <>
                        <tr
                          key={log.id}
                          className={`border-b border-black/5 dark:border-white/5 transition-colors ${
                            isReview
                              ? 'bg-blue-500/[0.03] hover:bg-blue-500/[0.05]'
                              : 'hover:bg-black/[0.01] dark:hover:bg-white/[0.01]'
                          }`}
                        >
                          <td className="p-4 font-medium text-neutral-900 dark:text-neutral-200">
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 bg-black/5 dark:bg-white/10 rounded text-neutral-500 uppercase tracking-wider">
                                {log.content_type || 'video'}
                              </span>
                              {log.topic}
                              {log.generated_by === 'frontend' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">BROWSER</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`text-xs px-2 py-1 rounded font-mono ${
                              log.status === 'TK_AUTH_SUSPENDED' ? 'bg-red-600 text-white font-bold animate-pulse' :
                              log.status === 'Ready for Review' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                              log.status?.toLowerCase().includes('fail') ? 'bg-red-500/10 text-red-600' :
                              log.status === 'Uploaded' || log.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-600' :
                              'bg-amber-500/10 text-amber-500'
                            }`}>
                              {log.status === 'TK_AUTH_SUSPENDED' ? '⚠️ TK COOKIES' : (log.status || 'Processing...')}
                            </span>
                            {log.status?.toLowerCase().includes('fail') && log.error && (
                              <p className="text-[10px] text-red-500/80 mt-1.5 leading-tight">{log.error}</p>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            {log.uploaded_ig
                              ? <div className="flex flex-col items-center gap-0.5"><CheckCircle size={13} className="text-emerald-500" /><span className="text-[9px] font-mono text-neutral-500">{(log.instagram_views || 0).toLocaleString()}</span></div>
                              : <X size={13} className="text-neutral-300 dark:text-neutral-700 mx-auto" />}
                          </td>
                          <td className="p-4 text-center">
                            {log.uploaded_yt
                              ? <div className="flex flex-col items-center gap-0.5"><CheckCircle size={13} className="text-emerald-500" /><span className="text-[9px] font-mono text-neutral-500">{(log.youtube_views || 0).toLocaleString()}</span></div>
                              : <X size={13} className="text-neutral-300 dark:text-neutral-700 mx-auto" />}
                          </td>
                          <td className="p-4 text-center">
                            {log.uploaded_tk
                              ? <div className="flex flex-col items-center gap-0.5"><CheckCircle size={13} className="text-emerald-500" /><span className="text-[9px] font-mono text-neutral-500">{(log.tiktok_views || 0).toLocaleString()}</span></div>
                              : <X size={13} className="text-neutral-300 dark:text-neutral-700 mx-auto" />}
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-xs text-neutral-400 font-mono hidden md:inline" suppressHydrationWarning>
                              {log.created_at ? (() => { try { return typeof log.created_at.toDate === 'function' ? log.created_at.toDate().toLocaleString() : new Date(log.created_at).toLocaleString(); } catch { return 'N/A'; } })() : 'N/A'}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2 justify-end">
                              {/* Review expand */}
                              {(isReview || log.generated_content || log.generated_caption) && (
                                <button
                                  onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                                  className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                  title={isExpanded ? 'Collapse' : 'Review & Publish'}
                                >
                                  {isExpanded ? <ChevronUp size={14} /> : <Eye size={14} />}
                                </button>
                              )}
                              {/* Retry generation */}
                              {log.status?.toLowerCase().includes('fail') && (
                                <button
                                  onClick={() => retryLog(log.topic, 'generate')}
                                  disabled={retryingTopic === log.topic}
                                  title="Retry Generation"
                                  className="p-1.5 bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 rounded disabled:opacity-50 transition-colors"
                                >
                                  <Play size={13} />
                                </button>
                              )}
                              {/* Retry upload */}
                              {(() => {
                                const s = log.status || '';
                                const inProgress = ['Initializing', 'Drafting', 'Generating', 'Downloading', 'Rendering', 'Uploading', 'Processing'].some(k => s.toLowerCase().includes(k.toLowerCase()));
                                return !s.toLowerCase().includes('fail') && !inProgress && s !== 'Ready for Review' && (!log.uploaded_ig || !log.uploaded_yt || !log.uploaded_tk);
                              })() && (
                                <button
                                  onClick={() => retryLog(log.topic, 'upload')}
                                  disabled={retryingTopic === log.topic}
                                  title="Retry Uploads"
                                  className="p-1.5 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 rounded disabled:opacity-50 transition-colors"
                                >
                                  <Play size={13} />
                                </button>
                              )}
                              {/* Delete */}
                              <button
                                onClick={() => deleteLog(log.topic)}
                                title="Delete"
                                className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                              >
                                <Trash size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Review Panel */}
                        {isExpanded && (
                          <tr key={`${log.id}-review`} className="border-b border-black/5 dark:border-white/5">
                            <td colSpan={7} className="p-0">
                              <ContentReviewPanel
                                log={log}
                                channelConfig={currentChannelObj}
                                user={user}
                                channel={channel}
                                onMarkPublished={markPublished}
                                onRetry={(topic) => retryLog(topic, 'generate')}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Total views mini-stats */}
        {logs.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'IG Views', value: logs.reduce((a, l) => a + (l.instagram_views || 0), 0), color: 'pink' },
              { label: 'YT Views', value: logs.reduce((a, l) => a + (l.youtube_views || 0), 0), color: 'red' },
              { label: 'TK Views', value: logs.reduce((a, l) => a + (l.tiktok_views || 0), 0), color: 'neutral' },
            ].map(stat => (
              <div key={stat.label} className="bg-white dark:bg-[#111111] border border-black/5 dark:border-white/5 rounded-xl px-4 py-3 text-center shadow">
                <div className="text-xs text-neutral-400 font-mono uppercase">{stat.label}</div>
                <div className="text-xl font-bold text-neutral-900 dark:text-white mt-1">{stat.value.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111111] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap size={18} className="text-emerald-500" />
                {missedScheduleId ? 'Generate Missed Content' : 'Generate Now'}
              </h2>
              <button onClick={() => { setShowGenerateModal(false); setMissedScheduleId(null); setGenerateExtraHint(''); }} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
                <X size={20} />
              </button>
            </div>

            {missedScheduleId && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 leading-relaxed">
                ⚠️ Your daemon was offline and missed a scheduled generation. You can run it now directly from the browser (for text/image) or queue it for when your server comes back online (for video).
              </div>
            )}

            {/* Generation Summary */}
            <div className="bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-black/10 dark:border-white/10">
              <label className="block text-xs uppercase text-neutral-500 mb-2 font-bold tracking-wider">Strategy Execution</label>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Nexus will generate the following enabled types for <strong className="text-emerald-500">{channel}</strong>:
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {(enabledTypes || []).map(ct => (
                  <span key={ct} className="px-2 py-1 bg-black/10 dark:bg-white/10 rounded-lg text-xs font-mono tracking-wider font-bold uppercase">
                    {ct}
                  </span>
                ))}
              </div>
            </div>

            {/* Extra hint / emergency prompt */}
            <div>
              <label className="block text-xs uppercase text-neutral-500 mb-2 font-bold tracking-wider">
                Additional Direction <span className="text-neutral-400 normal-case font-normal">(optional — extra creative guidance)</span>
              </label>
              <textarea
                value={generateExtraHint}
                onChange={e => setGenerateExtraHint(e.target.value)}
                placeholder="e.g. Focus on trending AI news from last 24 hours, make it more controversial than usual..."
                rows={3}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 resize-none placeholder-neutral-400"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowGenerateModal(false); setMissedScheduleId(null); setGenerateExtraHint(''); }}
                className="flex-1 py-3 rounded-lg text-sm font-medium text-neutral-500 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeChannelStrategy(missedScheduleId || undefined)}
                disabled={generating || triggering}
                className="flex-1 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50"
              >
                {generating || triggering ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                {generating || triggering ? 'Executing...' : 'Run Everything Now'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* API Keys Missing Modal */}
      {hasMissingKeys && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111111] border border-red-500/30 rounded-2xl p-6 shadow-2xl w-full max-w-md flex flex-col gap-4 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3 text-red-500 border-b border-red-500/20 pb-4">
              <Settings size={24} />
              <h2 className="text-lg font-bold">API Keys Required</h2>
            </div>
            
            <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Your channel is missing required API keys. Nexus cannot generate content or operate autonomously without them.
            </p>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="block text-xs uppercase text-neutral-500 font-bold tracking-wider">Gemini API Key</label>
                <input
                  type="password"
                  value={tempGeminiKey}
                  onChange={e => setTempGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs uppercase text-neutral-500 font-bold tracking-wider">Pexels API Key</label>
                <input
                  type="password"
                  value={tempPexelsKey}
                  onChange={e => setTempPexelsKey(e.target.value)}
                  placeholder="563492ad6f..."
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-500/50"
                />
              </div>
            </div>

            <button
              onClick={saveApiKeys}
              disabled={savingKeys || !tempGeminiKey || !tempPexelsKey}
              className="w-full py-3 rounded-lg text-sm font-bold bg-red-500 text-white hover:bg-red-400 disabled:opacity-50 transition-colors mt-2 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            >
              {savingKeys ? 'Saving Securely...' : 'Save Keys & Unlock'}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${toastMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
        <div className={`px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 ${toastType === 'error' ? 'bg-red-900 text-red-100' : 'bg-neutral-900 dark:bg-white text-white dark:text-black'}`}>
          {toastType === 'error' ? <AlertTriangle size={16} className="text-red-400" /> : <CheckCircle size={16} className="text-emerald-500" />}
          <p className="font-medium text-sm">{toastMessage}</p>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <SocketProvider>
      <DashboardContent />
    </SocketProvider>
  );
}
