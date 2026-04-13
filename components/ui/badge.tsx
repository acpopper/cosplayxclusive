type Variant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'muted'

interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  className?: string
}

const variants: Record<Variant, string> = {
  default: 'bg-bg-elevated border border-border text-text-secondary',
  accent: 'bg-accent-muted border border-accent/20 text-accent',
  success: 'bg-success/10 border border-success/20 text-success',
  warning: 'bg-warning/10 border border-warning/20 text-warning',
  error: 'bg-error/10 border border-error/20 text-error',
  muted: 'bg-bg-card text-text-muted',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
