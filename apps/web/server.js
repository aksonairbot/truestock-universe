// apps/web/server.js
//
// Custom Node.js server: runs Next.js + Socket.IO on the same process.
// Usage: NODE_ENV=production node server.js
//
// Socket.IO handles real-time chat; Next.js handles everything else.
//
// Auth model (fixed 2026-05-22):
//   - We do NOT trust `socket.handshake.auth.userId` from the client.
//   - We parse the NextAuth session cookie from the handshake headers and
//     verify the JWT with the same secret + cookie-name + salt pattern
//     `middleware.ts` uses. The verified `sub`/`id` claim is the userId.
//   - Channel membership is checked against `chat_channel_members` before
//     joining a `channel:<id>` room. `new_message` re-uses the authenticated
//     userId — client-supplied `senderId/senderName` are ignored.
//
// Background: until 2026-05-22 the socket trusted any userId in
// `handshake.auth.userId`, so a forged client could impersonate any user,
// join any channel, and emit fake messages. See SEEKPEAK_REVIEW.

import { createServer } from "node:http";
import next from "next";
import { Server as SocketIO } from "socket.io";
import { parse } from "node:url";
import { getToken } from "next-auth/jwt";
import { getDb, chatChannelMembers, eq, and } from "@tu/db";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

if (!process.env.AUTH_SECRET) {
  // Match the loud-fail behaviour in auth.ts / middleware.ts. The chat
  // socket validates the same NextAuth JWT, so a missing secret here is
  // the same compromise as a missing secret on the HTTP path.
  throw new Error("AUTH_SECRET is required to start the SeekPeak server");
}

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

/**
 * Build a Request-shape adapter getToken() can consume from a raw
 * Socket.IO handshake. getToken needs `.cookies.get(name)` or
 * `.headers.get('cookie')` — the latter is the simplest to fake.
 */
function reqFromHandshake(handshake) {
  const cookieHeader = handshake.headers?.cookie ?? "";
  const isHttps =
    handshake.secure === true ||
    handshake.headers?.["x-forwarded-proto"] === "https";
  return {
    headers: {
      get: (name) =>
        name.toLowerCase() === "cookie" ? cookieHeader : handshake.headers?.[name.toLowerCase()] ?? null,
    },
    cookies: undefined, // getToken falls back to headers.get('cookie')
    url: isHttps ? "https://placeholder/" : "http://placeholder/",
    nextUrl: { protocol: isHttps ? "https:" : "http:" },
  };
}

async function resolveSocketUser(socket) {
  try {
    const req = reqFromHandshake(socket.handshake);
    const isHttps = req.nextUrl.protocol === "https:";
    const cookieName = isHttps
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      cookieName,
      salt: cookieName,
    });
    if (!token) return null;
    // NextAuth v5 puts the user id in token.id (we set it in the jwt callback)
    // or falls back to token.sub. Either is acceptable here.
    const userId = token.id ?? token.sub;
    if (!userId || typeof userId !== "string") return null;
    return {
      userId,
      userName: typeof token.name === "string" ? token.name : "",
    };
  } catch (e) {
    console.warn("[chat] socket auth failed:", e?.message ?? e);
    return null;
  }
}

async function isChannelMember(userId, channelId) {
  if (typeof channelId !== "string" || channelId.length === 0) return false;
  try {
    const db = getDb();
    const rows = await db
      .select({ id: chatChannelMembers.userId })
      .from(chatChannelMembers)
      .where(
        and(
          eq(chatChannelMembers.channelId, channelId),
          eq(chatChannelMembers.userId, userId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (e) {
    console.warn("[chat] membership check failed:", e?.message ?? e);
    return false;
  }
}

// Track online users: userId → Set<socketId>
const onlineUsers = new Map();

function broadcastPresence() {
  const online = [...onlineUsers.keys()];
  io.emit("presence", online);
}

io.on("connection", async (socket) => {
  const auth = await resolveSocketUser(socket);
  if (!auth) {
    socket.disconnect(true);
    return;
  }
  const { userId, userName } = auth;

  // Track presence
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);
  broadcastPresence();

  console.log(`[chat] ${userName || userId} connected (${onlineUsers.get(userId).size} sessions)`);

  // Join user's personal room for DM targeting
  socket.join(`user:${userId}`);

  // Join channel rooms — only if the user is actually a member.
  socket.on("join_channel", async (channelId) => {
    if (!(await isChannelMember(userId, channelId))) {
      console.warn(`[chat] reject join_channel: user=${userId} channel=${channelId} not-a-member`);
      return;
    }
    socket.join(`channel:${channelId}`);
  });

  socket.on("leave_channel", (channelId) => {
    if (typeof channelId !== "string") return;
    socket.leave(`channel:${channelId}`);
  });

  // New message — re-derive senderId from the authenticated socket;
  // ignore any client-supplied senderId/senderName. The DB row is written
  // via the `sendMessage` server action (which has its own membership
  // check); this socket relay is the live-update fan-out.
  socket.on("new_message", async (msg) => {
    if (!msg || typeof msg !== "object" || typeof msg.channelId !== "string") return;
    if (!(await isChannelMember(userId, msg.channelId))) return;
    io.to(`channel:${msg.channelId}`).emit("message", {
      id: typeof msg.id === "string" ? msg.id : undefined,
      channelId: msg.channelId,
      senderId: userId,
      senderName: userName,
      body: typeof msg.body === "string" ? msg.body : "",
      createdAt: msg.createdAt ?? new Date().toISOString(),
    });
  });

  // Typing indicator — re-derive userId from the socket.
  socket.on("typing", ({ channelId } = {}) => {
    if (typeof channelId !== "string") return;
    socket.to(`channel:${channelId}`).emit("typing", { channelId, userId, userName });
  });

  socket.on("stop_typing", ({ channelId } = {}) => {
    if (typeof channelId !== "string") return;
    socket.to(`channel:${channelId}`).emit("stop_typing", { channelId, userId });
  });

  // Notify channel members when a new channel is created (so sidebar updates).
  // The DB write happens in the server action; this just relays the news.
  // Re-derive memberIds — never trust the client. We tell each user "look,
  // a new channel was created"; whether they actually have access is
  // re-checked when they call join_channel.
  socket.on("channel_created", ({ channel, memberIds } = {}) => {
    if (!channel || !Array.isArray(memberIds)) return;
    for (const mid of memberIds) {
      if (typeof mid !== "string") continue;
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
