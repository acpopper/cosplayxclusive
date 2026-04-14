import type { SupabaseClient } from '@supabase/supabase-js'

export interface NotificationActor {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

const MILESTONE_STEP = 10
const MAX_STORED_ACTORS = 5 // keep latest 5 actors in the stacked payload

/**
 * Upsert a grouped (stacked) notification for a post event.
 *
 * - If a notification already exists for (creator, group_key): add the actor to the
 *   front of the actors array, increment actor_count, reset read_at so it re-appears
 *   as unread, bump last_activity_at.
 * - If no notification exists: create one.
 * - Returns the new total actor_count so the caller can check milestones.
 */
export async function upsertGroupedNotification(
  service: SupabaseClient,
  opts: {
    creatorId: string
    groupKey: string
    type: 'post_liked' | 'post_commented' | 'post_tipped'
    actor: NotificationActor
    postId: string
    postCaption: string | null
    /** Extra fields merged into the payload (e.g. sample_comment, total_tip_amount) */
    extra?: Record<string, unknown>
  }
): Promise<number> {
  const { creatorId, groupKey, type, actor, postId, postCaption, extra = {} } = opts
  const now = new Date().toISOString()

  // Read existing grouped notification
  const { data: existing } = await service
    .from('notifications')
    .select('id, payload')
    .eq('user_id', creatorId)
    .eq('group_key', groupKey)
    .maybeSingle()

  if (existing) {
    const prev = existing.payload as {
      actors?: NotificationActor[]
      actor_count?: number
      [key: string]: unknown
    }
    const prevActors: NotificationActor[] = prev.actors ?? []
    const alreadyPresent = prevActors.some((a) => a.user_id === actor.user_id)

    // Put new actor at front, deduplicate, cap at MAX_STORED_ACTORS
    const merged = [actor, ...prevActors.filter((a) => a.user_id !== actor.user_id)]
      .slice(0, MAX_STORED_ACTORS)

    const prevCount = prev.actor_count ?? prevActors.length
    const newCount = alreadyPresent ? prevCount : prevCount + 1

    await service
      .from('notifications')
      .update({
        read_at: null,           // re-mark unread on new activity
        last_activity_at: now,
        payload: {
          ...prev,
          ...extra,
          actors: merged,
          actor_count: newCount,
        },
      })
      .eq('id', existing.id)

    return newCount
  }

  // Create fresh grouped notification
  await service.from('notifications').insert({
    user_id: creatorId,
    type,
    group_key: groupKey,
    last_activity_at: now,
    payload: {
      post_id: postId,
      post_caption: postCaption,
      actors: [actor],
      actor_count: 1,
      ...extra,
    },
  })

  return 1
}

/**
 * Insert a milestone notification (not grouped — each milestone is its own row).
 * Only fires when count is an exact multiple of MILESTONE_STEP.
 */
export async function maybeSendMilestone(
  service: SupabaseClient,
  opts: {
    creatorId: string
    type: 'post_like_milestone' | 'post_comment_milestone' | 'post_tip_milestone'
    postId: string
    postCaption: string | null
    count: number
    extra?: Record<string, unknown>
  }
): Promise<void> {
  const { creatorId, type, postId, postCaption, count, extra = {} } = opts
  if (count <= 0 || count % MILESTONE_STEP !== 0) return

  await service.from('notifications').insert({
    user_id: creatorId,
    type,
    group_key: null, // milestones are never stacked
    last_activity_at: new Date().toISOString(),
    payload: {
      post_id: postId,
      post_caption: postCaption,
      milestone: count,
      ...extra,
    },
  })
}
