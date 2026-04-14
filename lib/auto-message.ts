import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * If a creator has configured an auto-message for new or returning subscribers,
 * this function creates (or reuses) the conversation and sends that message as
 * the creator — server-side only, using the service-role client.
 *
 * @param service   Service-role Supabase client (bypasses RLS)
 * @param fanId     The fan who just subscribed
 * @param creatorId The creator they subscribed to
 * @param isReturn  true = returning subscriber (previously canceled), false = first-time
 */
export async function maybeSendAutoMessage(
  service: SupabaseClient,
  fanId: string,
  creatorId: string,
  isReturn: boolean
): Promise<void> {
  // Fetch creator's auto-message config
  const { data: cfg } = await service
    .from('creator_automessages')
    .select('new_sub_text, new_sub_media, returning_sub_text, returning_sub_media')
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (!cfg) return

  const text = isReturn ? cfg.returning_sub_text : cfg.new_sub_text
  const media: string[] = isReturn
    ? (cfg.returning_sub_media ?? [])
    : (cfg.new_sub_media ?? [])

  // Nothing to send?
  if (!text?.trim() && media.length === 0) return

  // Ensure conversation exists (normalize participant order lexicographically)
  const [participantA, participantB] = [creatorId, fanId].sort()

  let conversationId: string

  const { data: existing } = await service
    .from('conversations')
    .select('id')
    .eq('participant_a', participantA)
    .eq('participant_b', participantB)
    .maybeSingle()

  if (existing) {
    conversationId = existing.id
  } else {
    const { data: created, error } = await service
      .from('conversations')
      .insert({ participant_a: participantA, participant_b: participantB })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[auto-message] failed to create conversation', error)
      return
    }
    conversationId = created.id
  }

  // Send the auto-message as the creator
  const { error: msgErr } = await service
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: creatorId,
      body: text?.trim() ?? '',
      media_paths: media,
    })

  if (msgErr) {
    console.error('[auto-message] failed to send message', msgErr)
  }
}

/**
 * Detect if a fan is a *returning* subscriber (had a previous canceled subscription).
 */
export async function isReturningSubscriber(
  service: SupabaseClient,
  fanId: string,
  creatorId: string
): Promise<boolean> {
  const { data } = await service
    .from('subscriptions')
    .select('id')
    .eq('fan_id', fanId)
    .eq('creator_id', creatorId)
    .eq('status', 'canceled')
    .limit(1)
    .maybeSingle()

  return !!data
}
