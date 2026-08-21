"use client";
import React, { useState } from "react";
import { Zap, Sparkles, Film, AlignLeft, Image as ImageIcon, Send, RefreshCw, Layers } from "lucide-react";
import { useSocket } from "./SocketProvider";
import { FrontendBrain } from "@/lib/frontendBrain";
import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";

interface InstantGenerationBarProps {
  channels: any[];
  currentChannel: string;
  onChannelChange: (channelKey: string) => void;
  userId?: string;
  geminiKey?: string;
  pexelsKey?: string;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

export function InstantGenerationBar({
  channels,
  currentChannel,
  onChannelChange,
  userId,
  geminiKey,
  pexelsKey,
  onSuccessToast,
  onErrorToast,
}: {
  channels: any[];
  currentChannel: string;
  onChannelChange: (channelKey: string) => void;
  userId?: string;
  geminiKey?: string;
  pexelsKey?: string;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}) {
  const { isConnected, emitInstantGeneration, liveProgress } = useSocket();
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState("short");
  const [mode, setMode] = useState<"engine" | "browser">("engine");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hint, setHint] = useState("");

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topic.trim()) {
      onErrorToast("Please enter a topic or concept to generate.");
      return;
    }
    if (!currentChannel) {
      onErrorToast("Please select a target channel.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "engine") {
        // 1. Dual-Channel: Socket.IO + Firestore
        emitInstantGeneration({
          topic: topic.trim(),
          channel_key: currentChannel,
          content_type: contentType,
          user_id: userId,
          hint: hint.trim(),
        });

        // Add to trigger queue in Firestore for durable multi-device sync
        await addDoc(collection(db, "trigger_queue"), {
          type: "GENERATE_PIPELINE",
          channel_key: currentChannel,
          content_type: contentType,
          topic: topic.trim(),
          status: "Pending",
          created_at: new Date().toISOString(),
          user_id: userId,
          hint: hint.trim(),
        });

        onSuccessToast(`⚡ Instant generation dispatched to Python Engine for '${topic}'!`);
        setTopic("");
        setHint("");
      } else {
        // In-Browser Brain Mode
        if (!geminiKey) {
          onErrorToast("Please configure your Gemini API Key in Settings for Browser Mode.");
          setIsSubmitting(false);
          return;
        }

        const channelObj = channels.find((c) => c.channel_key === currentChannel) || {
          channel_key: currentChannel,
        };

        const fb = new FrontendBrain(geminiKey, channelObj, userId || "");
        await fb.runFullGeneration(contentType, hint ? `${topic} - ${hint}` : topic);

        onSuccessToast(`✨ Generated '${topic}' in-browser and saved to review queue!`);
        setTopic("");
        setHint("");
      }
    } catch (err: any) {
      console.error(err);
      onErrorToast(err.message || "Failed to trigger generation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-neutral-900/60 dark:bg-neutral-900/80 border border-black/10 dark:border-white/10 rounded-2xl p-4 md:p-5 shadow-lg backdrop-blur-md space-y-3">
      {/* Live Pipeline Progress Indicator */}
      {liveProgress && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 animate-in fade-in duration-300">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-emerald-400 flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin text-emerald-400" />
              <span className="capitalize">{liveProgress.stage}</span>
              <span className="text-neutral-400 font-normal">| {liveProgress.details}</span>
            </span>
            <span className="font-mono font-bold text-emerald-400">{liveProgress.percent}%</span>
          </div>
          <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(5, liveProgress.percent))}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Input Form */}
      <form onSubmit={handleGenerate} className="flex flex-col md:flex-row gap-2.5">
        {/* Channel Picker */}
        <select
          value={currentChannel}
          onChange={(e) => onChannelChange(e.target.value)}
          className="px-3.5 py-2.5 bg-black/20 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs font-semibold text-neutral-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        >
          {channels.map((c) => (
            <option key={c.id || c.channel_key} value={c.channel_key} className="bg-neutral-900 text-white">
              📺 {c.channel_name || c.channel_key}
            </option>
          ))}
        </select>

        {/* Content Type Picker */}
        <div className="flex bg-black/20 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => setContentType("short")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              contentType === "short"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
            title="9:16 Vertical Video (Shorts/Reels/TikTok)"
          >
            <Film size={12} /> Short
          </button>
          <button
            type="button"
            onClick={() => setContentType("post")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              contentType === "post"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
            title="Text Post (X, Facebook, LinkedIn)"
          >
            <AlignLeft size={12} /> Post
          </button>
          <button
            type="button"
            onClick={() => setContentType("image")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              contentType === "image"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
            title="Image Caption Post"
          >
            <ImageIcon size={12} /> Image
          </button>
        </div>

        {/* Topic Input Bar */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter custom topic or hook (e.g. Why the Romans Built Concrete in Seawater)..."
            className="w-full pl-3.5 pr-10 py-2.5 bg-black/20 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>

        {/* Dispatch Action Button */}
        <button
          type="submit"
          disabled={isSubmitting || !topic.trim()}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs rounded-xl shadow-md hover:shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : mode === "engine" ? (
            <Zap size={13} className="fill-current" />
          ) : (
            <Sparkles size={13} />
          )}
          {isSubmitting ? "Dispatching..." : "Generate Now"}
        </button>
      </form>

      {/* Mode Switch & Controls */}
      <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
        <div className="flex items-center gap-3">
          <span>Engine Dispatch:</span>
          <button
            type="button"
            onClick={() => setMode("engine")}
            className={`font-semibold flex items-center gap-1 transition-colors ${
              mode === "engine" ? "text-emerald-400 underline underline-offset-4" : "hover:text-neutral-300"
            }`}
          >
            ⚡ Python Engine (FFmpeg & Voice)
          </button>
          <span className="text-neutral-600">|</span>
          <button
            type="button"
            onClick={() => setMode("browser")}
            className={`font-semibold flex items-center gap-1 transition-colors ${
              mode === "browser" ? "text-emerald-400 underline underline-offset-4" : "hover:text-neutral-300"
            }`}
          >
            🧠 In-Browser Gemini
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-neutral-400 hover:text-neutral-200 transition-colors flex items-center gap-1"
        >
          <Layers size={11} /> {showAdvanced ? "Hide Prompt Controls" : "Custom Prompt Controls"}
        </button>
      </div>

      {/* Advanced Prompt Controls */}
      {showAdvanced && (
        <div className="pt-2 border-t border-white/5 animate-in fade-in duration-200">
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Optional custom direction/pacing (e.g. Focus on shocking historical facts with fast pacing)..."
            className="w-full px-3.5 py-2 bg-black/30 border border-white/5 rounded-lg text-xs text-neutral-300 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 font-mono"
          />
        </div>
      )}
    </div>
  );
}
