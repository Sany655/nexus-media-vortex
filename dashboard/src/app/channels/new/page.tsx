"use client";
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bot, User, ArrowRight, Activity, Plus, Check, Loader2, Key } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';

const SYSTEM_PROMPT = `
You are an elite, AI-driven YouTube and TikTok channel manager and strategist.
Your goal is to help the user design a highly monetizable, viral "faceless" channel.
The user will tell you their niche or idea. Ask clarifying questions if needed (e.g., target audience, tone).
Once you have enough context to populate the channel profile, you MUST output ONLY a valid JSON block containing the configuration.
Do not output any markdown formatting like \`\`\`json, just the raw JSON object.

The JSON schema must exactly match this:
{
  "name": "A catchy channel name (string)",
  "niche": "The channel niche (string)",
  "target_audience": "The target demographic (string)",
  "objective_node": "A short, dynamic category name summarizing their objective (e.g., 'Viral Monetization', 'SaaS Marketing').",
  "topic_prompt": "Instructions for selecting a viral topic in this niche (string)",
  "script_prompt": "Instructions for writing a 140-160 word script with hook and CTA (string)",
  "visual_prompt": "Instructions for generating two distinct visual stock footage keywords per sentence (string)",
  "metadata_prompt": "Instructions for writing SEO optimized captions and hashtags (string)",
  "cta_template": "A Call to Action template (string)",
  "hashtags_template": "A list of 5-7 default hashtags (string)"
}

If you do NOT have enough information yet, reply normally as a helpful assistant asking for more details.
`;

export default function NewChannelStrategy() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [geminiKey, setGeminiKey] = useState('');
  const [isKeySet, setIsKeySet] = useState(false);
  const [saveToDb, setSaveToDb] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);

  const [messages, setMessages] = useState<{role: 'user'|'model', content: string}[]>([
    { role: 'model', content: "Hello! I am your Core Intelligence Strategist. What kind of channel do you want to build today? (e.g. 'I want to build a faceless horror channel for teens')" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [proposedConfig, setProposedConfig] = useState<any>(null);
  const [modelType, setModelType] = useState('gemini-2.5-flash');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages, configReady]);

  // Load API Key
  useEffect(() => {
    if (authLoading || !user) return;
    
    const loadKey = async () => {
      // Check local storage first
      const localKey = localStorage.getItem('GEMINI_API_KEY');
      if (localKey) {
        setGeminiKey(localKey);
        setIsKeySet(true);
        setCheckingKey(false);
        return;
      }

      // Check DB
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().gemini_api_key) {
          setGeminiKey(docSnap.data().gemini_api_key);
          setIsKeySet(true);
        }
      } catch (e) {
        console.error(e);
      }
      setCheckingKey(false);
    };
    loadKey();
  }, [user, authLoading]);

  const handleSetKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKey) return;
    
    if (saveToDb && user) {
      await setDoc(doc(db, 'users', user.uid), { gemini_api_key: geminiKey }, { merge: true });
    } else {
      localStorage.setItem('GEMINI_API_KEY', geminiKey);
    }
    setIsKeySet(true);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || configReady || !geminiKey) return;
    
    const userMsg = input.trim();
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }];
    
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      if (modelType !== 'gemini-2.5-flash' && modelType !== 'gemini-2.5-pro') {
        throw new Error(`Model provider for '${modelType}' is not yet configured for browser-side.`);
      }

      const ai = new GoogleGenAI({ apiKey: geminiKey });
      
      const formattedMessages = newMessages.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      const response = await ai.models.generateContent({
        model: modelType,
        contents: formattedMessages,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.7,
        }
      });

      const reply = response.text || '';
      
      let isConfigReady = false;
      let configData = null;
      
      try {
        const cleaned = reply.replace(/^\`\`\`json\n?/, '').replace(/\`\`\`$/, '').trim();
        configData = JSON.parse(cleaned);
        if (configData.name && configData.niche && configData.topic_prompt) {
          isConfigReady = true;
        }
      } catch (e) {}

      if (isConfigReady && configData) {
        setProposedConfig(configData);
        setConfigReady(true);
        setMessages([...newMessages, { role: 'model', content: "I have gathered enough information! Please review the proposed channel configuration below." }]);
      } else {
        setMessages([...newMessages, { role: 'model', content: reply }]);
      }
      
    } catch (err: any) {
      alert("Error: " + err.message);
      setMessages(messages); 
    } finally {
      setLoading(false);
    }
  };

  const acceptAndCreate = async () => {
    setLoading(true);
    try {
      if (!user) throw new Error("Must be logged in.");
      const uid = user.uid;
      
      const channel_key = proposedConfig.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      
      const channelRef = doc(db, 'channels', channel_key);
      await setDoc(channelRef, {
        user_id: uid,
        channel_key,
        ...proposedConfig,
        api_keys_json: "{}",
        created_at: new Date().toISOString()
      });
      
      router.push(`/channels/settings?id=${channel_key}`);
    } catch (err: any) {
      alert("Error saving channel: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || checkingKey) return null;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 p-8 font-sans selection:bg-emerald-500/30">
      <div className="fixed top-[-10%] left-[-10%] w-96 h-96 bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-end border-b border-black/10 dark:border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-light tracking-tight text-neutral-900 dark:text-white mb-2 flex items-center gap-3">
              <Bot className="text-emerald-600" />
              Core Intelligence
            </h1>
            <p className="text-neutral-500">Channel Strategy Designer</p>
          </div>
          
          <div className="flex items-center gap-4">
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value)}
              className="bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-800 dark:text-neutral-300 focus:outline-none focus:border-emerald-500/50 transition-colors"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
            </select>
            
            <Link 
              href="/"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              <Activity size={18} />
              DASHBOARD
            </Link>
          </div>
        </header>

        {!isKeySet ? (
          <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl p-8 border border-black/10 dark:border-white/5 shadow-2xl max-w-lg mx-auto mt-12 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
              <Key className="text-emerald-500" size={32} />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Gemini API Key Required</h2>
            <p className="text-sm text-neutral-500 mb-6">Since the dashboard is serverless, the AI runs directly in your browser. Please provide your Gemini API key to continue.</p>
            
            <form onSubmit={handleSetKey} className="space-y-4">
              <input 
                type="password" 
                required
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..." 
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-4 py-3 text-neutral-900 dark:text-white focus:border-emerald-500/50 outline-none"
              />
              
              <div className="flex gap-4 items-center justify-center text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={saveToDb} onChange={() => setSaveToDb(true)} className="accent-emerald-500" />
                  Save permanently to Database
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={!saveToDb} onChange={() => setSaveToDb(false)} className="accent-emerald-500" />
                  Local Storage (Browser only)
                </label>
              </div>

              <button type="submit" className="w-full py-3 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400 transition-colors">
                Initialize Assistant
              </button>
            </form>
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-6">
          
          {/* Chat Window */}
          <div className="flex flex-col h-[600px] rounded-2xl bg-white dark:bg-[#0a0a0a] border border-black/10 dark:border-white/5 shadow-2xl overflow-hidden">
            
            {/* Chat History */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'model' && (
                    <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-emerald-500/30">
                      <Bot size={16} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                  )}
                  
                  <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-purple-500/20 text-purple-900 dark:text-purple-100 border border-purple-500/30 rounded-tr-sm' 
                      : 'bg-black/5 dark:bg-white/5 text-neutral-800 dark:text-neutral-300 border border-black/10 dark:border-white/10 rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center flex-shrink-0 border border-purple-500/30">
                      <User size={16} className="text-purple-600 dark:text-purple-400" />
                    </div>
                  )}
                </div>
              ))}
              
              {loading && !configReady && (
                <div className="flex gap-4 justify-start">
                  <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-emerald-500/30">
                    <Bot size={16} className="text-emerald-600 dark:text-emerald-400 animate-pulse" />
                  </div>
                  <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl rounded-tl-sm p-4 flex gap-1 items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input Area (Disabled if config is ready) */}
            {!configReady ? (
              <div className="p-4 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/10 dark:border-white/5">
                <form 
                  onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                  className="flex gap-4"
                >
                  <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Describe your channel idea..."
                    className="flex-1 bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-lg px-4 py-3 text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-neutral-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    disabled={loading}
                  />
                  <button 
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-6 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Send <ArrowRight size={16} />
                  </button>
                </form>
              </div>
            ) : (
              <div className="p-4 bg-emerald-500/10 border-t border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-center text-sm font-medium">
                Strategy Finalized. Please review the configuration below.
              </div>
            )}
          </div>

          {/* Configuration Card (Shows when ready) */}
          {configReady && proposedConfig && (
            <div className="p-6 rounded-2xl bg-white dark:bg-white/[0.02] border border-black/10 dark:border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <Check className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-medium text-neutral-900 dark:text-white">{proposedConfig.name}</h2>
                  <p className="text-sm text-neutral-500">Proposed Configuration</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-black/5 dark:bg-black/30 p-4 rounded-lg border border-black/5 dark:border-white/5 md:col-span-2 text-center">
                  <div className="text-xs text-emerald-500 uppercase font-bold tracking-wider mb-1">Campaign Objective Node</div>
                  <div className="text-xl font-medium text-emerald-700 dark:text-emerald-400">{proposedConfig.objective_node}</div>
                </div>
                <div className="bg-black/5 dark:bg-black/30 p-4 rounded-lg border border-black/5 dark:border-white/5">
                  <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Niche</div>
                  <div className="text-emerald-700 dark:text-emerald-100">{proposedConfig.niche}</div>
                </div>
                <div className="bg-black/5 dark:bg-black/30 p-4 rounded-lg border border-black/5 dark:border-white/5">
                  <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Target Audience</div>
                  <div className="text-emerald-700 dark:text-emerald-100">{proposedConfig.target_audience}</div>
                </div>
                <div className="bg-black/5 dark:bg-black/30 p-4 rounded-lg border border-black/5 dark:border-white/5 md:col-span-2">
                  <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Topic Prompt</div>
                  <div className="text-neutral-700 dark:text-neutral-300 text-sm">{proposedConfig.topic_prompt}</div>
                </div>
                <div className="bg-black/5 dark:bg-black/30 p-4 rounded-lg border border-black/5 dark:border-white/5 md:col-span-2">
                  <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Script Prompt</div>
                  <div className="text-neutral-700 dark:text-neutral-300 text-sm">{proposedConfig.script_prompt}</div>
                </div>
                <div className="bg-black/5 dark:bg-black/30 p-4 rounded-lg border border-black/5 dark:border-white/5">
                  <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Visual Prompt</div>
                  <div className="text-neutral-700 dark:text-neutral-300 text-sm">{proposedConfig.visual_prompt}</div>
                </div>
                <div className="bg-black/5 dark:bg-black/30 p-4 rounded-lg border border-black/5 dark:border-white/5">
                  <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Metadata Prompt</div>
                  <div className="text-neutral-700 dark:text-neutral-300 text-sm">{proposedConfig.metadata_prompt}</div>
                </div>
              </div>

              <button 
                onClick={acceptAndCreate}
                disabled={loading}
                className="w-full py-4 rounded font-bold tracking-widest text-sm transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                {loading ? "CREATING CHANNEL..." : "ACCEPT & CREATE CHANNEL"}
              </button>
            </div>
          )}
          
        </div>
        )}
      </div>
    </div>
  );
}
