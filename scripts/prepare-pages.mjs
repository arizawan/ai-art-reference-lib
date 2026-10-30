#!/usr/bin/env node
/**
 * Writes data/galleries/config.json for Cloudflare Pages builds.
 * Set GALLERY_ASSET_BASE to the public CDN origin (B2 behind Cloudflare), e.g.
 *   https://assets.example.com
 * Leave unset for same-origin mounts (local npm run galleries:offline).
 */
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data', 'galleries', 'config.json')
const assetBase = (process.env.GALLERY_ASSET_BASE || '').trim().replace(/\/$/, '')

const body = {
  assetBase,
  ...(assetBase ? { assetHost: new URL(assetBase).origin } : {}),
}

await writeFile(OUT, `${JSON.stringify(body, null, 2)}\n`)
console.log(`Wrote ${OUT} assetBase=${assetBase || '(empty — use local /portrait … mounts)'}`)
