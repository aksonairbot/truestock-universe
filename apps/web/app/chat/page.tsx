// apps/web/app/chat/page.tsx
//
// Server component: fetches initial data, renders client chat shell.

export const dynamic = "force-dynamic";

import { getCurrentUser } from "@/lib/auth";
import { getMyChannels, getChatUsers } from "./actions";
import ChatShell from "./chat-shell";

export default async function ChatPage() {
  const me = await getCurrentUser();
  const [channels, users] = await Promise.all([getMyChannels(), getChatUsers()]);

  return (
    <ChatShell
      me={{ id: me.id, name: me.name, avatarUrl: me.avatarUrl }}
      initialChannels={channels}
      allUsers={users}
    />
  );
}
