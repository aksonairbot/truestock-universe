// apps/web/app/chat/socket-context.tsx
//
// Client-side Socket.IO context.
// Wraps the chat page tree so every chat component can useSocket().

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

interface SocketCtx {
  socket: Socket | null;
  connected: boolean;
  onlineUsers: string[];
}

const Ctx = createContext<SocketCtx>({ socket: null, connected: false, onlineUsers: [] });

export function useSocket() {
  return useContext(Ctx);
}

export function SocketProvider({
  userId,
  userName,
  children,
}: {
  userId: string;
  userName: string;
  children: ReactNode;
}) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    const s = io({
      path: "/api/chat/socket",
      auth: { userId, userName },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    });

    socketRef.current = s;

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("presence", (ids: string[]) => setOnlineUsers(ids));

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [userId, userName]);

  return (
    <Ctx.Provider value={{ socket: socketRef.current, connected, onlineUsers }}>
      {children}
    </Ctx.Provider>
  );
}
