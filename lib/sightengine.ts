const SIGHTENGINE_URL = 'https://api.sightengine.com/1.0/check.json'

// Thresholds for flagging each nudity sub-category
const THRESHOLDS: Record<string, number> = {
  sexual_activity: 0.50,
  sexual_display:  0.50,
  erotica:         0.50,
  very_suggestive: 0.80,
}

export interface NudityScores {
  sexual_activity: number
  sexual_display:  number
  erotica:         number
  very_suggestive: number
  suggestive:      number
  mildly_suggestive: number
  none:            number
  [key: string]: number
}

export interface ContentFlagResult {
  flagged:    boolean
  categories: string[]   // e.g. ['nudity:sexual_activity']
  maxScore:   number
  scores:     { nudity?: NudityScores }
}

export async function checkImageContent(
  buffer: Buffer,
  contentType: string,
): Promise<ContentFlagResult> {
  const apiUser   = process.env.SIGHTENGINE_API_USER
  const apiSecret = process.env.SIGHTENGINE_API_SECRET

  if (!apiUser || !apiSecret) {
    return { flagged: false, categories: [], maxScore: 0, scores: {} }
  }

  const form = new FormData()
  form.append('api_user',   apiUser)
  form.append('api_secret', apiSecret)
  form.append('models',     'nudity')
  form.append('media',      new Blob([new Uint8Array(buffer)], { type: contentType }), 'image')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(SIGHTENGINE_URL, {
      method: 'POST',
      body:   form,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) return { flagged: false, categories: [], maxScore: 0, scores: {} }

    const data = (await res.json()) as { status: string; nudity?: NudityScores }
    if (data.status !== 'success' || !data.nudity) {
      return { flagged: false, categories: [], maxScore: 0, scores: {} }
    }

    const nudity = data.nudity
    const categories: string[] = []

    for (const [key, threshold] of Object.entries(THRESHOLDS)) {
      if ((nudity[key] ?? 0) >= threshold) {
        categories.push(`nudity:${key}`)
      }
    }

    const maxScore = Math.max(0, ...Object.keys(THRESHOLDS).map((k) => nudity[k] ?? 0))

    return { flagged: categories.length > 0, categories, maxScore, scores: { nudity } }
  } catch {
    clearTimeout(timer)
    return { flagged: false, categories: [], maxScore: 0, scores: {} }
  }
}
