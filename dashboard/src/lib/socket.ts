import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(serverUrl: string = "http://localhost:5001"): Socket {
  if (!socket) {
    socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socket.on("connect", () => {
      console.log("⚡ [SOCKET.IO] Connected to Python Engine:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("🔌 [SOCKET.IO] Disconnected from Python Engine:", reason);
    });

    socket.on("connect_error", (error) => {
      // Gracefully handle offline engine without spamming error console
    });
  }

  return socket;
}
