import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'

export function LazyImage({
  src,
  alt,
  className,
  eager = false,
}: {
  src: string
  alt: string
  className?: string
  eager?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(eager)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (eager) {
      setShown(true)
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [eager, src])

  useEffect(() => {
    setLoaded(false)
    setError(false)
  }, [src])

  return (
    <div ref={ref} className={cn('relative overflow-hidden bg-muted', className)}>
      {!loaded && !error && (
        <>
          <Skeleton className="absolute inset-0 rounded-none" />
          {shown && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-muted/40">
              <Spinner label="" className="text-muted-foreground" />
            </div>
          )}
        </>
      )}
      {shown && (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'low'}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={cn(
            'relative z-[2] h-full w-full object-cover transition-opacity duration-200',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      {error && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center text-xs text-muted-foreground">
          Failed
        </div>
      )}
    </div>
  )
}
