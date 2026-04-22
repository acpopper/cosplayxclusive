import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-border mt-16 py-8 px-4">
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-muted">
        <div className="flex items-center gap-2">
          <span className="text-accent">✦</span>
          <span className="font-semibold text-text-secondary">CosplayXclusive</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">© {new Date().getFullYear()} Aquarix LLC. All rights reserved.</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/terms" className="hover:text-text-primary transition-colors">
            Terms &amp; Conditions
          </Link>
          <Link href="/privacy" className="hover:text-text-primary transition-colors">
            Privacy Policy
          </Link>
          <a href="mailto:support@cosplayxclusive.com" className="hover:text-text-primary transition-colors">
            Support
          </a>
        </div>
        <p className="sm:hidden text-xs text-center">© {new Date().getFullYear()} Aquarix LLC. All rights reserved.</p>
      </div>
    </footer>
  )
}
