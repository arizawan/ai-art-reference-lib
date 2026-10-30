import { cn } from '@/lib/utils'

export function Badge({
  className,
  variant = 'secondary',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: 'secondary' | 'outline' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variant === 'secondary' && 'border-border bg-muted text-muted-foreground',
        variant === 'outline' && 'border-border bg-transparent text-foreground',
        className,
      )}
      {...props}
    />
  )
}
