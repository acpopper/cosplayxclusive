import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

export const metadata: Metadata = {
  title: 'CosplayXclusive — Premium Cosplay Creator Platform',
  description:
    'Subscribe to your favorite cosplay creators. Exclusive content, premium photos, and direct fan support.',
  openGraph: {
    title: 'CosplayXclusive',
    description: 'Premium cosplay creator platform',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
