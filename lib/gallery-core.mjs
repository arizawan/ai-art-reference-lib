#!/usr/bin/env node
/**
 * Shared read-only gallery data layer for MCP / future REST.
 * Never writes under data/*-gallery/.
 */
import { readFile, access, constants as fsConstants, stat } from 'node:fs/promises'
import { join, dirname, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const LIBS = {
  portrait: {
    id: 'portrait',
    title: 'Portrait',
    dir: join(ROOT, 'data', 'portrait-gallery'),
    mount: '/portrait',
    assetKinds: ['thumb', 'original'],
  },
  pose: {
    id: 'pose',
    title: 'Pose',
    dir: join(ROOT, 'data', 'pose-gallery'),
    mount: '/pose',
    assetKinds: ['thumb', 'original'],
  },
  depth: {
    id: 'depth',
    title: 'Depth',
    dir: join(ROOT, 'data', 'pose-depth-gallery'),
    mount: '/depth',
    assetKinds: ['thumb', 'original'],
  },
  costume: {
    id: 'costume',
    title: 'Costume',
    dir: join(ROOT, 'data', 'costume-gallery'),
    mount: '/costume',
    assetKinds: ['thumb', 'preview', 'original'],
  },
}

const cache = new Map()

export function dataRoot() {
  return process.env.GALLERY_DATA_ROOT ? normalize(process.env.GALLERY_DATA_ROOT) : ROOT
}

async function exists(path) {
  try {
    await access(path, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

export async function loadLibrary(id) {
  const lib = LIBS[id]
  if (!lib) throw Object.assign(new Error(`Unknown library: ${id}`), { code: 'UNKNOWN_LIBRARY' })
  if (cache.has(id)) return cache.get(id)
  const root = dataRoot()
  const dir = lib.dir.startsWith(ROOT) ? join(root, lib.dir.slice(ROOT.length + 1)) : lib.dir
  const cuesPath = join(dir, 'cues.json')
  const payload = JSON.parse(await readFile(cuesPath, 'utf8'))
  const cues = Array.isArray(payload.cues) ? payload.cues : []
  const byId = new Map(cues.map((c) => [c.id, c]))
  const packed = { ...lib, dir, meta: payload, cues, byId }
  cache.set(id, packed)
  return packed
}

export async function listLibraries({ includeRegen = false } = {}) {
  const libraries = []
  for (const id of Object.keys(LIBS)) {
    const lib = await loadLibrary(id)
    libraries.push({
      id,
      title: lib.meta.sourceTitle || lib.title,
      mount: lib.mount,
      cueCount: lib.cues.length,
      source: lib.meta.source || null,
      dataDir: `data/${id === 'depth' ? 'pose-depth' : id}-gallery`.replace('pose-depth-gallery', 'pose-depth-gallery'),
      assetKinds: lib.assetKinds,
      scrapedAt: lib.meta.scrapedAt || null,
      sourceNote: lib.meta.sourceNote || null,
    })
  }
  // fix depth dataDir
  const depth = libraries.find((l) => l.id === 'depth')
  if (depth) depth.dataDir = 'data/pose-depth-gallery'
  return {
    libraries,
    meta: {
      dataRoot: dataRoot(),
      publicBase: (process.env.GALLERY_PUBLIC_BASE_URL || '').replace(/\/$/, '') || null,
      offlineBase: (process.env.GALLERIES_BASE_URL || 'http://127.0.0.1:5188').replace(/\/$/, ''),
    },
  }
}

function searchBlob(c) {
  return [
    c.id,
    c.label,
    c.text,
    ...(c.tags || []),
    c.style,
    c.classification,
    c.poseNumber,
    c.categoryLabel,
    c.hairLabel,
    c.line,
    c.angle,
    c.section,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function scoreHit(c, tokens) {
  const blob = searchBlob(c)
  let score = 0
  for (const t of tokens) {
    if (!blob.includes(t)) return -1
    if (String(c.id).toLowerCase().startsWith(t)) score += 8
    else if (String(c.id).toLowerCase().includes(t)) score += 4
    else score += 1
  }
  return score
}

export async function searchCues({
  library = 'all',
  query = '',
  filters = {},
  limit = 50,
  offset = 0,
} = {}) {
  const ids = library === 'all'
    ? Object.keys(LIBS)
    : Array.isArray(library)
      ? library
      : [library]
  const tokens = String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  const hits = []
  for (const id of ids) {
    if (!LIBS[id]) continue
    const lib = await loadLibrary(id)
    for (const c of lib.cues) {
      if (filters.line && c.line !== filters.line) continue
      if (filters.classification && c.classification !== filters.classification) continue
      if (filters.angle && c.angle !== filters.angle) continue
      if (filters.poseNumber && String(c.poseNumber) !== String(filters.poseNumber)) continue
      if (filters.category && c.category !== filters.category) continue
      if (filters.style && c.style !== filters.style) continue
      if (filters.section && c.section !== filters.section) continue
      if (filters.hair && c.hair !== filters.hair) continue
      const score = tokens.length ? scoreHit(c, tokens) : 1
      if (score < 0) continue
      const sp = c.sourcePaths || {}
      hits.push({
        library: id,
        id: c.id,
        label: c.label,
        line: c.line || null,
        classification: c.classification || null,
        category: c.category || null,
        score,
        thumbUrl: resolveUrl(id, sp.thumb, 'offline'),
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  const total = hits.length
  const slice = hits.slice(offset, offset + Math.min(Math.max(limit, 1), 200))
  return { total, offset, limit: Math.min(Math.max(limit, 1), 200), hits: slice }
}

function safeJoin(root, rel) {
  const full = normalize(join(root, rel))
  if (!full.startsWith(root + sep) && full !== root) return null
  return full
}

export function resolveUrl(libraryId, rel, mode = 'auto') {
  if (!rel) return null
  const lib = LIBS[libraryId]
  if (!lib) return null
  const clean = String(rel).replace(/^\//, '')
  const publicBase = (process.env.GALLERY_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const offlineBase = (process.env.GALLERIES_BASE_URL || 'http://127.0.0.1:5188').replace(/\/$/, '')
  const picked =
    mode === 'public' ? 'public'
      : mode === 'offline' ? 'offline'
        : mode === 'origin' ? 'origin'
          : publicBase ? 'public' : 'offline'
  if (picked === 'public' && publicBase) return `${publicBase}${lib.mount}/${clean}`
  if (picked === 'offline') return `${offlineBase}${lib.mount}/${clean}`
  return null
}

export async function getCue({ library, id, includeUrls = true, verifyFiles = false }) {
  const lib = await loadLibrary(library)
  const cue = lib.byId.get(id)
  if (!cue) throw Object.assign(new Error(`Cue not found: ${library}/${id}`), { code: 'NOT_FOUND' })
  const sp = cue.sourcePaths || {}
  const assets = {}
  for (const kind of lib.assetKinds) {
    const rel = sp[kind]
    const localPath = rel ? safeJoin(lib.dir, rel) : null
    let local = { exists: false, bytes: null }
    if (verifyFiles && localPath) {
      try {
        const st = await stat(localPath)
        local = { exists: true, bytes: st.size }
      } catch {
        local = { exists: false, bytes: null }
      }
    } else if (localPath) {
      local.exists = await exists(localPath)
    }
    assets[kind] = {
      kind,
      sourcePath: rel || null,
      local,
      urls: includeUrls
        ? {
            offline: resolveUrl(library, rel, 'offline'),
            public: resolveUrl(library, rel, 'public'),
            origin: cue.images?.[kind] || cue.images?.full || null,
          }
        : undefined,
    }
  }
  const related = {}
  if (cue.poseNumber != null) {
    related.poseGroup = cue.poseNumber
    related.siblingIds = lib.cues
      .filter((c) => c.poseNumber === cue.poseNumber && c.line === cue.line)
      .map((c) => c.id)
  }
  return {
    library,
    cue,
    assets,
    related,
    licenseNote: lib.meta.sourceNote || null,
  }
}

export async function getAssetUrl({ library, id, kind = 'original', urlMode = 'auto' }) {
  const got = await getCue({ library, id, includeUrls: true, verifyFiles: true })
  const asset = got.assets[kind]
  if (!asset?.sourcePath) {
    throw Object.assign(new Error(`No ${kind} for ${library}/${id}`), { code: 'NO_ASSET' })
  }
  const resolvedMode = urlMode === 'auto'
    ? ((process.env.GALLERY_PUBLIC_BASE_URL || '').trim() ? 'public' : 'offline')
    : urlMode
  const url = resolveUrl(library, asset.sourcePath, resolvedMode)
  const localPath = safeJoin((await loadLibrary(library)).dir, asset.sourcePath)
  return {
    library,
    id,
    kind,
    sourcePath: asset.sourcePath,
    url,
    urlMode: resolvedMode,
    urls: {
      offline: resolveUrl(library, asset.sourcePath, 'offline'),
      public: resolveUrl(library, asset.sourcePath, 'public'),
      origin: asset.urls?.origin || null,
    },
    localPath,
    local: asset.local,
    mimeType: mimeForPath(asset.sourcePath),
    licenseNote: got.licenseNote,
  }
}

function mimeForPath(rel) {
  const lower = String(rel || '').toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

/** Read local gallery bytes for MCP image content (full-size when kind=original). */
export async function readAssetBytes({ library, id, kind = 'original' }) {
  const meta = await getAssetUrl({ library, id, kind, urlMode: 'offline' })
  if (!meta.localPath || !meta.local?.exists) {
    throw Object.assign(new Error(`Local file missing for ${library}/${id}/${kind}`), { code: 'MISSING_FILE' })
  }
  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(meta.localPath)
  return {
    ...meta,
    bytes: buf.length,
    base64: buf.toString('base64'),
  }
}
