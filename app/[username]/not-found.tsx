import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-5xl mb-4">✦</p>
        <h1 className="text-2xl font-bold text-text-primary mb-2">Creator not found</h1>
        <p className="text-text-secondary text-sm mb-6">
          This profile doesn&apos;t exist or hasn&apos;t been approved yet.
        </p>
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 h-10 px-5 rounded-xl font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Explore creators
        </Link>
      </div>
    </div>
  )
}
