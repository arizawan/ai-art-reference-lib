#!/usr/bin/env node
/**
 * Offline browser for scraped COSTUME / POSE / POSE-DEPTH / PORTRAIT under data/.
 *   npm run galleries:offline
 *   → http://127.0.0.1:5188/
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.env.GALLERIES_PORT || 5188)
const HOST = process.env.GALLERIES_HOST || '127.0.0.1'

const MOUNTS = {
  '/': join(ROOT, 'data', 'galleries'),
  '/costume': join(ROOT, 'data', 'costume-gallery'),
  '/pose': join(ROOT, 'data', 'pose-gallery'),
  '/depth': join(ROOT, 'data', 'pose-depth-gallery'),
  '/portrait': join(ROOT, 'data', 'portrait-gallery'),
  '/regen': join(ROOT, 'data', 'gallery-regen', 'out'),
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0] || '/')
  let mount = '/'
  let rest = clean
  for (const prefix of ['/costume', '/pose', '/depth', '/portrait', '/regen']) {
    if (clean === prefix || clean.startsWith(prefix + '/')) {
      mount = prefix
      rest = clean.slice(prefix.length) || '/'
      break
    }
  }
  const base = MOUNTS[mount]
  let rel = rest === '/' ? 'index.html' : rest.replace(/^\//, '')
  if (rel.endsWith('/')) rel += 'index.html'
  const full = normalize(join(base, rel))
  if (!full.startsWith(base + sep) && full !== base) return null
  return full
}

const server = createServer(async (req, res) => {
  try {
    const file = resolve(req.url || '/')
    if (!file) {
      res.writeHead(403).end('Forbidden')
      return
    }
    const info = await stat(file)
    if (!info.isFile()) {
      res.writeHead(404).end('Not found')
      return
    }
    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': body.length,
    })
    res.end(body)
  } catch (err) {
    if (err && err.code === 'ENOENT') res.writeHead(404).end('Not found')
    else {
      console.error(err)
      res.writeHead(500).end('Error')
    }
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Offline galleries → http://${HOST}:${PORT}/`)
  console.log(`  costume → http://${HOST}:${PORT}/costume/`)
  console.log(`  pose    → http://${HOST}:${PORT}/pose/`)
  console.log(`  depth   → http://${HOST}:${PORT}/depth/`)
  console.log(`  portrait→ http://${HOST}:${PORT}/portrait/`)
  console.log(`  regen   → http://${HOST}:${PORT}/regen/`)
})
