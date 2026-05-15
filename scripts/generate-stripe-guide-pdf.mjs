// Generates public/stripe-setup-guide.pdf — a starter "Before you start" guide
// for creators connecting their Stripe account. Hand-crafted minimal PDF (no
// dependencies) so we can ship it as a static asset without a runtime PDF lib.
//
// Run: node scripts/generate-stripe-guide-pdf.mjs

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ─── content ─────────────────────────────────────────────────────────────────
// One page, Helvetica family. Lines are positioned absolutely (PDF y-axis grows
// upward; (0,0) is bottom-left). MediaBox is US Letter (612 × 792).

const PAGE_W = 612
const TOP    = 760
const LEFT   = 56
const ACCENT = '0.878 0.251 0.478' // #e0407a (accent pink) — used for headings

// Each entry: [text, fontTag, size, x, y, color?]
// fontTag: 'B' = Helvetica-Bold, 'R' = Helvetica, 'I' = Helvetica-Oblique
const LINES = []
let y = TOP

function pushLine(text, font, size, color) {
  LINES.push({ text, font, size, x: LEFT, y, color })
  y -= size + 4
}
function pushGap(px) { y -= px }
function pushBullet(text, font = 'R', size = 11) {
  LINES.push({ text: '•', font: 'R', size, x: LEFT, y })
  LINES.push({ text, font, size, x: LEFT + 14, y })
  y -= size + 4
}

// Title
pushLine('Before You Start: Connecting Stripe', 'B', 20, ACCENT)
pushGap(6)
pushLine('A quick checklist so your onboarding goes smoothly.', 'I', 11)
pushGap(14)

// Section 1
pushLine('1. Have these ready', 'B', 13)
pushGap(2)
pushBullet('Legal full name (as it appears on government ID).')
pushBullet('Date of birth and home address.')
pushBullet('Government-issued photo ID (passport, driver license, etc.).')
pushBullet('Last 4 digits of your SSN (US) or local tax ID.')
pushBullet('Bank account & routing numbers for payouts.')
pushBullet('A phone number you can receive SMS codes on.')
pushGap(8)

// Section 2
pushLine('2. What Stripe will ask', 'B', 13)
pushGap(2)
pushBullet('Business type: pick "Individual" if you are paid as yourself.')
pushBullet('Industry: choose "Adult content" or "Digital media" (Stripe may ask).')
pushBullet('Website: use https://cosplayxclusive.com/yourusername')
pushBullet('Product description: subscription content, tips, and pay-per-view media.')
pushBullet('Statement descriptor: short text shown on fan card statements.')
pushGap(8)

// Section 3
pushLine('3. Tips for fast approval', 'B', 13)
pushGap(2)
pushBullet('Use the same name on Stripe as on your ID. Mismatches trigger review.')
pushBullet('Upload a clear, well-lit photo of your ID (no glare, all 4 corners).')
pushBullet('Make sure your bank account is in the same legal name.')
pushBullet('If Stripe pauses payouts, check email/dashboard for requested documents.')
pushGap(8)

// Section 4
pushLine('4. After you finish', 'B', 13)
pushGap(2)
pushBullet('You’ll be sent back to your CosplayXclusive payouts tab.')
pushBullet('Status flips to "Active" once Stripe approves — usually within minutes.')
pushBullet('First payout typically arrives ~7 days after your first sale.')
pushBullet('Manage your account anytime from dashboard.stripe.com.')
pushGap(12)

pushLine('Need help? Email support@cosplayxclusive.com', 'I', 10)

// ─── PDF construction ────────────────────────────────────────────────────────
// PDF strings need parens-escaped. Helvetica only supports WinAnsi-ish chars;
// we keep it ASCII-safe by escaping a few unicode chars to their octal codes.
function escText(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/•/g, '\\267')   // bullet
    .replace(/’/g, "'")        // curly apostrophe -> straight
}

function fontRef(tag) {
  if (tag === 'B') return '/F2'
  if (tag === 'I') return '/F3'
  return '/F1'
}

function buildContentStream() {
  const ops = ['BT']
  let curColor = null
  for (const line of LINES) {
    const color = line.color ?? '0.157 0.157 0.184' // dark text
    if (color !== curColor) {
      ops.push(`${color} rg`)
      curColor = color
    }
    ops.push(`${fontRef(line.font)} ${line.size} Tf`)
    ops.push(`1 0 0 1 ${line.x} ${line.y} Tm`)
    ops.push(`(${escText(line.text)}) Tj`)
  }
  ops.push('ET')
  return ops.join('\n')
}

const content = buildContentStream()

// Object list — order matters because the xref records byte offsets
const objects = [
  // 1: Catalog
  '<< /Type /Catalog /Pages 2 0 R >>',
  // 2: Pages
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  // 3: Page
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} 792] `
    + '/Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> '
    + '/Contents 7 0 R >>',
  // 4-6: Fonts
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>',
  // 7: Page content stream
  `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`,
]

const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
let body = ''
const offsets = [0] // object 0 is reserved
for (let i = 0; i < objects.length; i++) {
  const objNum = i + 1
  offsets.push(Buffer.byteLength(header + body, 'binary'))
  body += `${objNum} 0 obj\n${objects[i]}\nendobj\n`
}

// xref table
const xrefStart = Buffer.byteLength(header + body, 'binary')
let xref = `xref\n0 ${objects.length + 1}\n`
xref += '0000000000 65535 f \n'
for (let i = 1; i <= objects.length; i++) {
  xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'
}

const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

const pdf = Buffer.concat([
  Buffer.from(header, 'binary'),
  Buffer.from(body, 'binary'),
  Buffer.from(xref, 'binary'),
  Buffer.from(trailer, 'binary'),
])

const outPath = join(process.cwd(), 'public', 'stripe-setup-guide.pdf')
writeFileSync(outPath, pdf)
console.log(`Wrote ${pdf.length} bytes -> ${outPath}`)
