import sharp from 'sharp'

export interface NormalizedImage {
  /** Decoded/re-encoded image bytes ready for further processing. */
  buffer:      Buffer
  /** MIME type matching `buffer`. */
  contentType: string
  /** File extension (no leading dot) matching `buffer`. */
  ext:         string
  /** True when the input was re-encoded (i.e. HEIC → JPEG). */
  converted:   boolean
}

const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

/**
 * iPhone Photos saves images as HEIC by default. Modern iOS Safari converts
 * HEIC → JPEG when the file is picked through `<input type="file">`, but other
 * paths (share sheets, in-app pickers, non-Safari browsers) can let a HEIC
 * file through. Most desktop browsers cannot render HEIC, so storing it
 * verbatim would break previews for other users.
 *
 * This helper transcodes HEIC inputs to JPEG up front. All other formats
 * (JPEG/PNG/WebP/etc.) pass through untouched so we don't waste CPU
 * re-encoding already-web-friendly images.
 */
export async function normalizeImageInput(
  rawBuffer: Buffer,
  file: { name: string; type: string },
): Promise<NormalizedImage> {
  const lowerType = (file.type ?? '').toLowerCase()
  const isHeic = HEIC_TYPES.has(lowerType) || /\.(heic|heif)$/i.test(file.name)

  if (!isHeic) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    return {
      buffer:      rawBuffer,
      contentType: file.type || 'image/jpeg',
      ext,
      converted:   false,
    }
  }

  // .rotate() honors EXIF orientation so iPhone photos taken in landscape
  // don't end up sideways after transcoding.
  const buffer = await sharp(rawBuffer)
    .rotate()
    .jpeg({ quality: 90 })
    .toBuffer()

  return {
    buffer,
    contentType: 'image/jpeg',
    ext:         'jpg',
    converted:   true,
  }
}
