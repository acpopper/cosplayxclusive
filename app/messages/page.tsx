import Link from 'next/link'

export default function MessagesIndexPage() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center p-10">
      <div className="text-center max-w-xs">
        <div className="mx-auto mb-5 h-20 w-20 rounded-full border-2 border-text-muted/40 flex items-center justify-center">
          <svg
            className="h-9 w-9 text-text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 12l20-9-9 20-2-9-9-2z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-text-primary">Your messages</h2>
        <p className="text-sm text-text-muted mt-1 mb-5">
          Select a chat from the list, or start a new conversation.
        </p>
        <Link
          href="/messages/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          New message
        </Link>
      </div>
    </div>
  )
}
