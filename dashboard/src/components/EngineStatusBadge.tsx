"use client";
import React, { useState } from "react";
import { useSocket } from "./SocketProvider";
import { Activity, Terminal, CheckCircle, AlertCircle, X, Trash2 } from "lucide-react";

export function EngineStatusBadge() {
  const { isConnected, engineStatus, liveLogs, clearLogs, liveProgress } = useSocket();
  const [showLogs, setShowLogs] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Status Badge */}
        <button
          onClick={() => setShowLogs(!showLogs)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            isConnected
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
              : "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20"
          }`}
          title="Click to view real-time engine telemetry and logs"
        >
          <span className="relative flex h-2 w-2">
            {isConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isConnected ? "bg-emerald-500" : "bg-rose-500"
              }`}
            ></span>
          </span>
          <span>{isConnected ? "Engine Live" : "Engine Offline"}</span>
          <Terminal size={12} className="opacity-70 ml-0.5" />
        </button>
      </div>

      {/* Real-Time Live Logs Modal / Flyout */}
      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-neutral-950">
              <div className="flex items-center gap-2.5">
                <Activity size={16} className={isConnected ? "text-emerald-400" : "text-rose-400"} />
                <span className="font-semibold text-sm text-neutral-200">
                  Engine Telemetry & Live Socket Logs
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase ${
                    isConnected
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {isConnected ? "ws:5001 connected" : "disconnected"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearLogs}
                  className="text-neutral-400 hover:text-neutral-200 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  title="Clear Logs"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => setShowLogs(false)}
                  className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Live Progress Bar in Modal if active */}
            {liveProgress && (
              <div className="p-4 bg-black/40 border-b border-white/10">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-semibold text-neutral-300 flex items-center gap-2">
                    <span className="capitalize">{liveProgress.stage}</span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {liveProgress.details}
                    </span>
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {liveProgress.percent}%
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(5, liveProgress.percent))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Log Stream */}
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs space-y-1.5 bg-neutral-950/80">
              {liveLogs.length === 0 ? (
                <div className="text-center py-10 text-neutral-500">
                  <Terminal size={24} className="mx-auto mb-2 opacity-40" />
                  No live logs yet. Run a generation or test actions to see live output.
                </div>
              ) : (
                liveLogs.map((l, idx) => (
                  <div key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-neutral-600 select-none text-[11px]">{l.time}</span>
                    <span
                      className={`text-[10px] px-1 rounded font-bold uppercase ${
                        l.level === "ERROR"
                          ? "bg-rose-500/20 text-rose-400"
                          : l.level === "WARN"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {l.level}
                    </span>
                    <span className="text-neutral-300 flex-1 break-words">{l.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
