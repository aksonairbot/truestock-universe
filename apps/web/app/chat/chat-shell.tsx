// apps/web/app/chat/chat-shell.tsx
//
// Full chat UI: sidebar + message pane + composer.
// Client component — receives initial data from server page.

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SocketProvider, useSocket } from "./socket-context";
import {
  getMessages,
  sendMessage,
  markChannelRead,
  getOrCreateDM,
  createGroupChannel,
  getMyChannels,
  type ChannelRow,
  type MessageRow,
} from "./actions";

interface Me {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export default function ChatShell({
  me,
  initialChannels,
  allUsers,
}: {
  me: Me;
  initialChannels: ChannelRow[];
  allUsers: Array<{ id: string; name: string }>;
}) {
  return (
    <SocketProvider userId={me.id} userName={me.name}>
      <ChatInner me={me} initialChannels={initialChannels} allUsers={allUsers} />
    </SocketProvider>
  );
}

/* ------------------------------------------------------------------ */

function ChatInner({
  me,
  initialChannels,
  allUsers,
}: {
  me: Me;
  initialChannels: ChannelRow[];
  allUsers: Array<{ id: string; name: string }>;
}) {
  const { socket, connected, onlineUsers } = useSocket();
  const [channels, setChannels] = useState<ChannelRow[]>(initialChannels);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());

  // ---------- socket listeners ----------
  useEffect(() => {
    if (!socket) return;

    const onMessage = (msg: MessageRow) => {
      // If this message is in the active channel, append
      if (msg.channelId === activeId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      // Update channel list last-message
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === msg.channelId
            ? {
                ...ch,
                lastMessage: msg.body,
                lastMessageAt: msg.createdAt,
                lastSenderName: msg.senderName,
                unread: msg.channelId === activeId ? ch.unread : ch.unread + 1,
              }
            : ch
        )
      );
    };

    const onTyping = ({ channelId, userId, userName }: any) => {
      if (channelId === activeId && userId !== me.id) {
        setTypingUsers((prev) => new Map(prev).set(userId, userName));
      }
    };
    const onStopTyping = ({ channelId, userId }: any) => {
      if (channelId === activeId) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
      }
    };

    const onChannelAdded = (ch: ChannelRow) => {
      setChannels((prev) => {
        if (prev.some((c) => c.id === ch.id)) return prev;
        return [ch, ...prev];
      });
      // Auto-join room
      socket.emit("join_channel", ch.id);
    };

    socket.on("message", onMessage);
    socket.on("typing", onTyping);
    socket.on("stop_typing", onStopTyping);
    socket.on("channel_added", onChannelAdded);

    return () => {
      socket.off("message", onMessage);
      socket.off("typing", onTyping);
      socket.off("stop_typing", onStopTyping);
      socket.off("channel_added", onChannelAdded);
    };
  }, [socket, activeId, me.id]);

  // ---------- join all channel rooms on connect ----------
  useEffect(() => {
    if (!socket || !connected) return;
    for (const ch of channels) {
      socket.emit("join_channel", ch.id);
    }
  }, [socket, connected, channels]);

  // ---------- open channel ----------
  const openChannel = useCallback(
    async (id: string) => {
      setActiveId(id);
      setLoading(true);
      setTypingUsers(new Map());
      try {
        const msgs = await getMessages(id);
        setMessages(msgs);
        await markChannelRead(id);
        setChannels((prev) =>
          prev.map((ch) => (ch.id === id ? { ...ch, unread: 0 } : ch))
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ---------- create DM ----------
  const startDM = async (otherUserId: string) => {
    const { id } = await getOrCreateDM(otherUserId);
    // Refresh channels and open
    const fresh = await getMyChannels();
    setChannels(fresh);
    setShowNewDM(false);
    openChannel(id);
    socket?.emit("join_channel", id);
    // Notify the other user
    const ch = fresh.find((c) => c.id === id);
    if (ch) socket?.emit("channel_created", { channel: ch, memberIds: [otherUserId, me.id] });
  };

  // ---------- create group ----------
  const startGroup = async (name: string, memberIds: string[]) => {
    const { id } = await createGroupChannel(name, memberIds);
    const fresh = await getMyChannels();
    setChannels(fresh);
    setShowNewGroup(false);
    openChannel(id);
    socket?.emit("join_channel", id);
    const ch = fresh.find((c) => c.id === id);
    if (ch) socket?.emit("channel_created", { channel: ch, memberIds: [...memberIds, me.id] });
  };

  const activeChannel = channels.find((c) => c.id === activeId) ?? null;

  return (
    <div className="chat-layout">
      {/* ---------- sidebar ---------- */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-head">
          <h2>Chat</h2>
          <div className="chat-sidebar-actions">
            <button
              className="chat-new-btn"
              title="New DM"
              onClick={() => { setShowNewDM(true); setShowNewGroup(false); }}
            >
              <IcNewDM />
            </button>
            <button
              className="chat-new-btn"
              title="New Group"
              onClick={() => { setShowNewGroup(true); setShowNewDM(false); }}
            >
              <IcNewGroup />
            </button>
          </div>
        </div>

        {/* connection pill */}
        <div className={`chat-conn-pill ${connected ? "on" : "off"}`}>
          {connected ? "Connected" : "Connecting..."}
        </div>

        {/* new-DM picker */}
        {showNewDM && (
          <UserPicker
            users={allUsers}
            onlineUsers={onlineUsers}
            onSelect={startDM}
            onClose={() => setShowNewDM(false)}
            title="New Direct Message"
          />
        )}

        {/* new-group picker */}
        {showNewGroup && (
          <GroupCreator
            users={allUsers}
            onlineUsers={onlineUsers}
            onCreate={startGroup}
            onClose={() => setShowNewGroup(false)}
          />
        )}

        {/* channel list */}
        <div className="chat-channel-list">
          {channels.length === 0 && (
            <div className="chat-empty-hint">No conversations yet. Start a DM!</div>
          )}
          {channels.map((ch) => (
            <ChannelItem
              key={ch.id}
              channel={ch}
              active={ch.id === activeId}
              online={ch.type === "dm" && ch.memberNames.length > 0 && onlineUsers.includes(
                // We don't store IDs in memberNames — so check presence indirectly
                // For now just show a dot if any non-me online
                ""
              )}
              onlineUsers={onlineUsers}
              onClick={() => openChannel(ch.id)}
            />
          ))}
        </div>
      </div>

      {/* ---------- main pane ---------- */}
      <div className="chat-main">
        {!activeChannel ? (
          <div className="chat-empty-state">
            <IcChatEmpty />
            <p>Select a conversation or start a new one</p>
          </div>
        ) : (
          <>
            <ChatHeader channel={activeChannel} onlineUsers={onlineUsers} />
            <MessageList
              messages={messages}
              loading={loading}
              me={me}
              typingUsers={typingUsers}
            />
            <Composer
              channelId={activeId!}
              me={me}
              socket={socket}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Channel list item                                                  */
/* ================================================================== */

function ChannelItem({
  channel,
  active,
  onlineUsers,
  onClick,
}: {
  channel: ChannelRow;
  active: boolean;
  online?: boolean;
  onlineUsers: string[];
  onClick: () => void;
}) {
  const label =
    channel.type === "dm"
      ? channel.memberNames.join(", ") || "DM"
      : channel.name || "Group";

  const initials = label
    .split(/[\s,]+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const timeStr = channel.lastMessageAt
    ? new Date(channel.lastMessageAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      })
    : "";

  return (
    <button
      className={`chat-channel-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <div className={`chat-avatar ${channel.type === "dm" ? "dm" : "group"}`}>
        {initials}
      </div>
      <div className="chat-channel-info">
        <div className="chat-channel-name">
          <span className="truncate">{label}</span>
          {timeStr && <span className="chat-channel-time">{timeStr}</span>}
        </div>
        <div className="chat-channel-preview">
          {channel.lastSenderName && (
            <span className="chat-preview-sender">{channel.lastSenderName.split(" ")[0]}:</span>
          )}
          <span className="truncate">{channel.lastMessage || "No messages"}</span>
          {channel.unread > 0 && (
            <span className="chat-unread-badge">{channel.unread > 99 ? "99+" : channel.unread}</span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ================================================================== */
/* Chat header                                                        */
/* ================================================================== */

function ChatHeader({ channel, onlineUsers }: { channel: ChannelRow; onlineUsers: string[] }) {
  const label =
    channel.type === "dm"
      ? channel.memberNames.join(", ") || "DM"
      : channel.name || "Group";

  return (
    <div className="chat-header">
      <div className="chat-header-info">
        <h3>{label}</h3>
        {channel.type === "group" && (
          <span className="chat-header-members">
            {channel.memberNames.length} member{channel.memberNames.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Message list                                                       */
/* ================================================================== */

function MessageList({
  messages,
  loading,
  me,
  typingUsers,
}: {
  messages: MessageRow[];
  loading: boolean;
  me: Me;
  typingUsers: Map<string, string>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const grouped = groupMessages(messages);

  return (
    <div className="chat-messages" ref={containerRef}>
      {loading && (
        <div className="chat-loading">Loading messages...</div>
      )}
      {!loading && messages.length === 0 && (
        <div className="chat-no-messages">No messages yet. Say hello!</div>
      )}
      {grouped.map((group, gi) => (
        <div key={gi} className="chat-msg-group">
          {group.showDate && (
            <div className="chat-date-divider">
              <span>{group.dateLabel}</span>
            </div>
          )}
          <div className={`chat-msg ${group.senderId === me.id ? "mine" : ""}`}>
            {group.senderId !== me.id && (
              <div className="chat-msg-avatar">
                {group.senderName
                  .split(/\s+/)
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
            )}
            <div className="chat-msg-body">
              {group.senderId !== me.id && (
                <div className="chat-msg-sender">{group.senderName}</div>
              )}
              {group.items.map((m) => (
                <div key={m.id} className="chat-bubble">
                  <p>{m.body}</p>
                  <span className="chat-msg-time">
                    {new Date(m.createdAt).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                      timeZone: "Asia/Kolkata",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      {typingUsers.size > 0 && (
        <div className="chat-typing">
          {[...typingUsers.values()].join(", ")} typing...
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

interface MsgGroup {
  senderId: string;
  senderName: string;
  showDate: boolean;
  dateLabel: string;
  items: MessageRow[];
}

function groupMessages(messages: MessageRow[]): MsgGroup[] {
  const groups: MsgGroup[] = [];
  let lastDate = "";

  for (const m of messages) {
    const d = new Date(m.createdAt).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    });
    const showDate = d !== lastDate;
    lastDate = d;

    const prev = groups[groups.length - 1];
    if (
      prev &&
      !showDate &&
      prev.senderId === m.senderId &&
      // Same sender within 3 minutes → group together
      new Date(m.createdAt).getTime() -
        new Date(prev.items[prev.items.length - 1]!.createdAt).getTime() <
        3 * 60 * 1000
    ) {
      prev.items.push(m);
    } else {
      groups.push({
        senderId: m.senderId,
        senderName: m.senderName,
        showDate,
        dateLabel: d,
        items: [m],
      });
    }
  }
  return groups;
}

/* ================================================================== */
/* Composer                                                           */
/* ================================================================== */

function Composer({
  channelId,
  me,
  socket,
}: {
  channelId: string;
  me: Me;
  socket: any;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [channelId]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(channelId, body);
      // Relay via socket
      socket?.emit("new_message", msg);
      setText("");
      socket?.emit("stop_typing", { channelId });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Typing indicator
    socket?.emit("typing", { channelId, userName: me.name });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket?.emit("stop_typing", { channelId });
    }, 2000);
  };

  return (
    <div className="chat-composer">
      <textarea
        ref={inputRef}
        className="chat-input"
        placeholder="Type a message..."
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <button
        className="chat-send-btn"
        onClick={handleSend}
        disabled={!text.trim() || sending}
        title="Send (Enter)"
      >
        <IcSend />
      </button>
    </div>
  );
}

/* ================================================================== */
/* User picker (for new DM)                                           */
/* ================================================================== */

function UserPicker({
  users,
  onlineUsers,
  onSelect,
  onClose,
  title,
}: {
  users: Array<{ id: string; name: string }>;
  onlineUsers: string[];
  onSelect: (userId: string) => void;
  onClose: () => void;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="chat-picker">
      <div className="chat-picker-head">
        <span>{title}</span>
        <button className="chat-picker-close" onClick={onClose}>&times;</button>
      </div>
      <input
        className="chat-picker-search"
        placeholder="Search people..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div className="chat-picker-list">
        {filtered.map((u) => (
          <button key={u.id} className="chat-picker-item" onClick={() => onSelect(u.id)}>
            <span className={`chat-presence-dot ${onlineUsers.includes(u.id) ? "online" : ""}`} />
            {u.name}
          </button>
        ))}
        {filtered.length === 0 && <div className="chat-picker-empty">No matches</div>}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Group creator                                                      */
/* ================================================================== */

function GroupCreator({
  users,
  onlineUsers,
  onCreate,
  onClose,
}: {
  users: Array<{ id: string; name: string }>;
  onlineUsers: string[];
  onCreate: (name: string, memberIds: string[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="chat-picker">
      <div className="chat-picker-head">
        <span>New Group Channel</span>
        <button className="chat-picker-close" onClick={onClose}>&times;</button>
      </div>
      <input
        className="chat-picker-search"
        placeholder="Group name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        className="chat-picker-search"
        placeholder="Search members..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="chat-picker-list">
        {filtered.map((u) => (
          <button
            key={u.id}
            className={`chat-picker-item ${selected.has(u.id) ? "selected" : ""}`}
            onClick={() => toggle(u.id)}
          >
            <span className={`chat-presence-dot ${onlineUsers.includes(u.id) ? "online" : ""}`} />
            {u.name}
            {selected.has(u.id) && <span className="chat-check">&#10003;</span>}
          </button>
        ))}
      </div>
      <button
        className="chat-create-btn"
        disabled={!name.trim() || selected.size === 0}
        onClick={() => onCreate(name.trim(), [...selected])}
      >
        Create Group ({selected.size} member{selected.size !== 1 ? "s" : ""})
      </button>
    </div>
  );
}

/* ================================================================== */
/* Icons                                                              */
/* ================================================================== */

function IcNewDM() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
      <path d="M4 16V6a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H7l-3 2z" />
    </svg>
  );
}
function IcNewGroup() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="13" cy="7" r="2.5" />
      <path d="M2 17c.5-3 2-4 5-4s4.5 1 5 4M13 13c2 0 3.5 1 4 4" />
    </svg>
  );
}
function IcSend() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      <path d="M2.94 5.66l13.6-3.4a.5.5 0 01.6.6l-3.4 13.6a.5.5 0 01-.93.07L9.5 11.5l-5.03-3.31a.5.5 0 01-.07-.93l.54-.13z" />
    </svg>
  );
}
function IcChatEmpty() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48" opacity="0.3">
      <path d="M8 36V14a4 4 0 014-4h24a4 4 0 014 4v16a4 4 0 01-4 4H16l-8 6z" />
      <path d="M16 20h16M16 26h10" />
    </svg>
  );
}
