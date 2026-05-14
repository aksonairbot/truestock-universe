// apps/web/server.js
//
// Custom Node.js server: runs Next.js + Socket.IO on the same process.
// Usage: NODE_ENV=production node server.js
//
// Socket.IO handles real-time chat; Next.js handles everything else.

import { createServer } from "node:http";
import next from "next";
import { Server as SocketIO } from "socket.io";
import { parse } from "node:url";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => {
  const parsedUrl = parse(req.url, true);
  handle(req, res, parsedUrl);
});

// ----- Socket.IO -----
const io = new SocketIO(httpServer, {
  path: "/api/chat/socket",
  cors: { origin: false },      // same-origin only
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
});

// Track online users: userId → Set<socketId>
const onlineUsers = new Map();

function broadcastPresence() {
  const online = [...onlineUsers.keys()];
  io.emit("presence", online);
}

io.on("connection", (socket) => {
  const userId = socket.handshake.auth?.userId;
  const userName = socket.handshake.auth?.userName;

  if (!userId) {
    socket.disconnect(true);
    return;
  }

  // Track presence
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);
  broadcastPresence();

  console.log(`[chat] ${userName || userId} connected (${onlineUsers.get(userId).size} sessions)`);

  // Join user's personal room for DM targeting
  socket.join(`user:${userId}`);

  // Join channel rooms
  socket.on("join_channel", (channelId) => {
    socket.join(`channel:${channelId}`);
  });

  socket.on("leave_channel", (channelId) => {
    socket.leave(`channel:${channelId}`);
  });

  // New message — broadcast to channel members
  // The actual DB insert happens via server action; this just relays to sockets.
  socket.on("new_message", (msg) => {
    // msg: { id, channelId, senderId, senderName, body, createdAt }
    io.to(`channel:${msg.channelId}`).emit("message", msg);
  });

  // Typing indicator
  socket.on("typing", ({ channelId, userName: name }) => {
    socket.to(`channel:${channelId}`).emit("typing", { channelId, userId, userName: name });
  });

  socket.on("stop_typing", ({ channelId }) => {
    socket.to(`channel:${channelId}`).emit("stop_typing", { channelId, userId });
  });

  // Notify channel members when a new channel is created (so sidebar updates)
  socket.on("channel_created", ({ channel, memberIds }) => {
    for (const mid of memberIds) {
      io.to(`user:${mid}`).emit("channel_added", channel);
    }
  });

  socket.on("disconnect", () => {
    const sessions = onlineUsers.get(userId);
    if (sessions) {
      sessions.delete(socket.id);
      if (sessions.size === 0) onlineUsers.delete(userId);
    }
    broadcastPresence();
    console.log(`[chat] ${userName || userId} disconnected`);
  });
});

httpServer.listen(port, () => {
  console.log(`> SeekPeek ready on http://localhost:${port} (${dev ? "dev" : "production"})`);
  console.log(`> Socket.IO listening at /api/chat/socket`);
});
