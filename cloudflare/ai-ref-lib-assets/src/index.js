/**
 * Proxies /portrait|/pose|/depth|/costume from B2 onto ai-ref-lib.arizawan.com
 * Secrets: B2_KEY_ID, B2_APPLICATION_KEY
 * Edge-caches originals/thumbs at Cloudflare for fast repeat loads.
 */
const PREFIXES = ['portrait', 'pose', 'depth', 'costume']
const BUCKET = 'ai-art-reference-lib'

let cachedAuth = null
let cachedAuthAt = 0
const AUTH_TTL_MS = 12 * 60 * 60 * 1000

async function authorize(env) {
  const now = Date.now()
  if (cachedAuth && now - cachedAuthAt < AUTH_TTL_MS) return cachedAuth
  const token = btoa(`${env.B2_KEY_ID}:${env.B2_APPLICATION_KEY}`)
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${token}` },
  })
  if (!res.ok) throw new Error(`b2_authorize_account ${res.status}`)
  cachedAuth = await res.json()
  cachedAuthAt = now
  return cachedAuth
}

function matchPrefix(pathname) {
  for (const p of PREFIXES) {
    if (pathname === `/${p}` || pathname.startsWith(`/${p}/`)) return p
  }
  return null
}

function cacheControlForKey(key) {
  if (key.endsWith('cues.json')) return 'public, max-age=300, stale-while-revalidate=3600'
  return 'public, max-age=31536000, immutable'
}

function withCors(headers) {
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Accept-Ranges, Content-Range, ETag')
  headers.set('Timing-Allow-Origin', '*')
  headers.delete('x-bz-file-id')
  headers.delete('Authorization')
  return headers
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, If-None-Match',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    const prefix = matchPrefix(url.pathname)
    if (!prefix) {
      return new Response('Not found', { status: 404 })
    }

    const key = url.pathname.replace(/^\//, '')
    const cacheable = request.method === 'GET' || request.method === 'HEAD'
    const cache = caches.default
    const cacheKey = new Request(url.toString(), { method: 'GET' })

    if (cacheable && !request.headers.get('Range')) {
      const hit = await cache.match(cacheKey)
      if (hit) {
        const headers = withCors(new Headers(hit.headers))
        headers.set('CF-Cache-Status', 'HIT')
        if (request.method === 'HEAD') {
          return new Response(null, { status: hit.status, headers })
        }
        return new Response(hit.body, { status: hit.status, headers })
      }
    }

    try {
      const auth = await authorize(env)
      const upstream = `${auth.downloadUrl}/file/${BUCKET}/${key}`
      const headers = new Headers()
      headers.set('Authorization', auth.authorizationToken)
      if (request.headers.get('Range')) headers.set('Range', request.headers.get('Range'))
      if (request.headers.get('If-None-Match')) headers.set('If-None-Match', request.headers.get('If-None-Match'))

      const up = await fetch(upstream, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        cf: {
          cacheTtlByStatus: { '200-299': key.endsWith('cues.json') ? 300 : 31536000, '404': 60 },
          cacheEverything: true,
        },
      })

      const out = withCors(new Headers(up.headers))
      out.set('Cache-Control', cacheControlForKey(key))
      out.set('CF-Cache-Status', 'MISS')
      const wantDownload = url.searchParams.has('download') || url.searchParams.has('dl')
      if (wantDownload && up.status === 200) {
        const fileName = key.split('/').pop() || 'reference.png'
        out.set('Content-Disposition', `attachment; filename="${fileName}"`)
      }

      const response = new Response(request.method === 'HEAD' ? null : up.body, {
        status: up.status,
        headers: out,
      })

      // Cache only non-download GETs (download query would poison CDN with attachment headers)
      if (cacheable && up.status === 200 && !request.headers.get('Range') && !wantDownload) {
        const toStore = response.clone()
        const storeHeaders = new Headers(toStore.headers)
        storeHeaders.set('Cache-Control', cacheControlForKey(key))
        ctx.waitUntil(cache.put(cacheKey, new Response(toStore.body, { status: 200, headers: storeHeaders })))
      }

      return response
    } catch (err) {
      return new Response(`Upstream error: ${err.message}`, { status: 502 })
    }
  },
}
