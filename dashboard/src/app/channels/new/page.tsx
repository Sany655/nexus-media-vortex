"use client";
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bot, User, ArrowRight, Activity, Plus, Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function NewChannelStrategy() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [messages, setMessages] = useState<{role: 'user'|'model', content: string}[]>([
    { role: 'model', content: "Hello! I am your Core Intelligence Strategist. What kind of channel do you want to build today? (e.g. 'I want to build a faceless horror channel for teens')" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [proposedConfig, setProposedConfig] = useState<any>(null);
  const [modelType, setModelType] = useState('gemini-2.5-flash');
  
  // For scrolling to bottom of chat
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages, configReady]);

  const sendMessage = async () => {
    if (!input.trim() || loading || configReady) return;
    
    const userMsg = input.trim();
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }];
    
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/strategy-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, modelType })
      });
      
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }
      
      if (data.isConfigReady && data.configData) {
        setProposedConfig(data.configData);
        setConfigReady(true);
        setMessages([...newMessages, { role: 'model', content: "I have gathered enough information! Please review the proposed channel configuration below." }]);
      } else {
        setMessages([...newMessages, { role: 'model', content: data.message }]);
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
      
      // Save directly to Firestore
      const channelRef = doc(db, 'channels', channel_key);
      await setDoc(channelRef, {
        user_id: uid,
        channel_key,
        ...proposedConfig,
        api_keys_json: "{}",
        created_at: new Date().toISOString()
      });
      
      alert(`Channel '${proposedConfig.name}' created successfully!`);
      router.push('/');
    } catch (err: any) {
      alert("Error saving channel: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return null;

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
              <option value="gpt-4o">GPT-4o</option>
              <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
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
      </div>
    </div>
  );
}
