const SIGHTENGINE_URL = 'https://api.sightengine.com/1.0/check.json'

// Intensity classes — these are hierarchical: triggering one implies all weaker
// ones are also present. Threshold tuned per class.
const INTENSITY_THRESHOLDS: Record<string, number> = {
  sexual_activity: 0.50,
  sexual_display:  0.50,
  erotica:         0.50,
  very_suggestive: 0.70,
}

// A small set of fine-grained suggestive sub-classes worth surfacing on top of
// the intensity classes (these capture cases the intensity classes can miss,
// e.g. visible nudity outside an erotic context, or sex-toy props).
const SUGGESTIVE_THRESHOLDS: Record<string, number> = {
  visibly_undressed: 0.60,
  sextoy:            0.50,
}

// Hate symbols & terrorist imagery (offensive-2.0). Aggressive thresholds for
// the genuinely harmful classes; the middle finger is harmless, so it only
// trips when the model is very confident.
const OFFENSIVE_THRESHOLDS: Record<string, number> = {
  nazi:           0.50,
  asian_swastika: 0.50,
  confederate:    0.50,
  supremacist:    0.50,
  terrorist:      0.50,
  middle_finger:  0.80,
}

// face-age model: per-face probability that the subject is a minor. Image is
// flagged if ANY detected face exceeds this.
const MINOR_THRESHOLD = 0.50

export interface NudityIntensity {
  sexual_activity?:   number
  sexual_display?:    number
  erotica?:           number
  very_suggestive?:   number
  suggestive?:        number
  mildly_suggestive?: number
  none?:              number
}

export interface SuggestiveClasses {
  visibly_undressed?:    number
  sextoy?:               number
  suggestive_focus?:     number
  suggestive_pose?:      number
  lingerie?:             number
  male_underwear?:       number
  cleavage?:             number
  cleavage_categories?:  { very_revealing?: number; revealing?: number; none?: number }
  male_chest?:           number
  male_chest_categories?: { very_revealing?: number; revealing?: number; slightly_revealing?: number; none?: number }
  nudity_art?:           number
  schematic?:            number
  bikini?:               number
  swimwear_one_piece?:   number
  swimwear_male?:        number
  minishort?:            number
  miniskirt?:            number
  other?:                number
}

export interface NudityV2 extends NudityIntensity {
  suggestive_classes?: SuggestiveClasses
  context?: { sea_lake_pool?: number; outdoor_other?: number; indoor_other?: number }
}

export interface OffensiveClasses {
  nazi?:           number
  asian_swastika?: number
  confederate?:    number
  supremacist?:    number
  terrorist?:      number
  middle_finger?:  number
}

export interface FaceWithAge {
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  attributes?: {
    age?: { minor?: number }
  }
}

export interface DetectionScores {
  nudity?:           NudityV2
  offensive?:        OffensiveClasses
  faces?:            FaceWithAge[]
  artificial_faces?: FaceWithAge[]
}

export interface ContentFlagResult {
  flagged:    boolean
  /**
   * Prefixed category keys. Examples:
   *   - 'nudity:sexual_activity'
   *   - 'suggestive:sextoy'
   *   - 'offensive:nazi'
   *   - 'minor:detected'   (any face exceeded MINOR_THRESHOLD)
   */
  categories: string[]
  /** Highest score across all evaluated categories (flagged or not) */
  maxScore:   number
  /** Full Sightengine response, kept verbatim for audit / admin display */
  scores:     DetectionScores
}

const EMPTY: ContentFlagResult = { flagged: false, categories: [], maxScore: 0, scores: {} }

export async function checkImageContent(
  buffer: Buffer,
  contentType: string,
): Promise<ContentFlagResult> {
  const apiUser   = process.env.SIGHTENGINE_API_USER
  const apiSecret = process.env.SIGHTENGINE_API_SECRET

  if (!apiUser || !apiSecret) {
    console.warn('[sightengine] missing SIGHTENGINE_API_USER/SECRET — skipping check')
    return EMPTY
  }

  const MODEL = 'nudity-2.1,offensive-2.0,face-age'

  const form = new FormData()
  form.append('api_user',   apiUser)
  form.append('api_secret', apiSecret)
  form.append('models',     MODEL)
  form.append('media',      new Blob([new Uint8Array(buffer)], { type: contentType }), 'image')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  console.log(`[sightengine] POST ${SIGHTENGINE_URL} models=${MODEL} contentType=${contentType} bytes=${buffer.length}`)

  try {
    const res = await fetch(SIGHTENGINE_URL, {
      method: 'POST',
      body:   form,
      signal: controller.signal,
    })
    clearTimeout(timer)

    const rawText = await res.text()
    console.log(`[sightengine] status=${res.status} body=${rawText.slice(0, 2000)}`)

    if (!res.ok) return EMPTY

    let data: {
      status?:           string
      nudity?:           NudityV2
      offensive?:        OffensiveClasses
      faces?:            FaceWithAge[]
      artificial_faces?: FaceWithAge[]
    }
    try {
      data = JSON.parse(rawText)
    } catch (err) {
      console.error('[sightengine] failed to parse response JSON', err)
      return EMPTY
    }
    if (data.status !== 'success') {
      console.warn('[sightengine] non-success response', { status: data.status })
      return EMPTY
    }

    const categories: string[] = []
    let maxScore = 0

    if (data.nudity) {
      const intensityScores = data.nudity as Record<string, number | undefined>
      for (const [key, threshold] of Object.entries(INTENSITY_THRESHOLDS)) {
        const score = intensityScores[key] ?? 0
        if (score >= threshold) categories.push(`nudity:${key}`)
        if (score > maxScore) maxScore = score
      }

      const suggestiveScores = (data.nudity.suggestive_classes ?? {}) as Record<string, number | undefined>
      for (const [key, threshold] of Object.entries(SUGGESTIVE_THRESHOLDS)) {
        const score = suggestiveScores[key] ?? 0
        if (score >= threshold) categories.push(`suggestive:${key}`)
        if (score > maxScore) maxScore = score
      }
    }

    if (data.offensive) {
      const offensiveScores = data.offensive as Record<string, number | undefined>
      for (const [key, threshold] of Object.entries(OFFENSIVE_THRESHOLDS)) {
        const score = offensiveScores[key] ?? 0
        if (score >= threshold) categories.push(`offensive:${key}`)
        if (score > maxScore) maxScore = score
      }
    }

    // face-age: flag if ANY detected face is likely a minor
    const faces = [...(data.faces ?? []), ...(data.artificial_faces ?? [])]
    let maxMinor = 0
    for (const face of faces) {
      const m = face.attributes?.age?.minor ?? 0
      if (m > maxMinor) maxMinor = m
    }
    if (maxMinor >= MINOR_THRESHOLD) categories.push('minor:detected')
    if (maxMinor > maxScore) maxScore = maxMinor

    const scores: DetectionScores = {
      nudity:           data.nudity,
      offensive:        data.offensive,
      faces:            data.faces,
      artificial_faces: data.artificial_faces,
    }

    console.log('[sightengine] result', { flagged: categories.length > 0, categories, maxScore })
    return { flagged: categories.length > 0, categories, maxScore, scores }
  } catch (err) {
    clearTimeout(timer)
    console.error('[sightengine] request failed', err)
    return EMPTY
  }
}
