import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * High-confidence NSFW detection threshold. Sightengine returns a probability
 * between 0 and 1; anything at or above this is treated as a confirmed strike
 * for auto-suspension. Lower-confidence flags still land in the moderation
 * queue but do not count toward the 3-strike limit.
 */
export const NSFW_STRIKE_THRESHOLD = 0.9

/**
 * Auto-suspend a creator once they accumulate this many image_content_flags
 * rows whose `max_score` meets {@link NSFW_STRIKE_THRESHOLD}.
 */
export const NSFW_STRIKE_LIMIT = 3

interface CheckResult {
  /** Total qualifying flags for this creator. */
  strikes:   number
  /** True if this call transitioned the creator into the 'suspended' state. */
  suspended: boolean
}

/**
 * Counts the creator's high-confidence NSFW flags and suspends their account
 * once they reach {@link NSFW_STRIKE_LIMIT}. Safe to call right after a batch
 * of flag inserts; uses the service client because the `image_content_flags`
 * table is admin-only under RLS.
 *
 * Idempotent: if the creator is already suspended, no profile update is sent.
 */
export async function checkAndSuspendForNsfw(
  service: SupabaseClient,
  creatorId: string,
): Promise<CheckResult> {
  const { count } = await service
    .from('image_content_flags')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', creatorId)
    .gte('max_score', NSFW_STRIKE_THRESHOLD)

  const strikes = count ?? 0
  if (strikes < NSFW_STRIKE_LIMIT) return { strikes, suspended: false }

  const { data: profile } = await service
    .from('profiles')
    .select('creator_status')
    .eq('id', creatorId)
    .single()

  if (!profile || profile.creator_status === 'suspended') {
    return { strikes, suspended: false }
  }

  const { error } = await service
    .from('profiles')
    .update({ creator_status: 'suspended' })
    .eq('id', creatorId)

  if (error) {
    console.error('[nsfw-strikes] failed to suspend creator', creatorId, error.message)
    return { strikes, suspended: false }
  }

  console.warn(`[nsfw-strikes] creator ${creatorId} auto-suspended after ${strikes} high-confidence NSFW flags`)
  return { strikes, suspended: true }
}
