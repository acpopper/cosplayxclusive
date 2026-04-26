import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { MessagesSidebar, type SidebarConv } from './messages-sidebar'
import type { Profile } from '@/lib/types'

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/messages')

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, participant_a, participant_b, created_at')
    .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)

  const convIds = (conversations ?? []).map((c) => c.id)

  // Other participants
  const otherIds = (conversations ?? []).map((c) =>
    c.participant_a === user.id ? c.participant_b : c.participant_a,
  )
  const profileMap: Record<string, {
    id: string; username: string; display_name: string | null; avatar_url: string | null; role: string
  }> = {}
  if (otherIds.length > 0) {
    const { data: others } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, role')
      .in('id', otherIds)
    for (const p of others ?? []) profileMap[p.id] = p
  }

  // Last message per conversation — single query, dedupe in JS.
  const lastMessageMap: Record<string, {
    body: string
    media_paths: string[]
    sender_id: string
    created_at: string
  }> = {}
  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, body, media_paths, sender_id, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(convIds.length * 10)

    for (const m of msgs ?? []) {
      if (!lastMessageMap[m.conversation_id]) {
        lastMessageMap[m.conversation_id] = {
          body: m.body ?? '',
          media_paths: (m as { media_paths?: string[] }).media_paths ?? [],
          sender_id: m.sender_id,
          created_at: m.created_at,
        }
      }
    }
  }

  // Read receipts + favorites for the viewer
  const readMap: Record<string, string> = {}
  const favoriteSet = new Set<string>()

  if (convIds.length > 0) {
    const [{ data: reads }, { data: favorites }] = await Promise.all([
      supabase
        .from('conversation_reads')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id)
        .in('conversation_id', convIds),
      supabase
        .from('conversation_favorites')
        .select('conversation_id')
        .eq('user_id', user.id)
        .in('conversation_id', convIds),
    ])
    for (const r of reads ?? []) readMap[r.conversation_id] = r.last_read_at
    for (const f of favorites ?? []) favoriteSet.add(f.conversation_id)
  }

  const convList: SidebarConv[] = (conversations ?? [])
    .map((c) => {
      const otherId = c.participant_a === user.id ? c.participant_b : c.participant_a
      const lastMsg = lastMessageMap[c.id] ?? null
      const lastReadAt = readMap[c.id] ?? null
      const unread =
        !!lastMsg &&
        lastMsg.sender_id !== user.id &&
        (!lastReadAt || lastMsg.created_at > lastReadAt)
      return {
        id: c.id,
        created_at: c.created_at,
        other: profileMap[otherId] ?? null,
        last_message: lastMsg,
        unread,
        favorite: favoriteSet.has(c.id),
      }
    })
    .sort((a, b) => {
      const tA = a.last_message?.created_at ?? a.created_at
      const tB = b.last_message?.created_at ?? b.created_at
      return tB.localeCompare(tA)
    })

  return (
    <div className="h-[100dvh] bg-bg-base flex flex-col">
      <Nav profile={viewerProfile as Profile} />

      <div className="flex-1 min-h-0 mx-auto w-full max-w-6xl md:px-4 md:py-6 flex">
        <div className="flex-1 flex md:rounded-2xl md:border md:border-border md:bg-bg-card overflow-hidden min-h-0">
          <MessagesSidebar
            currentUserId={user.id}
            initialConversations={convList}
          />
          <section className="flex-1 min-w-0 flex flex-col bg-bg-base md:bg-bg-card min-h-0">
            {children}
          </section>
        </div>
      </div>
    </div>
  )
}
