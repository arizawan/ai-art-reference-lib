export type LibId = 'portrait' | 'pose' | 'depth' | 'costume'

export const LIBS: Record<LibId, { label: string; mount: string; aspect: 'face' | 'pose' | 'costume' }> = {
  portrait: { label: 'Portrait', mount: '/portrait', aspect: 'face' },
  pose: { label: 'Pose', mount: '/pose', aspect: 'pose' },
  depth: { label: 'Depth', mount: '/depth', aspect: 'pose' },
  costume: { label: 'Costume', mount: '/costume', aspect: 'costume' },
}

export type Cue = {
  id: string
  label?: string
  text?: string
  tags?: string[]
  section?: string
  sectionLabel?: string
  hair?: string
  hairLabel?: string
  style?: string
  category?: string
  categoryLabel?: string
  line?: string
  lineLabel?: string
  poseNumber?: string | number
  classification?: string
  angle?: string
  sourcePaths?: { thumb?: string; preview?: string; original?: string }
  thumbUrl?: string
  previewUrl?: string
  fullUrl?: string
  lib?: LibId
}

let ASSET_BASE = ''

export async function loadConfig() {
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return
  try {
    const res = await fetch('/config.json', { cache: 'no-store' })
    if (!res.ok) return
    const cfg = await res.json()
    if (typeof cfg.assetBase === 'string') ASSET_BASE = cfg.assetBase.replace(/\/$/, '')
  } catch {
    /* ignore */
  }
}

function libRoot(mount: string) {
  return ASSET_BASE ? ASSET_BASE + mount : mount
}

function assetPath(mount: string, rel?: string) {
  if (!rel) return undefined
  return `${libRoot(mount)}/${rel.replace(/^\//, '')}`
}

const libCache = new Map<LibId, { meta: Record<string, unknown>; cues: Cue[] }>()

export async function loadLib(name: LibId) {
  const hit = libCache.get(name)
  if (hit) return hit
  const mount = LIBS[name].mount
  const res = await fetch(`${libRoot(mount)}/cues.json`)
  if (!res.ok) throw new Error(`Failed to load ${name}`)
  const json = await res.json()
  const cues: Cue[] = (json.cues || []).map((c: Cue) => {
    const sp = c.sourcePaths || {}
    return {
      ...c,
      lib: name,
      thumbUrl: assetPath(mount, sp.thumb),
      previewUrl: assetPath(mount, sp.preview),
      fullUrl: assetPath(mount, sp.original),
    }
  })
  const packed = { meta: json as Record<string, unknown>, cues }
  libCache.set(name, packed)
  return packed
}

export function textHit(c: Cue, q: string) {
  if (!q) return true
  const blob = [c.id, c.label, c.text, ...(c.tags || []), c.style, c.classification, c.poseNumber, c.categoryLabel, c.hairLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return q.split(/\s+/).every((w) => blob.includes(w))
}

export function groupPoses(cues: Cue[]) {
  const map = new Map<string, {
    key: string
    line?: string
    poseNumber?: string | number
    label?: string
    classification?: string
    lineLabel?: string
    angles: Record<string, Cue>
    items: Cue[]
  }>()
  for (const c of cues) {
    const key = `${c.line}|${c.poseNumber}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        line: c.line,
        poseNumber: c.poseNumber,
        label: c.label,
        classification: c.classification,
        lineLabel: c.lineLabel,
        angles: {},
        items: [],
      })
    }
    const g = map.get(key)!
    g.items.push(c)
    if (c.angle) g.angles[c.angle] = c
  }
  return [...map.values()]
}

export function portraitTitle(c: Cue) {
  return c.style || c.label || c.id
}
