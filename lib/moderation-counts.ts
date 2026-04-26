import { createServiceClient } from '@/lib/supabase/server'

export interface ModerationCounts {
  flaggedChats: number
  reports:      number
  mediaFlags:   number
  total:        number
}

/**
 * Counts of unresolved items across all moderation queues. Powers the badges
 * on the moderation tabs and the sidebar nav. Always counts distinct entities
 * (conversations / posts / image flags) — not raw flag rows — so a single
 * conversation flagged 5 times still only counts as 1.
 */
export async function getModerationCounts(): Promise<ModerationCounts> {
  const service = createServiceClient()

  const [flaggedRows, reportRows, { count: mediaFlagsCount }] = await Promise.all([
    service
      .from('flagged_messages')
      .select('conversation_id')
      .is('resolved_at', null)
      .limit(1000),
    service
      .from('post_reports')
      .select('post_id')
      .is('resolved_at', null)
      .limit(1000),
    service
      .from('image_content_flags')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null),
  ])

  const flaggedChats = new Set(
    (flaggedRows.data ?? []).map((r) => (r as { conversation_id: string }).conversation_id),
  ).size

  const reports = new Set(
    (reportRows.data ?? []).map((r) => (r as { post_id: string }).post_id),
  ).size

  const mediaFlags = mediaFlagsCount ?? 0

  return {
    flaggedChats,
    reports,
    mediaFlags,
    total: flaggedChats + reports + mediaFlags,
  }
}
