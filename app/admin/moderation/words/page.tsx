import { createServiceClient } from '@/lib/supabase/server'
import { ModerationTabs } from '../tabs'
import { WordsPanel, type ModerationRule } from './word-list'
import { getModerationCounts } from '@/lib/moderation-counts'

export default async function WarningWordsPage() {
  const service = createServiceClient()

  const [{ data: rules }, counts] = await Promise.all([
    service
      .from('moderation_rules')
      .select('id, pattern, is_regex, created_at')
      .order('created_at', { ascending: false }),
    getModerationCounts(),
  ])

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Moderation</h1>
        <p className="text-sm text-text-secondary mt-1">Keep chat safe with custom warning patterns</p>
      </div>
      <ModerationTabs
        flaggedCount={counts.flaggedChats}
        reportsCount={counts.reports}
        mediaFlagsCount={counts.mediaFlags}
      />
      <WordsPanel initialRules={(rules ?? []) as ModerationRule[]} />
    </>
  )
}
