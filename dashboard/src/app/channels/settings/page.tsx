"use client";
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Settings, Save, ArrowLeft, Loader2, ToggleLeft, ToggleRight,
  Camera, Video, MessageCircle, Globe, Zap, Eye, CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

const CONTENT_TYPES = [
  { value: 'short', label: 'Shorts' },
  { value: 'video', label: 'Long Video' },
  { value: 'image', label: 'Image' },
  { value: 'post', label: 'Text Post' },
];

const PLATFORMS = [
  {
    key: 'ig',
    label: 'Instagram',
    icon: Camera,
    color: 'pink',
    accentClass: 'focus:border-pink-500/50',
    iconClass: 'text-pink-500',
    defaultTypes: ['short', 'image'],
    fields: [
      { key: 'ig_username', label: 'Username', type: 'text' },
      { key: 'ig_password', label: 'Password', type: 'password' },
    ],
    note: null,
  },
  {
    key: 'yt',
    label: 'YouTube',
    icon: Video,
    color: 'red',
    accentClass: 'focus:border-red-500/50',
    iconClass: 'text-red-500',
    defaultTypes: ['short', 'video'],
    fields: [],
    note: 'YouTube requires secure OAuth 2.0. Drop your client_secrets.json into the channels/{id}/ folder on your Daemon machine to authenticate.',
  },
  {
    key: 'tk',
    label: 'TikTok',
    icon: null,
    color: 'neutral',
    accentClass: 'focus:border-neutral-500/50',
    iconClass: 'text-neutral-400',
    defaultTypes: ['short'],
    fields: [
      { key: 'tk_username', label: 'Username', type: 'text' },
    ],
    note: 'TikTok session cookies are managed via the Daemon folder. ⚠️ High ban risk — use Manual Review mode.',
  },
  {
    key: 'fb',
    label: 'Facebook',
    icon: Globe,
    color: 'blue',
    accentClass: 'focus:border-blue-500/50',
    iconClass: 'text-blue-500',
    defaultTypes: ['short', 'post'],
    fields: [
      { key: 'fb_username', label: 'Username / Email', type: 'text' },
      { key: 'fb_password', label: 'Password', type: 'password' },
    ],
    note: null,
  },
  {
    key: 'x',
    label: 'X (Twitter)',
    icon: MessageCircle,
    color: 'sky',
    accentClass: 'focus:border-sky-400/50',
    iconClass: 'text-sky-400',
    defaultTypes: ['post'],
    fields: [
      { key: 'x_username', label: 'Username', type: 'text' },
    ],
    note: null,
  },
];

function PlatformCard({ platform, config, updateConfig }: {
  platform: typeof PLATFORMS[0];
  config: any;
  updateConfig: (key: string, value: any) => void;
}) {
  const Icon = platform.icon;
  const pauseKey = `pause_${platform.key}`;
  const typesKey = `${platform.key}_content_types`;
  const currentTypes: string[] = config[typesKey] || platform.defaultTypes;

  const toggleType = (type: string) => {
    const updated = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];
    updateConfig(typesKey, updated);
  };

  const colorMap: Record<string, string> = {
    pink: 'border-pink-500/20 bg-pink-500/5',
    red: 'border-red-500/20 bg-red-500/5',
    neutral: 'border-neutral-500/20 bg-neutral-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
    sky: 'border-sky-400/20 bg-sky-400/5',
  };

  const badgeActiveMap: Record<string, string> = {
    pink: 'bg-pink-500/20 text-pink-400 border-pink-500/40',
    red: 'bg-red-500/20 text-red-400 border-red-500/40',
    neutral: 'bg-neutral-400/20 text-neutral-300 border-neutral-500/40',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    sky: 'bg-sky-400/20 text-sky-300 border-sky-400/40',
  };

  return (
    <div className={`bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl`}>
      <h2 className="text-base font-semibold mb-5 flex items-center gap-2">
        {Icon ? <Icon size={18} className={platform.iconClass} /> : (
          <span className="font-black text-sm text-black dark:text-white">TK</span>
        )}
        {platform.label}
        {(platform.key === 'tk' || platform.key === 'fb') && (
          <span className="ml-auto text-[10px] px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full font-bold uppercase">⚠️ Risk</span>
        )}
      </h2>

      <div className="space-y-4">
        {/* Credentials */}
        {platform.fields.map(field => (
          <div key={field.key}>
            <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">{field.label}</label>
            <input
              type={field.type}
              value={config[field.key] || ''}
              onChange={e => updateConfig(field.key, e.target.value)}
              className={`w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none ${platform.accentClass} transition-colors`}
            />
          </div>
        ))}

        {/* Note */}
        {platform.note && (
          <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-neutral-500 dark:text-neutral-400 text-xs leading-relaxed">
            {platform.note}
          </div>
        )}

        {/* Content Types */}
        <div className="pt-3 border-t border-black/5 dark:border-white/5">
          <label className="block text-xs uppercase text-neutral-500 mb-2 font-bold tracking-wider">Content Types</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(ct => {
              const active = currentTypes.includes(ct.value);
              return (
                <button
                  key={ct.value}
                  onClick={() => toggleType(ct.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    active
                      ? badgeActiveMap[platform.color]
                      : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-black/10 dark:border-white/10 hover:border-neutral-400/40'
                  }`}
                >
                  {active && <CheckCircle2 size={10} className="inline mr-1" />}
                  {ct.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pause Toggle */}
        <div className="flex items-center justify-between pt-3 border-t border-black/5 dark:border-white/5">
          <div>
            <span className="text-sm font-medium">Pause Uploads</span>
            <p className="text-xs text-neutral-500">Temporarily stop auto-publishing to this platform</p>
          </div>
          <button
            onClick={() => updateConfig(pauseKey, !config[pauseKey])}
            className={`transition-colors ${config[pauseKey] ? 'text-red-500' : 'text-green-500'}`}
          >
            {config[pauseKey] ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [saved, setSaved] = useState(false);

  const [config, setConfig] = useState<any>({
    ig_username: '',
    ig_password: '',
    fb_username: '',
    fb_password: '',
    tk_username: '',
    x_username: '',
    pause_yt: false,
    pause_ig: false,
    pause_tk: false,
    pause_fb: false,
    pause_x: false,
    ig_content_types: ['short', 'image'],
    yt_content_types: ['short', 'video'],
    tk_content_types: ['short'],
    fb_content_types: ['short', 'post'],
    x_content_types: ['post'],
    pipeline_mode: 'autonomous',
    gemini_api_key: '',
    pexels_api_key: '',
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/'); return; }

    const fetchChannel = async () => {
      try {
        if (!id) return;
        const docRef = doc(db, 'channels', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setChannelName(data.name || id);
          if (data.api_keys_json) {
            try {
              const parsed = JSON.parse(data.api_keys_json);
              setConfig((prev: any) => ({ ...prev, ...parsed }));
            } catch (e) {
              console.error('Failed to parse api_keys_json');
            }
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchChannel();
  }, [user, authLoading, id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!id) return;
      await updateDoc(doc(db, 'channels', id), {
        api_keys_json: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert('Error saving settings: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  if (loading || authLoading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="animate-spin text-purple-500" size={32} />
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 font-sans selection:bg-purple-500/30">
      {/* Background glows */}
      <div className="fixed top-[-10%] right-[-10%] w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-8 py-8 relative z-10 space-y-8">

        {/* Header */}
        <header className="flex justify-between items-center border-b border-black/10 dark:border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 text-neutral-500 mb-2">
              <Link href="/" className="hover:text-purple-500 flex items-center gap-1 text-sm transition-colors">
                <ArrowLeft size={14} /> Dashboard
              </Link>
            </div>
            <h1 className="text-3xl font-light tracking-tight text-neutral-900 dark:text-white flex items-center gap-3">
              <Settings className="text-purple-600" size={28} />
              Channel Settings
            </h1>
            <p className="text-neutral-500 mt-1 text-sm">
              Configuring: <strong className="text-purple-500">{channelName}</strong>
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 shadow-lg ${
              saved
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/40 shadow-emerald-500/10'
                : 'bg-purple-500/10 text-purple-500 border border-purple-500/30 hover:bg-purple-500/20 hover:shadow-purple-500/20'
            }`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Configuration'}
          </button>
        </header>

        {/* Pipeline Mode */}
        <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl">
          <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
            <Zap size={18} className="text-amber-400" />
            Pipeline Mode
          </h2>
          <p className="text-xs text-neutral-500 mb-5">
            Controls whether content is published automatically or held for your review.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Autonomous */}
            <button
              onClick={() => updateConfig('pipeline_mode', 'autonomous')}
              className={`p-4 rounded-xl border text-left transition-all ${
                config.pipeline_mode === 'autonomous'
                  ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                  : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-neutral-400/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className={config.pipeline_mode === 'autonomous' ? 'text-emerald-500' : 'text-neutral-400'} />
                <span className={`text-sm font-semibold ${config.pipeline_mode === 'autonomous' ? 'text-emerald-500' : 'text-neutral-600 dark:text-neutral-300'}`}>
                  Autonomous
                </span>
                {config.pipeline_mode === 'autonomous' && (
                  <CheckCircle2 size={14} className="ml-auto text-emerald-500" />
                )}
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Generate and publish automatically. Fully hands-off. Content goes live as soon as the daemon completes generation.
              </p>
            </button>

            {/* Manual Review */}
            <button
              onClick={() => updateConfig('pipeline_mode', 'manual_review')}
              className={`p-4 rounded-xl border text-left transition-all ${
                config.pipeline_mode === 'manual_review'
                  ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                  : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-neutral-400/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Eye size={16} className={config.pipeline_mode === 'manual_review' ? 'text-blue-400' : 'text-neutral-400'} />
                <span className={`text-sm font-semibold ${config.pipeline_mode === 'manual_review' ? 'text-blue-400' : 'text-neutral-600 dark:text-neutral-300'}`}>
                  Manual Review
                </span>
                {config.pipeline_mode === 'manual_review' && (
                  <CheckCircle2 size={14} className="ml-auto text-blue-400" />
                )}
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Generate content, then present in dashboard for your review before publishing. You decide when and where to post.
              </p>
            </button>
          </div>

          {config.pipeline_mode === 'manual_review' && (
            <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-400 leading-relaxed">
              ℹ️ In Manual Review mode, the daemon will generate and render video but will NOT upload. Content will appear in the Pipeline History with copy/publish controls for each platform.
            </div>
          )}
        </div>

        {/* API Keys */}
        <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl">
          <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
            <Settings size={18} className="text-emerald-500" />
            API Integrations & Keys
          </h2>
          <p className="text-xs text-neutral-500 mb-5">
            Nexus requires third-party API keys to operate automatically in the background. Your keys are securely stored in your isolated database.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gemini API Key */}
            <div className="space-y-2">
              <label className="block text-xs uppercase text-neutral-500 font-bold tracking-wider">Gemini API Key</label>
              <input
                type="password"
                value={config.gemini_api_key || ''}
                onChange={e => updateConfig('gemini_api_key', e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Nexus Usage Tracker</span>
                <div className="text-right">
                  <p className="text-[10px] text-neutral-500">Free Tier Limit</p>
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">15 RPM / 1M TPM</p>
                </div>
              </div>
            </div>

            {/* Pexels API Key */}
            <div className="space-y-2">
              <label className="block text-xs uppercase text-neutral-500 font-bold tracking-wider">Pexels API Key</label>
              <input
                type="password"
                value={config.pexels_api_key || ''}
                onChange={e => updateConfig('pexels_api_key', e.target.value)}
                placeholder="563492ad6f91700001000001..."
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Nexus Usage Tracker</span>
                <div className="text-right">
                  <p className="text-[10px] text-neutral-500">Free Tier Limit</p>
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">200 / hour</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Platform Cards */}
        <div>
          <h2 className="text-xs font-mono tracking-widest text-neutral-500 uppercase mb-4">Platform Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PLATFORMS.map(platform => (
              <PlatformCard
                key={platform.key}
                platform={platform}
                config={config}
                updateConfig={updateConfig}
              />
            ))}
          </div>
        </div>

        {/* Save Footer */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-8 py-4 rounded-xl font-semibold transition-all duration-300 shadow-xl ${
              saved
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/40'
                : 'bg-purple-500 text-white hover:bg-purple-400 shadow-purple-500/30 hover:shadow-purple-500/50'
            }`}
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : saved ? <CheckCircle2 size={18} /> : <Save size={18} />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChannelSettings() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-purple-500" size={32} />
      </div>
    }>
      <SettingsComponent />
    </Suspense>
  );
}
