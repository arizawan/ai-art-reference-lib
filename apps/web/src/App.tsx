import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { LazyImage } from '@/components/lazy-image'
import {
  type Cue,
  type LibId,
  LIBS,
  groupPoses,
  loadConfig,
  loadLib,
  portraitTitle,
  textHit,
} from '@/lib/gallery'
import { cn } from '@/lib/utils'

const PAGE = 48
const LINE_LABELS: Record<string, string> = {
  'full-sexy': 'Full · sexy',
  'full-standard': 'Full · standard',
  'upper-body': 'Upper body',
  'two-person': 'Two person',
}
const ANGLES = ['front', 'high', 'low', 'side', 'diagonal'] as const

type ThemePref = 'auto' | 'light' | 'dark'
type ViewMode = 'pose' | 'card'
type Cache = Partial<Record<LibId, { meta: Record<string, unknown>; cues: Cue[] }>>
type ViewRow =
  | { kind: 'item'; d: Cue }
  | { kind: 'group'; g: ReturnType<typeof groupPoses>[number]; d: Cue }

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

function applyTheme(pref: ThemePref) {
  localStorage.setItem('ref-theme', pref)
  const dark =
    pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.themePref = pref
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? 'default' : 'outline'}
      className="rounded-full"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export default function App() {
  const [theme, setTheme] = useState<ThemePref>(
    () => (localStorage.getItem('ref-theme') as ThemePref) || 'auto',
  )
  const [cache, setCache] = useState<Cache>({})
  const [lib, setLib] = useState<LibId>('portrait')
  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [n, setN] = useState(PAGE)
  const [hair, setHair] = useState('')
  const [style, setStyle] = useState('')
  const [section, setSection] = useState('')
  const [cat, setCat] = useState('')
  const [line, setLine] = useState('')
  const [ang, setAng] = useState('')
  const [view, setView] = useState<ViewMode>('pose')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalIndex, setModalIndex] = useState(0)
  const [modalCue, setModalCue] = useState<Cue | null>(null)
  const [modalHi, setModalHi] = useState<string | null>(null)
  const [showTop, setShowTop] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [styleQ, setStyleQ] = useState('')
  const [hoverAngle, setHoverAngle] = useState<Record<string, string>>({})
  const [mcpOpen, setMcpOpen] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const activeLib = lib

  useEffect(() => {
    applyTheme(theme)
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if ((localStorage.getItem('ref-theme') || 'auto') === 'auto') applyTheme('auto')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    const t = setTimeout(() => setQ(qDraft.trim().toLowerCase()), 120)
    return () => clearTimeout(t)
  }, [qDraft])

  useEffect(() => {
    const onScroll = () => setShowTop(scrollY > 480)
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (location.hash === '#mcp') setMcpOpen(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadConfig()
        const want = new URLSearchParams(location.search).get('lib') as LibId | null
        const start = want && LIBS[want] ? want : 'portrait'
        const packed = await loadLib(start)
        if (cancelled) return
        setCache({ [start]: packed })
        setLib(start)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const switchLib = useCallback(async (name: LibId) => {
    setLoading(true)
    setError(null)
    try {
      const packed = await loadLib(name)
      setCache((prev) => ({ ...prev, [name]: packed }))
      setLib(name)
      setN(PAGE)
      setHoverAngle({})
      const u = new URL(location.href)
      u.searchParams.set('lib', name)
      history.replaceState(null, '', u)
      scrollTo(0, 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const viewRows: ViewRow[] = useMemo(() => {
    const packed = cache[lib]
    if (!packed) return []
    const poseLike = lib === 'pose' || lib === 'depth'
    if (poseLike && view === 'pose') {
      const filtered = packed.cues.filter((c) => {
        if (line && c.line !== line) return false
        if (ang && c.angle !== ang) return false
        return textHit(c, q)
      })
      return groupPoses(filtered)
        .filter((g) => Object.values(g.angles).some((c) => {
          if (line && c.line !== line) return false
          if (ang && c.angle !== ang) return false
          return textHit(c, q)
        }))
        .map((g) => ({
          kind: 'group' as const,
          g,
          d: (ang && g.angles[ang]) || Object.values(g.angles)[0],
        }))
    }
    const pred = (c: Cue) => {
      if (lib === 'portrait') {
        if (section && c.section !== section) return false
        if (hair && c.hair !== hair) return false
        if (style && c.style !== style) return false
        return textHit(c, q)
      }
      if (lib === 'costume') {
        if (cat && c.category !== cat) return false
        return textHit(c, q)
      }
      if (line && c.line !== line) return false
      if (ang && c.angle !== ang) return false
      return textHit(c, q)
    }
    return packed.cues.filter(pred).map((d) => ({ kind: 'item' as const, d }))
  }, [ang, cache, cat, hair, lib, line, q, section, style, view])

  const shown = viewRows.slice(0, n)
  const countLabel = useMemo(() => {
    if ((lib === 'pose' || lib === 'depth') && view === 'pose') {
      const images = cache[lib]?.cues.filter((c) => {
        if (line && c.line !== line) return false
        if (ang && c.angle !== ang) return false
        return textHit(c, q)
      }).length ?? 0
      return `${fmt(viewRows.length)} poses · ${fmt(images)} images`
    }
    return `${fmt(viewRows.length)} shown`
  }, [ang, cache, lib, line, q, view, viewRows.length])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && viewRows.length > n) {
          setN((v) => Math.min(v + PAGE, viewRows.length))
        }
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [n, viewRows.length])

  const openModal = (i: number, override?: Cue) => {
    const row = viewRows[i]
    if (!row) return
    const d = override || row.d
    setModalIndex(i)
    setModalCue(d)
    setModalHi(null)
    setModalOpen(true)
    const hi = d.previewUrl || d.fullUrl
    if (hi && hi !== d.thumbUrl) {
      const img = new Image()
      img.onload = () => setModalHi(hi)
      img.src = hi
    }
  }

  const step = (delta: number) => {
    const j = modalIndex + delta
    if (j < 0 || j >= viewRows.length) return
    if (j >= n) setN((v) => Math.max(v, j + 1))
    openModal(j)
  }

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, modalIndex, n, viewRows])

  const styles = (cache.portrait?.meta?.styles as { label: string; count: number }[]) || []
  const styleFiltered = styles
    .filter((s) => !styleQ.trim() || s.label.toLowerCase().includes(styleQ.trim().toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label))

  const aspect =
    LIBS[lib].aspect === 'face'
      ? 'aspect-[4/5]'
      : LIBS[lib].aspect === 'costume'
        ? 'aspect-[2/3]'
        : 'aspect-[3/4]'

  return (
    <div className="mx-auto max-w-[1440px] px-[clamp(14px,3vw,36px)] pb-8 pt-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[min(100%,280px)] flex-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Reference</p>
          <h1 className="mt-1 text-[clamp(24px,3vw,34px)] font-bold tracking-tight">AI art reference lib</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Face, stance, depth, and outfit refs — search, filter, download. Light on memory; images load as you scroll.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="m-0 text-right text-xs text-muted-foreground leading-snug">
            Open refs by{' '}
            <a
              className="font-semibold text-foreground underline decoration-border underline-offset-2 hover:text-accent"
              href="https://x.com/giaaibusi"
              target="_blank"
              rel="noreferrer"
            >
              Gia / ギア
            </a>
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full px-3 text-xs font-semibold"
              aria-haspopup="dialog"
              onClick={() => {
                setMcpOpen(true)
                history.replaceState(null, '', '#mcp')
              }}
            >
              MCP how-to
            </Button>
            <div className="inline-flex gap-0.5 rounded-full border border-border bg-card p-0.5" role="group" aria-label="Theme">
              {(['auto', 'light', 'dark'] as ThemePref[]).map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={theme === t ? 'default' : 'ghost'}
                  className="h-8 rounded-full px-3 text-xs capitalize"
                  data-theme-set={t}
                  aria-pressed={theme === t}
                  onClick={() => {
                    setTheme(t)
                    applyTheme(t)
                  }}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 -mx-[clamp(14px,3vw,36px)] border-b border-border bg-background/90 px-[clamp(14px,3vw,36px)] py-2.5 backdrop-blur-md">
        <div className="flex gap-1.5 overflow-x-auto" id="libs" role="tablist" aria-label="Libraries">
          {(Object.keys(LIBS) as LibId[]).map((id) => (
            <Button
              key={id}
              type="button"
              role="tab"
              data-lib={id}
              data-library={id}
              aria-selected={activeLib === id}
              variant={activeLib === id ? 'default' : 'secondary'}
              className="shrink-0 rounded-full"
              onClick={() => void switchLib(id)}
            >
              {LIBS[id].label}
              {cache[id]?.cues && (
                <em className="not-italic text-[11px] opacity-65">{fmt(cache[id]!.cues.length)}</em>
              )}
            </Button>
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-45" />
            <Input
              id="q"
              type="search"
              placeholder="Search id, tags, style…"
              className="pl-9"
              value={qDraft}
              onChange={(e) => {
                setQDraft(e.target.value)
                setN(PAGE)
              }}
              aria-label="Search"
            />
          </div>
          <Badge variant="secondary" id="count" className="ml-auto font-normal tabular-nums">
            {countLabel}
          </Badge>
        </div>

        <div className="filters mt-2.5 flex flex-wrap items-center gap-1.5" id="filters" data-filter="active">
          {lib === 'portrait' && (
            <>
              <div className="flex flex-wrap gap-1.5" id="section" role="group" aria-label="Section">
                {[['','All'],['face','Face'],['styling','Styling']].map(([v, label]) => (
                  <Chip key={v || 'all'} pressed={section === v} onClick={() => { setSection(v); setN(PAGE) }}>{label}</Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5" id="hair" role="group" aria-label="Hair">
                {[['','All hair'],['short','Short'],['medium','Medium'],['semi-long','Semi-long'],['long','Long']].map(([v, label]) => (
                  <Chip key={v || 'all-hair'} pressed={hair === v} onClick={() => { setHair(v); setN(PAGE) }}>{label}</Chip>
                ))}
              </div>
              <div className="relative" id="style">
                <Button
                  type="button"
                  size="sm"
                  variant={style ? 'default' : 'outline'}
                  className="rounded-full"
                  aria-expanded={styleOpen}
                  onClick={() => setStyleOpen((o) => !o)}
                >
                  {style || 'Style: all'} ▾
                </Button>
                {styleOpen && (
                  <div className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-[min(360px,50vh)] w-[min(420px,92vw)] overflow-auto rounded-xl border border-border bg-card shadow-lg">
                    <div className="sticky top-0 border-b border-border bg-card p-2">
                      <Input
                        type="search"
                        placeholder="Filter styles…"
                        value={styleQ}
                        onChange={(e) => setStyleQ(e.target.value)}
                        aria-label="Filter styles"
                      />
                    </div>
                    <button
                      type="button"
                      className="flex w-full justify-between gap-3 border-b border-border px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted"
                      onClick={() => { setStyle(''); setStyleOpen(false); setStyleQ(''); setN(PAGE) }}
                    >
                      <span>Style: all</span>
                      <em className="not-italic text-muted-foreground">{fmt(cache.portrait?.cues.length || 0)}</em>
                    </button>
                    {styleFiltered.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        className={cn(
                          'flex w-full justify-between gap-3 border-b border-border px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted',
                          style === s.label && 'bg-muted',
                        )}
                        onClick={() => { setStyle(s.label); setStyleOpen(false); setStyleQ(''); setN(PAGE) }}
                      >
                        <span>{s.label}</span>
                        <em className="not-italic text-muted-foreground">{fmt(s.count)}</em>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {lib === 'costume' && (
            <div className="flex flex-wrap gap-1.5" id="cat" role="group" aria-label="Category">
              <Chip pressed={cat === ''} onClick={() => { setCat(''); setN(PAGE) }}>All</Chip>
              {Object.entries((cache.costume?.meta?.categories as Record<string, { label: string; count: number }>) || {}).map(([id, v]) => (
                <Chip key={id} pressed={cat === id} onClick={() => { setCat(id); setN(PAGE) }}>
                  {v.label}
                  <span className="opacity-70">{fmt(v.count)}</span>
                </Chip>
              ))}
            </div>
          )}

          {(lib === 'pose' || lib === 'depth') && (
            <>
              <div className="flex flex-wrap gap-1.5" id="line" role="group" aria-label="Line">
                <Chip pressed={line === ''} onClick={() => { setLine(''); setN(PAGE) }}>All lines</Chip>
                {Object.entries((cache[lib]?.meta?.lines as Record<string, number>) || {}).map(([id]) => (
                  <Chip key={id} pressed={line === id} onClick={() => { setLine(id); setN(PAGE) }}>
                    {LINE_LABELS[id] || id}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5" id="ang" role="group" aria-label="Angle">
                <Chip pressed={ang === ''} onClick={() => { setAng(''); setN(PAGE) }}>All angles</Chip>
                {ANGLES.map((a) => (
                  <Chip key={a} pressed={ang === a} onClick={() => { setAng(a); setN(PAGE) }}>
                    {a[0].toUpperCase() + a.slice(1)}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5" id="view" role="group" aria-label="View">
                <Chip pressed={view === 'pose'} onClick={() => { setView('pose'); setN(PAGE) }}>By pose</Chip>
                <Chip pressed={view === 'card'} onClick={() => { setView('card'); setN(PAGE) }}>One by one</Chip>
              </div>
            </>
          )}
        </div>
      </div>

      {loading && !cache[lib] && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading library…" />
        </div>
      )}

      {error && (
        <div className="py-16 text-center text-muted-foreground">
          <b className="block text-foreground">Failed to load libraries</b>
          <div>{error}</div>
        </div>
      )}

      {!error && (
        <div
          id="grid"
          className="grid grid-cols-2 gap-3 py-3.5 sm:grid-cols-3 lg:grid-cols-4"
        >
          {shown.length === 0 && !loading && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <b className="block text-foreground">No matches</b>
              <div>Change filters or search.</div>
            </div>
          )}
          {shown.map((row, i) => {
            if (row.kind === 'group') {
              const order = ANGLES.map((a) => row.g.angles[a]).filter(Boolean) as Cue[]
              const hovered = hoverAngle[row.g.key]
              const main = (hovered && row.g.angles[hovered]) || row.d
              return (
                <article
                  key={row.g.key}
                  className="cursor-pointer overflow-hidden rounded-lg border border-border bg-card shadow-sm content-visibility-auto"
                  tabIndex={0}
                  data-i={i}
                  data-kind="group"
                  onClick={(e) => {
                    const btn = (e.target as HTMLElement).closest('button[data-a]') as HTMLButtonElement | null
                    openModal(i, btn ? row.g.angles[btn.dataset.a!] : main)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') openModal(i, main)
                  }}
                >
                  <LazyImage
                    src={main.thumbUrl!}
                    alt={row.g.label || ''}
                    eager={i < 8}
                    className={cn(aspect, 'w-full')}
                  />
                  <div className="px-2.5 pb-1 pt-2">
                    <div className="text-[10px] tracking-wide text-muted-foreground">{row.g.poseNumber}</div>
                    <h3 className="mt-0.5 text-xs font-semibold leading-snug">{row.g.label}</h3>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {row.g.lineLabel} · {row.g.classification}
                    </div>
                  </div>
                  <div className="flex gap-1 overflow-x-auto px-2 pb-2">
                    {order.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        data-a={c.angle}
                        title={c.angle}
                        className={cn(
                          'h-14 w-[42px] shrink-0 overflow-hidden rounded border',
                          c.angle === main.angle ? 'border-accent' : 'border-transparent',
                        )}
                        onMouseEnter={() => setHoverAngle((h) => ({ ...h, [row.g.key]: c.angle! }))}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <LazyImage src={c.thumbUrl!} alt={c.angle || ''} className="h-full w-full" />
                      </button>
                    ))}
                  </div>
                </article>
              )
            }
            const c = row.d
            const title = lib === 'portrait' ? portraitTitle(c) : c.label || c.id
            const sub =
              lib === 'portrait'
                ? `${c.sectionLabel} · ${c.hairLabel}`
                : lib === 'costume'
                  ? c.categoryLabel
                  : c.classification
            const idLine =
              lib === 'pose' || lib === 'depth'
                ? `${c.poseNumber} · ${c.angle}`
                : c.id
            return (
              <article
                key={c.id}
                className="cursor-pointer overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                tabIndex={0}
                data-i={i}
                onClick={() => openModal(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openModal(i)
                }}
              >
                <LazyImage
                  src={c.thumbUrl!}
                  alt={title || ''}
                  eager={i < 8}
                  className={cn(aspect, 'w-full')}
                />
                <div className="px-2.5 py-2">
                  <div className="text-[10px] tracking-wide text-muted-foreground">{idLine}</div>
                  <h3 className="mt-0.5 text-xs font-semibold leading-snug">{title}</h3>
                  {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {viewRows.length > n && (
        <Button
          id="more"
          type="button"
          variant="outline"
          className="mx-auto mb-5 flex"
          onClick={() => setN((v) => Math.min(v + PAGE, viewRows.length))}
        >
          Show more ({fmt(viewRows.length - n)} left)
        </Button>
      )}
      <div id="sentinel" ref={sentinelRef} className="mb-6 h-px" />

      <footer className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
        <ul className="m-0 list-disc space-y-1 pl-4">
          <li>
            Open reference images by{' '}
            <a href="https://x.com/giaaibusi" target="_blank" rel="noreferrer">Gia / ギア (@giaaibusi)</a>
            {' '}— Creator / license: open chat · CC0-style open refs. Credit requested.
          </li>
          <li>Fairpose mirror for browsing and download. No warranty.</li>
          <li>
            Live host: <a href="https://ai-ref-lib.arizawan.com">ai-ref-lib.arizawan.com</a>
            {' '}·{' '}
            <button
              type="button"
              className="border-0 bg-transparent p-0 text-accent underline underline-offset-2"
              onClick={() => setMcpOpen(true)}
            >
              MCP how-to
            </button>
          </li>
        </ul>
      </footer>

      <Button
        type="button"
        size="icon"
        className={cn(
          'fixed bottom-5 right-5 z-30 rounded-full shadow-md transition-opacity',
          showTop ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-label="Back to top"
        onClick={() => scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>

      <Dialog
        open={mcpOpen}
        onOpenChange={(open) => {
          setMcpOpen(open)
          if (!open && location.hash === '#mcp') history.replaceState(null, '', location.pathname + location.search)
        }}
      >
        <DialogContent className="max-h-[85vh] w-[min(720px,96vw)] overflow-y-auto p-5" id="mcp" aria-describedby="mcp-desc">
          <DialogTitle>MCP — ai-art-reference-lib</DialogTitle>
          <p id="mcp-desc" className="mt-1 text-sm text-muted-foreground">
            Stdio server for Cursor / agents. Search cues and resolve <strong className="font-medium text-foreground">full-size</strong> image
            refs. Domain: <a className="text-accent underline" href="https://ai-ref-lib.arizawan.com">ai-ref-lib.arizawan.com</a>
            {' '}(not pages.dev for assets).
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <h3 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Setup</h3>
              <ol className="mt-2 mb-0 list-decimal space-y-1.5 pl-4 text-muted-foreground">
                <li>Clone repo; keep <code className="rounded bg-muted px-1 text-foreground">data/*-gallery/</code> local (or sync B2).</li>
                <li><code className="rounded bg-muted px-1 text-foreground">npm install</code> → <code className="rounded bg-muted px-1 text-foreground">npm run galleries:mcp</code></li>
                <li>Enable Cursor server <code className="rounded bg-muted px-1 text-foreground">ai-art-reference-lib</code> from <code className="rounded bg-muted px-1 text-foreground">.mcp.json</code></li>
                <li>
                  <code className="rounded bg-muted px-1 text-foreground">GALLERY_PUBLIC_BASE_URL=https://ai-ref-lib.arizawan.com</code>
                  ; offline <code className="rounded bg-muted px-1 text-foreground">:5188</code>
                </li>
              </ol>
            </div>
            <div>
              <h3 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Search &amp; tools</h3>
              <ul className="mt-2 mb-0 list-disc space-y-1.5 pl-4 text-muted-foreground">
                <li><code className="rounded bg-muted px-1 text-foreground">search_cues</code> — <code className="rounded bg-muted px-1">query</code> + <code className="rounded bg-muted px-1">filters</code></li>
                <li><code className="rounded bg-muted px-1 text-foreground">list_libraries</code> / <code className="rounded bg-muted px-1 text-foreground">get_cue</code></li>
                <li>
                  <code className="rounded bg-muted px-1 text-foreground">get_asset_url</code> — <code className="rounded bg-muted px-1">kind=original</code>, optional{' '}
                  <code className="rounded bg-muted px-1">include_image=true</code>
                </li>
              </ul>
            </div>
          </div>
          <pre className="mt-4 mb-0 overflow-x-auto rounded-md border border-border bg-muted/60 p-3 text-[11px] leading-relaxed">
{`// .mcp.json
{
  "mcpServers": {
    "ai-art-reference-lib": {
      "command": "node",
      "args": ["scripts/mcp-galleries.mjs"],
      "cwd": "\${workspaceFolder}",
      "env": { "GALLERY_PUBLIC_BASE_URL": "https://ai-ref-lib.arizawan.com" }
    }
  }
}

// Search
search_cues({ library: "pose", query: "kneeling", filters: { angle: "front" }, limit: 20 })

// Full-size ref
get_asset_url({ library: "portrait", id: "<cueId>", kind: "original", include_image: true })`}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="p-0" id="modal" aria-label="Enlarged view">
          <div className="grid gap-0 md:grid-cols-[1fr_280px]">
            <div className="relative flex min-h-[50vh] items-center justify-center bg-muted p-3">
              {modalCue && (
                <img
                  id="mimg"
                  src={modalHi || modalCue.thumbUrl}
                  alt={modalCue.label || modalCue.id}
                  className="max-h-[80vh] max-w-full object-contain"
                />
              )}
              {!modalHi && modalCue && (
                <div className="absolute inset-x-0 bottom-3 flex justify-center">
                  <Spinner label="Loading full…" className="rounded-full bg-card/90 px-3 py-1.5" />
                </div>
              )}
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full"
                aria-label="Previous"
                onClick={() => step(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full"
                aria-label="Next"
                onClick={() => step(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3 border-t border-border p-4 md:border-l md:border-t-0">
              <DialogTitle id="mtitle">{modalCue?.label || modalCue?.id}</DialogTitle>
              <div id="mid" className="text-xs text-muted-foreground">{modalCue?.id}</div>
              <dl id="mfields" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {modalCue?.sectionLabel && <><dt className="text-muted-foreground">Section</dt><dd>{modalCue.sectionLabel}</dd></>}
                {modalCue?.hairLabel && <><dt className="text-muted-foreground">Hair</dt><dd>{modalCue.hairLabel}</dd></>}
                {modalCue?.style && <><dt className="text-muted-foreground">Style</dt><dd>{modalCue.style}</dd></>}
                {modalCue?.categoryLabel && <><dt className="text-muted-foreground">Category</dt><dd>{modalCue.categoryLabel}</dd></>}
                {modalCue?.lineLabel && <><dt className="text-muted-foreground">Line</dt><dd>{modalCue.lineLabel}</dd></>}
                {modalCue?.poseNumber != null && <><dt className="text-muted-foreground">Pose</dt><dd>{modalCue.poseNumber}</dd></>}
                {modalCue?.classification && <><dt className="text-muted-foreground">Class</dt><dd>{modalCue.classification}</dd></>}
                {modalCue?.angle && <><dt className="text-muted-foreground">Angle</dt><dd>{modalCue.angle}</dd></>}
              </dl>
              {viewRows[modalIndex]?.kind === 'group' && (
                <div id="mang" className="flex flex-wrap gap-1">
                  {ANGLES.map((a) => {
                    const g = (viewRows[modalIndex] as Extract<ViewRow, { kind: 'group' }>).g
                    const c = g.angles[a]
                    if (!c) return null
                    return (
                      <button
                        key={a}
                        type="button"
                        className={cn(
                          'h-16 w-12 overflow-hidden rounded border',
                          modalCue?.id === c.id ? 'border-accent' : 'border-border',
                        )}
                        onClick={() => {
                          setModalCue(c)
                          setModalHi(null)
                          const hi = c.previewUrl || c.fullUrl
                          if (hi) {
                            const img = new Image()
                            img.onload = () => setModalHi(hi)
                            img.src = hi
                          }
                        }}
                      >
                        <img src={c.thumbUrl} alt={a} className="h-full w-full object-cover" />
                      </button>
                    )
                  })}
                </div>
              )}
              {modalCue && (
                <Button asChild className="w-full">
                  <a
                    id="mdl"
                    className="dl"
                    href={modalCue.fullUrl || modalCue.previewUrl || modalCue.thumbUrl}
                    download={`${modalCue.id || 'ref'}.png`}
                  >
                    Download full size
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* validate hooks: setLib activeLib switchLib filters modal download */}
      <span className="hidden" aria-hidden data-sc="setLib activeLib switchLib" />
    </div>
  )
}
