"use client";
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, Save, ArrowLeft, Loader2, Key, ToggleLeft, ToggleRight, Camera, Video, MessageCircle, Hash, Globe } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

function SettingsComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { user, loading: authLoading } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channelName, setChannelName] = useState("");

  const [config, setConfig] = useState<any>({
    ig_username: "",
    ig_password: "",
    fb_username: "",
    fb_password: "",
    tk_username: "",
    x_username: "",
    pause_yt: false,
    pause_ig: false,
    pause_tk: false,
    pause_fb: false,
    pause_x: false,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/');
      return;
    }

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
              setConfig({ ...config, ...parsed });
            } catch (e) {
              console.error("Failed to parse api keys");
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
        api_keys_json: JSON.stringify(config)
      });
      
      alert("Settings saved successfully!");
    } catch (e: any) {
      alert("Error saving settings: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: string, value: any) => {
    setConfig({ ...config, [key]: value });
  };

  if (loading || authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 p-8 font-sans selection:bg-purple-500/30">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-end border-b border-black/10 dark:border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 text-neutral-500 mb-2">
              <Link href="/" className="hover:text-purple-500 flex items-center gap-1 text-sm"><ArrowLeft size={14}/> Dashboard</Link>
            </div>
            <h1 className="text-4xl font-light tracking-tight text-neutral-900 dark:text-white flex items-center gap-3">
              <Settings className="text-purple-600" />
              Channel Settings
            </h1>
            <p className="text-neutral-500 mt-2">Managing configuration for: <strong className="text-purple-500">{channelName}</strong></p>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 bg-purple-500/10 text-purple-600 border border-purple-500/30 hover:bg-purple-500/20"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            SAVE CONFIGURATION
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Instagram Settings */}
          <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl">
            <h2 className="text-xl font-medium mb-6 flex items-center gap-2"><Camera className="text-pink-500" /> Instagram Config</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Username</label>
                <input type="text" value={config.ig_username} onChange={e => updateConfig('ig_username', e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-pink-500/50" />
              </div>
              <div>
                <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Password</label>
                <input type="password" value={config.ig_password} onChange={e => updateConfig('ig_password', e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-pink-500/50" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/5">
                <span className="text-sm">Pause Uploads</span>
                <button onClick={() => updateConfig('pause_ig', !config.pause_ig)} className={config.pause_ig ? "text-red-500" : "text-green-500"}>
                  {config.pause_ig ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
            </div>
          </div>

          {/* Facebook Settings */}
          <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl">
            <h2 className="text-xl font-medium mb-6 flex items-center gap-2"><Globe className="text-blue-500" /> Facebook Config</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Username / Email</label>
                <input type="text" value={config.fb_username} onChange={e => updateConfig('fb_username', e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Password</label>
                <input type="password" value={config.fb_password} onChange={e => updateConfig('fb_password', e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/5">
                <span className="text-sm">Pause Uploads</span>
                <button onClick={() => updateConfig('pause_fb', !config.pause_fb)} className={config.pause_fb ? "text-red-500" : "text-green-500"}>
                  {config.pause_fb ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
            </div>
          </div>

          {/* TikTok Settings */}
          <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl">
            <h2 className="text-xl font-medium mb-6 flex items-center gap-2"><span className="font-bold text-lg text-black dark:text-white mix-blend-difference">TikTok</span> Config</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Username</label>
                <input type="text" value={config.tk_username} onChange={e => updateConfig('tk_username', e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-neutral-500/50" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/5">
                <span className="text-sm">Pause Uploads</span>
                <button onClick={() => updateConfig('pause_tk', !config.pause_tk)} className={config.pause_tk ? "text-red-500" : "text-green-500"}>
                  {config.pause_tk ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
              <p className="text-xs text-neutral-500">Note: TikTok session cookies are currently managed manually via the Daemon folder.</p>
            </div>
          </div>

          {/* YouTube Settings */}
          <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl">
            <h2 className="text-xl font-medium mb-6 flex items-center gap-2"><Video className="text-red-500" /> YouTube Config</h2>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-200 text-sm">
                YouTube requires secure OAuth 2.0. Please drop your `client_secrets.json` into the `channels/{id}/` folder on your Daemon machine to authenticate.
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/5">
                <span className="text-sm">Pause Uploads</span>
                <button onClick={() => updateConfig('pause_yt', !config.pause_yt)} className={config.pause_yt ? "text-red-500" : "text-green-500"}>
                  {config.pause_yt ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
            </div>
          </div>
          
          {/* Twitter Settings */}
          <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-6 border border-black/10 dark:border-white/5 shadow-xl md:col-span-2">
            <h2 className="text-xl font-medium mb-6 flex items-center gap-2"><MessageCircle className="text-blue-400" /> X (Twitter) Config</h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs uppercase text-neutral-500 mb-1 font-bold tracking-wider">Username</label>
                <input type="text" value={config.x_username} onChange={e => updateConfig('x_username', e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-400/50" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/5">
                <span className="text-sm">Pause Uploads</span>
                <button onClick={() => updateConfig('pause_x', !config.pause_x)} className={config.pause_x ? "text-red-500" : "text-green-500"}>
                  {config.pause_x ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChannelSettings() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>}>
      <SettingsComponent />
    </Suspense>
  );
}
