"use client";
import React, { useState, useEffect, Suspense, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Settings, Save, ArrowLeft, Loader2, ToggleLeft, ToggleRight,
  Camera, Video, MessageCircle, Globe, Zap, Eye, CheckCircle2,
  Bot, Sparkles, Send, RefreshCw, MessageSquare, ChevronDown, ChevronUp, Layers
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';

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

  return (
    <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl">
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

        {platform.note && (
          <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-neutral-500 dark:text-neutral-400 text-xs leading-relaxed">
            {platform.note}
          </div>
        )}

        <div>
          <label className="block text-xs uppercase text-neutral-500 mb-2 font-bold tracking-wider">Enabled Content Types</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(type => {
              const active = currentTypes.includes(type.value);
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => toggleType(type.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    active
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/40 shadow-sm'
                      : 'bg-black/5 dark:bg-white/5 text-neutral-500 border-black/10 dark:border-white/10 hover:border-neutral-400/30'
                  }`}
                >
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
          <span className="text-xs text-neutral-500">Auto-Publish Status</span>
          <button
            type="button"
            onClick={() => updateConfig(pauseKey, !config[pauseKey])}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
              config[pauseKey]
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
            }`}
          >
            {config[pauseKey] ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
            {config[pauseKey] ? 'Paused' : 'Active'}
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
  const [saved, setSaved] = useState(false);
  const [channelName, setChannelName] = useState('');

  const [config, setConfig] = useState<any>({
    gemini_api_key: '',
    pexels_api_key: '',
    pipeline_mode: 'autonomous',
    ig_username: '',
    ig_password: '',
    pause_ig: false,
    yt_client_secret_path: '',
    pause_yt: false,
    tk_username: '',
    pause_tk: false,
    fb_username: '',
    fb_password: '',
    pause_fb: false,
    x_username: '',
    pause_x: false,
  });

  // Strategy Core Data
  const [strategyData, setStrategyData] = useState<any>({
    name: '',
    niche: '',
    target_audience: '',
    objective_node: '',
    topic_prompt: '',
    script_prompt: '',
    visual_prompt: '',
    metadata_prompt: '',
    cta_template: '',
    hashtags_template: '',
  });

  // AI Strategy Copilot State
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const copilotEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (copilotOpen) {
      copilotEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [copilotMessages, copilotOpen]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchChannel = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        let userKeys: any = {};
        if (userDoc.exists() && userDoc.data().api_keys_json) {
          try {
            userKeys = JSON.parse(userDoc.data().api_keys_json);
          } catch (e) {
            console.error('Failed to parse user api_keys_json');
          }
        }

        if (!id) return;
        const docRef = doc(db, 'channels', id);
        const docSnap = await getDoc(docRef);
        let channelConfigObj: any = {};
        if (docSnap.exists()) {
          const data = docSnap.data();
          setChannelName(data.name || id);
          setStrategyData({
            name: data.name || '',
            niche: data.niche || '',
            target_audience: data.target_audience || '',
            objective_node: data.objective_node || '',
            topic_prompt: data.topic_prompt || '',
            script_prompt: data.script_prompt || '',
            visual_prompt: data.visual_prompt || '',
            metadata_prompt: data.metadata_prompt || '',
            cta_template: data.cta_template || '',
            hashtags_template: data.hashtags_template || '',
          });

          // Set initial greeting in Copilot
          setCopilotMessages([
            {
              role: 'model',
              content: `Hello! I am your AI Strategy Copilot for **${data.name || id}**. How would you like to refine your strategy today? (e.g. *"Adjust hooks to focus on fast fiber speed discounts in Bengali"* or *"Target B2B office managers with higher package tiers"*).`
            }
          ]);

          if (data.api_keys_json) {
            try {
              channelConfigObj = JSON.parse(data.api_keys_json);
            } catch (e) {
              console.error('Failed to parse channel api_keys_json');
            }
          }
        }

        setConfig((prev: any) => ({
          ...prev,
          ...channelConfigObj,
          gemini_api_key: userKeys.gemini_api_key || channelConfigObj.gemini_api_key || '',
          pexels_api_key: userKeys.pexels_api_key || channelConfigObj.pexels_api_key || '',
        }));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchChannel();
  }, [user, authLoading, id, router]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!user || !id) {
        alert("User or Channel not found");
        return;
      }

      // 1. Save user-level API keys to users/{uid}
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      let existingUserKeys: any = {};
      if (userDocSnap.exists() && userDocSnap.data().api_keys_json) {
        try {
          existingUserKeys = JSON.parse(userDocSnap.data().api_keys_json);
        } catch { }
      }
      const updatedUserKeys = {
        ...existingUserKeys,
        gemini_api_key: config.gemini_api_key || '',
        pexels_api_key: config.pexels_api_key || '',
      };
      await setDoc(userDocRef, {
        api_keys_json: JSON.stringify(updatedUserKeys)
      }, { merge: true });

      // 2. Save channel settings and strategy fields to channels/{id}
      await updateDoc(doc(db, 'channels', id), {
        ...strategyData,
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

  const updateStrategyField = (key: string, value: string) => {
    setStrategyData((prev: any) => ({ ...prev, [key]: value }));
  };

  // Conversational Strategy Copilot Handler
  const handleCopilotSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!copilotInput.trim() || copilotLoading) return;

    const userText = copilotInput.trim();
    const updatedMessages = [...copilotMessages, { role: 'user' as const, content: userText }];
    setCopilotMessages(updatedMessages);
    setCopilotInput('');
    setCopilotLoading(true);

    try {
      const apiKey = config.gemini_api_key;
      if (!apiKey) {
        throw new Error("Please enter your Gemini API Key in the API Keys section above.");
      }

      const copilotSystemPrompt = `
You are an expert AI Media & Channel Strategist.
You are assisting the user in refining the live strategy for channel: '${strategyData.name}'.

CURRENT CHANNEL STRATEGY:
${JSON.stringify(strategyData, null, 2)}

INSTRUCTIONS:
1. Discuss strategy, hooks, language, pacing, and marketing objectives with the user.
2. If the user asks to modify, pivot, or adjust the strategy, formulate the updated strategy fields.
3. At the end of your conversational response, include a JSON block with the updated fields enclosed in \`\`\`json ... \`\`\` so the UI can auto-apply them.
Allowed JSON keys: niche, target_audience, objective_node, topic_prompt, script_prompt, visual_prompt, metadata_prompt, cta_template, hashtags_template.
`;

      const ai = new GoogleGenAI({ apiKey });
      const formatted = updatedMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: formatted,
        config: {
          systemInstruction: copilotSystemPrompt,
          temperature: 0.7,
        }
      });

      const replyText = response.text || '';
      
      // Check for JSON update block
      const jsonMatch = replyText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          setStrategyData((prev: any) => ({
            ...prev,
            ...parsed,
          }));
        } catch (err) {
          console.warn("Could not auto-apply copilot JSON:", err);
        }
      }

      setCopilotMessages([...updatedMessages, { role: 'model', content: replyText }]);
    } catch (err: any) {
      setCopilotMessages([
        ...updatedMessages,
        { role: 'model', content: `⚠️ Error: ${err.message || 'Failed to generate copilot response'}` }
      ]);
    } finally {
      setCopilotLoading(false);
    }
  };

  if (loading || authLoading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="animate-spin text-purple-500" size={32} />
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 font-sans selection:bg-purple-500/30">
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
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 shadow-lg ${saved
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/40 shadow-emerald-500/10'
                : 'bg-purple-500 text-white hover:bg-purple-400 shadow-purple-500/30 hover:shadow-purple-500/50'
              }`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Configuration'}
          </button>
        </header>

        {/* AI Strategy Copilot (Conversational Strategy Modifier) */}
        <div className="bg-gradient-to-r from-purple-950/20 via-neutral-900/60 to-indigo-950/20 border border-purple-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Bot size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
                  AI Strategy Copilot
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase font-mono">
                    Conversational Refinement
                  </span>
                </h2>
                <p className="text-xs text-neutral-400">
                  Chat with the Strategy Brain to pivot hooks, adjust regional language, or target new offerings.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCopilotOpen(!copilotOpen)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition-colors"
            >
              <Sparkles size={13} />
              {copilotOpen ? 'Hide Copilot Chat' : 'Open Strategy Chat'}
              {copilotOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Copilot Chat Window */}
          {copilotOpen && (
            <div className="pt-4 border-t border-purple-500/20 space-y-3 animate-in fade-in duration-300">
              <div className="h-64 overflow-y-auto bg-black/40 rounded-xl p-4 space-y-3 font-sans text-xs">
                {copilotMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {m.role === 'model' && (
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center flex-shrink-0 border border-purple-500/30">
                        <Bot size={12} />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-xl p-3 leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-purple-600 text-white rounded-tr-sm'
                          : 'bg-white/5 border border-white/10 text-neutral-200 rounded-tl-sm'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {copilotLoading && (
                  <div className="flex gap-2 items-center text-xs text-purple-400 animate-pulse">
                    <Loader2 size={13} className="animate-spin" />
                    <span>Analyzing strategy & formulating prompt pivots...</span>
                  </div>
                )}
                <div ref={copilotEndRef} />
              </div>

              <form onSubmit={handleCopilotSend} className="flex gap-2">
                <input
                  type="text"
                  value={copilotInput}
                  onChange={(e) => setCopilotInput(e.target.value)}
                  placeholder="Tell Copilot what to change (e.g. Focus on 50 Mbps 800Tk ISP discount packages in Bengali)..."
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
                  disabled={copilotLoading}
                />
                <button
                  type="submit"
                  disabled={copilotLoading || !copilotInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                >
                  <Send size={12} />
                  Send
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Live Strategy Configuration Fields */}
        <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Layers size={18} className="text-purple-500" />
              Core Strategy & Prompt Prompts
            </h2>
            <span className="text-[11px] text-neutral-400 font-mono">Synced with Brain</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Channel Niche / Category</label>
              <input
                type="text"
                value={strategyData.niche}
                onChange={(e) => updateStrategyField('niche', e.target.value)}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-purple-500/50"
              />
            </div>
            <div>
              <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Campaign Objective Node</label>
              <input
                type="text"
                value={strategyData.objective_node}
                onChange={(e) => updateStrategyField('objective_node', e.target.value)}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Target Audience & Demographics</label>
            <input
              type="text"
              value={strategyData.target_audience}
              onChange={(e) => updateStrategyField('target_audience', e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Topic Generation Prompt (Rules for Hooks & Angles)</label>
            <textarea
              rows={3}
              value={strategyData.topic_prompt}
              onChange={(e) => updateStrategyField('topic_prompt', e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg p-3 text-xs leading-relaxed focus:outline-none focus:border-purple-500/50 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Script Writing Prompt (Structure & Language Instructions)</label>
            <textarea
              rows={3}
              value={strategyData.script_prompt}
              onChange={(e) => updateStrategyField('script_prompt', e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg p-3 text-xs leading-relaxed focus:outline-none focus:border-purple-500/50 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Metadata & Caption Prompt</label>
            <textarea
              rows={2}
              value={strategyData.metadata_prompt}
              onChange={(e) => updateStrategyField('metadata_prompt', e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg p-3 text-xs leading-relaxed focus:outline-none focus:border-purple-500/50 font-mono"
            />
          </div>
        </div>

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
            <button
              onClick={() => updateConfig('pipeline_mode', 'autonomous')}
              className={`p-4 rounded-xl border text-left transition-all ${config.pipeline_mode === 'autonomous'
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

            <button
              onClick={() => updateConfig('pipeline_mode', 'manual_review')}
              className={`p-4 rounded-xl border text-left transition-all ${config.pipeline_mode === 'manual_review'
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
        </div>

        {/* API Keys */}
        <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl">
          <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
            <Settings size={18} className="text-emerald-500" />
            API Integrations & Keys
          </h2>
          <p className="text-xs text-neutral-500 mb-5">
            Nexus requires third-party API keys to operate automatically in the background.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-xs uppercase text-neutral-500 font-bold tracking-wider">Gemini API Key</label>
              <input
                type="password"
                value={config.gemini_api_key || ''}
                onChange={e => updateConfig('gemini_api_key', e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs uppercase text-neutral-500 font-bold tracking-wider">Pexels API Key</label>
              <input
                type="password"
                value={config.pexels_api_key || ''}
                onChange={e => updateConfig('pexels_api_key', e.target.value)}
                placeholder="563492ad6f91700001000001..."
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
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
            className={`flex items-center gap-2 px-8 py-4 rounded-xl font-semibold transition-all duration-300 shadow-xl ${saved
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
