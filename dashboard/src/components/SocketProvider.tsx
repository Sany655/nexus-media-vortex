"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";

export interface PipelineProgress {
  stage: string;
  percent: number;
  details: string;
  active: boolean;
  timestamp: string;
}

export interface PipelineLog {
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  time: string;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  engineStatus: any;
  liveProgress: PipelineProgress | null;
  liveLogs: PipelineLog[];
  clearLogs: () => void;
  emitInstantGeneration: (payload: {
    topic: string;
    channel_key: string;
    content_type: string;
    user_id?: string;
    hint?: string;
  }) => void;
  emitPublish: (payload: {
    topic: string;
    channel_key: string;
    platform: string;
    user_id?: string;
  }) => void;
  emitRetry: (payload: {
    topic: string;
    channel_key: string;
    user_id?: string;
  }) => void;
  emitSyncAnalytics: (channel_key?: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  engineStatus: null,
  liveProgress: null,
  liveLogs: [],
  clearLogs: () => {},
  emitInstantGeneration: () => {},
  emitPublish: () => {},
  emitRetry: () => {},
  emitSyncAnalytics: () => {},
});

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [engineStatus, setEngineStatus] = useState<any>(null);
  const [liveProgress, setLiveProgress] = useState<PipelineProgress | null>(null);
  const [liveLogs, setLiveLogs] = useState<PipelineLog[]>([]);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => {
      setIsConnected(false);
      setEngineStatus(null);
    };

    const onStatus = (statusData: any) => {
      setEngineStatus(statusData);
    };

    const onProgress = (data: any) => {
      const progressPayload: PipelineProgress = {
        stage: data.stage || "processing",
        percent: data.percent ?? 0,
        details: data.details || "",
        active: data.percent < 100 && data.stage !== "error",
        timestamp: new Date().toLocaleTimeString(),
      };
      setLiveProgress(progressPayload);

      // Auto-clear active progress after completion
      if (data.percent >= 100 || data.stage === "error") {
        setTimeout(() => {
          setLiveProgress((prev) => (prev?.percent === data.percent ? null : prev));
        }, 5000);
      }
    };

    const onLog = (data: any) => {
      const newLog: PipelineLog = {
        level: data.level || "INFO",
        message: data.message || "",
        time: new Date().toLocaleTimeString(),
      };
      setLiveLogs((prev) => [newLog, ...prev.slice(0, 99)]); // Keep last 100 logs
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("engine:status", onStatus);
    s.on("pipeline:progress", onProgress);
    s.on("pipeline:log", onLog);

    if (s.connected) {
      setIsConnected(true);
    }

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("engine:status", onStatus);
      s.off("pipeline:progress", onProgress);
      s.off("pipeline:log", onLog);
    };
  }, []);

  const clearLogs = useCallback(() => setLiveLogs([]), []);

  const emitInstantGeneration = useCallback(
    (payload: {
      topic: string;
      channel_key: string;
      content_type: string;
      user_id?: string;
      hint?: string;
    }) => {
      if (socket) {
        socket.emit("trigger:instant_generation", payload);
      }
    },
    [socket]
  );

  const emitPublish = useCallback(
    (payload: {
      topic: string;
      channel_key: string;
      platform: string;
      user_id?: string;
    }) => {
      if (socket) {
        socket.emit("trigger:publish", payload);
      }
    },
    [socket]
  );

  const emitRetry = useCallback(
    (payload: { topic: string; channel_key: string; user_id?: string }) => {
      if (socket) {
        socket.emit("trigger:retry", payload);
      }
    },
    [socket]
  );

  const emitSyncAnalytics = useCallback(
    (channel_key?: string) => {
      if (socket) {
        socket.emit("trigger:sync_analytics", { channel_key });
      }
    },
    [socket]
  );

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        engineStatus,
        liveProgress,
        liveLogs,
        clearLogs,
        emitInstantGeneration,
        emitPublish,
        emitRetry,
        emitSyncAnalytics,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}
