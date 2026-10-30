/**
 * Proxies /portrait|/pose|/depth|/costume from B2 onto ai-ref-lib.arizawan.com
 * Secrets: B2_KEY_ID, B2_APPLICATION_KEY
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const prefix = matchPrefix(url.pathname)
    if (!prefix) {
      return new Response('Not found', { status: 404 })
    }

    const key = url.pathname.replace(/^\//, '') // portrait/...
    try {
      const auth = await authorize(env)
      const upstream = `${auth.downloadUrl}/file/${BUCKET}/${key}`
      const headers = new Headers()
      headers.set('Authorization', auth.authorizationToken)
      if (request.headers.get('Range')) headers.set('Range', request.headers.get('Range'))

      const up = await fetch(upstream, { method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers })
      const out = new Headers(up.headers)
      out.set('Access-Control-Allow-Origin', '*')
      out.set('Cache-Control', key.endsWith('cues.json')
        ? 'public, max-age=300'
        : 'public, max-age=31536000, immutable')
      // drop b2 auth leakage
      out.delete('x-bz-file-id')
      return new Response(up.body, { status: up.status, headers: out })
    } catch (err) {
      return new Response(`Upstream error: ${err.message}`, { status: 502 })
    }
  },
}
